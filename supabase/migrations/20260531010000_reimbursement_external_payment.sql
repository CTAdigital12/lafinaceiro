-- Reembolso recebido FORA da fatura do cartão (ex.: PIX / transferência numa
-- conta). Diferente de mark_reimbursed (que cria um espelho is_card_payment na
-- própria fatura), aqui o dinheiro volta como uma RECEITA na conta corrente.
--
-- Para os relatórios fecharem (despesa reembolsável já é escondida dos KPIs),
-- a receita do reembolso precisa ser NEUTRALIZADA dos totais de "Receitas".
-- Marcamos essa receita com is_reimbursement = true e o frontend a exclui dos
-- KPIs (mas NÃO do saldo — o dinheiro entrou de verdade na conta).
--
-- Dois caminhos suportados (escolha do usuário):
--   1. Vincular uma receita JÁ existente (o PIX que ele lançou): guardamos o id
--      em reimbursement_income_id e apenas marcamos is_reimbursement. No estorno
--      a receita NÃO é apagada (é um lançamento real do usuário), só desmarcada.
--   2. Criar a receita na hora numa conta: gravamos em reimbursement_payment_id
--      (mesma coluna do espelho de cartão) — no estorno ela É apagada.

-- ---------------------------------------------------------------------------
-- 1. Schema: flag de neutralização + link para receita existente
-- ---------------------------------------------------------------------------
alter table public.transactions
  add column if not exists is_reimbursement boolean not null default false;

comment on column public.transactions.is_reimbursement is
  'Marca uma RECEITA como "reembolso recebido". Excluída dos KPIs de receita '
  '(não infla os totais), mas mantida no saldo da conta (dinheiro real).';

alter table public.transactions
  add column if not exists reimbursement_income_id uuid null
    references public.transactions(id) on delete set null;

comment on column public.transactions.reimbursement_income_id is
  'Quando a despesa reembolsável é quitada vinculando uma receita JÁ existente '
  '(PIX/transferência), aponta para essa receita. Diferente de '
  'reimbursement_payment_id (que é um lançamento criado pelo sistema e apagado '
  'no estorno), esta receita é preexistente e só é desmarcada no estorno.';

create index if not exists idx_transactions_reimbursement_income_id
  on public.transactions(reimbursement_income_id)
  where reimbursement_income_id is not null;

-- ---------------------------------------------------------------------------
-- 2. RPC: quitar reembolso por recebimento externo (PIX / transferência)
-- ---------------------------------------------------------------------------
-- Parâmetros (mutuamente exclusivos):
--   p_income_id  -> vincular uma receita existente (caminho 1)
--   p_account_id -> criar a receita nesta conta (caminho 2); usa p_date.
-- Idempotente: se a despesa já está quitada, apenas normaliza o status.
-- SECURITY INVOKER: a RLS de transactions garante que só age sobre linhas do
-- próprio usuário (tanto na leitura quanto na escrita/insert).
create or replace function public.settle_reimbursement(
  p_transaction_id uuid,
  p_income_id uuid default null,
  p_account_id uuid default null,
  p_date date default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_original public.transactions%rowtype;
  v_income   public.transactions%rowtype;
  v_income_id uuid;
begin
  if p_transaction_id is null then
    raise exception 'transaction id is required' using errcode = '22023';
  end if;

  if (p_income_id is null) = (p_account_id is null) then
    raise exception 'informe exatamente um: p_income_id ou p_account_id'
      using errcode = '22023';
  end if;

  -- FOR UPDATE serializa cliques concorrentes na mesma despesa.
  select * into v_original
    from public.transactions
   where id = p_transaction_id
   for update;

  if v_original.id is null then
    raise exception 'transaction not found or not accessible' using errcode = '42704';
  end if;

  -- Idempotência: já quitada (por qualquer caminho) -> só normaliza o status.
  if v_original.reimbursement_payment_id is not null
     or v_original.reimbursement_income_id is not null then
    update public.transactions
       set reimbursement_status = 'reimbursed'
     where id = p_transaction_id;
    return coalesce(v_original.reimbursement_income_id,
                    v_original.reimbursement_payment_id);
  end if;

  if p_income_id is not null then
    -- Caminho 1: vincular receita existente. RLS valida posse no SELECT/UPDATE.
    select * into v_income
      from public.transactions
     where id = p_income_id
     for update;

    if v_income.id is null then
      raise exception 'income transaction not found or not accessible'
        using errcode = '42704';
    end if;
    if v_income.type <> 'income' then
      raise exception 'a transação vinculada precisa ser uma receita'
        using errcode = '22023';
    end if;

    update public.transactions
       set is_reimbursement = true
     where id = p_income_id;

    update public.transactions
       set reimbursement_status   = 'reimbursed',
           reimbursement_income_id = p_income_id
     where id = p_transaction_id;

    return p_income_id;
  end if;

  -- Caminho 2: criar a receita do reembolso na conta informada.
  insert into public.transactions (
    user_id, description, amount, type, date,
    account_id, credit_card_id, category_id, status,
    is_card_payment, is_corporate_expense, is_reimbursable,
    is_refund, is_provisional, is_reimbursement
  ) values (
    v_original.user_id,
    'Reembolso recebido - ' || v_original.description,
    v_original.amount,
    'income',
    coalesce(p_date, current_date),
    p_account_id,
    null,
    null,
    'completed',
    false,
    false,
    false,
    false,
    false,
    true
  )
  returning id into v_income_id;

  update public.transactions
     set reimbursement_status    = 'reimbursed',
         reimbursement_payment_id = v_income_id
   where id = p_transaction_id;

  return v_income_id;
end;
$$;

comment on function public.settle_reimbursement(uuid, uuid, uuid, date) is
  'Quita uma despesa reembolsável com recebimento externo (PIX/transferência): '
  'vincula uma receita existente (p_income_id) ou cria uma nova na conta '
  '(p_account_id). A receita é marcada is_reimbursement (neutra nos KPIs). '
  'Idempotente. SECURITY INVOKER — depende da RLS.';

revoke all on function public.settle_reimbursement(uuid, uuid, uuid, date) from public;
grant execute on function public.settle_reimbursement(uuid, uuid, uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Estende unmark_reimbursed para reverter também o caminho externo
-- ---------------------------------------------------------------------------
-- - reimbursement_payment_id  -> lançamento criado pelo sistema: APAGA.
--   (espelho de cartão OU receita criada via settle_reimbursement)
-- - reimbursement_income_id   -> receita preexistente do usuário: só desmarca
--   is_reimbursement, NÃO apaga.
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

  -- Receita preexistente vinculada (PIX do usuário): só desmarca, não apaga.
  if v_income_id is not null then
    update public.transactions
       set is_reimbursement = false
     where id = v_income_id;
  end if;

  update public.transactions
     set reimbursement_status     = p_new_status,
         reimbursement_payment_id = null,
         reimbursement_income_id  = null
   where id = p_transaction_id;

  -- Recalcula a fatura do cartão (relevante quando havia espelho is_card_payment).
  if v_original.credit_card_id is not null then
    update public.credit_cards cc
       set current_invoice = sub.total
      from (
        select greatest(
          0,
          coalesce(
            sum(
              case
                when is_card_payment then -amount
                when is_refund then -amount
                when type = 'expense' then amount
                else 0
              end
            ),
            0
          )
        ) as total
        from public.transactions
        where credit_card_id = v_original.credit_card_id
          and is_provisional = false
          and status = 'completed'
      ) sub
     where cc.id = v_original.credit_card_id;
  end if;
end;
$$;

revoke all on function public.unmark_reimbursed(uuid, text) from public;
grant execute on function public.unmark_reimbursed(uuid, text) to authenticated;

notify pgrst, 'reload schema';
