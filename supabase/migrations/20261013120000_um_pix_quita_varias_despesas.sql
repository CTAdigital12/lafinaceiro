-- Um PIX quita várias despesas.
--
-- O caso real (13/10/2026): a empresa devolveu três despesas corporativas do
-- cartão Itaú (93,90 + 573,10 + 86,58) num PIX ÚNICO de 753,58, que já estava
-- lançado na conta pelo extrato. `settle_reimbursement` (migration 20260531)
-- só previa um PIX por despesa, e isso aparecia em três pontos:
--
--  1. A lista de candidatas (`useReimbursementIncomeCandidates`) esconde a
--     receita já marcada `is_reimbursement`. Vinculada a primeira despesa, o
--     PIX some da lista e as outras duas não têm o que vincular.
--  2. Vincular uma a uma pelo cliente não é atômico: se a segunda chamada
--     falha, a primeira já levou o PIX e, pelo item 1, não dá para repetir.
--     Daí `settle_reimbursements` abaixo — o lote inteiro ou nada.
--  3. `unmark_reimbursed` desmarcava `is_reimbursement` do PIX ao reverter
--     QUALQUER despesa vinculada. Com três despesas num PIX, desfazer uma
--     devolvia os 753,58 inteiros às Receitas enquanto as outras duas seguiam
--     quitadas por ele.
--
-- O que NÃO muda: o caminho "criar receita" (p_account_id) continua 1 para 1 —
-- cada despesa ganha a própria receita em `reimbursement_payment_id`, apagada
-- no estorno. Compartilhar essa receita faria o estorno de uma despesa apagar
-- o reembolso das outras.

-- ---------------------------------------------------------------------------
-- 1. Quitação em lote
-- ---------------------------------------------------------------------------
create or replace function public.settle_reimbursements(
  p_transaction_ids uuid[],
  p_income_id uuid default null,
  p_account_id uuid default null,
  p_date date default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_transaction_ids is null or cardinality(p_transaction_ids) = 0 then
    raise exception 'informe ao menos uma despesa' using errcode = '22023';
  end if;

  -- Ordem estável: chamadas concorrentes sobre conjuntos que se cruzam travam
  -- as linhas (FOR UPDATE em settle_reimbursement) na mesma sequência.
  for v_id in
    select distinct t from unnest(p_transaction_ids) as t order by t
  loop
    perform public.settle_reimbursement(v_id, p_income_id, p_account_id, p_date);
  end loop;
end;
$$;

comment on function public.settle_reimbursements(uuid[], uuid, uuid, date) is
  'Quita várias despesas com recebimento externo numa transação só. Com '
  'p_income_id, todas passam a apontar para a MESMA receita (um PIX que cobre '
  'várias despesas); com p_account_id, cada uma ganha a sua. Regra de cada '
  'despesa em settle_reimbursement. SECURITY INVOKER — depende da RLS.';

revoke all on function public.settle_reimbursements(uuid[], uuid, uuid, date) from public;
grant execute on function public.settle_reimbursements(uuid[], uuid, uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Reverter uma despesa não desmarca o PIX que ainda quita outras
-- ---------------------------------------------------------------------------
-- Idêntica à versão de 20260828120000_recompute_card_invoice, exceto pelo
-- `not exists` no bloco da receita vinculada.
create or replace function public.unmark_reimbursed(
  p_transaction_id uuid,
  p_new_status text
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_original public.transactions%rowtype;
  v_payment_id uuid;
  v_income_id uuid;
begin
  if p_transaction_id is null then
    raise exception 'transaction id is required' using errcode = '22023';
  end if;

  if p_new_status is null or p_new_status not in ('pending', 'requested') then
    raise exception 'invalid new status (allowed: pending, requested)'
      using errcode = '22023';
  end if;

  select * into v_original
    from public.transactions
   where id = p_transaction_id
   for update;

  if v_original.id is null then
    raise exception 'transaction not found or not accessible' using errcode = '42704';
  end if;

  v_payment_id := v_original.reimbursement_payment_id;
  v_income_id  := v_original.reimbursement_income_id;

  -- Lançamento criado pelo sistema (espelho de cartão ou receita gerada): apaga.
  if v_payment_id is not null then
    delete from public.transactions
     where id = v_payment_id;
  end if;

  -- Receita preexistente vinculada (PIX do usuário): só desmarca, não apaga —
  -- e só quando esta era a ÚLTIMA despesa quitada por ela.
  if v_income_id is not null
     and not exists (
       select 1
         from public.transactions
        where reimbursement_income_id = v_income_id
          and id <> p_transaction_id
     ) then
    update public.transactions
       set is_reimbursement = false
     where id = v_income_id;
  end if;

  update public.transactions
     set reimbursement_status     = p_new_status,
         reimbursement_payment_id = null,
         reimbursement_income_id  = null
   where id = p_transaction_id;

  if v_original.credit_card_id is not null then
    perform public.recompute_card_invoice(v_original.credit_card_id);
  end if;
end;
$$;

notify pgrst, 'reload schema';
