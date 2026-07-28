-- Divisão de uma transação em várias partes (rateio por categoria).
--
-- Caso de uso: uma compra única onde só parte do valor é sua. Ex.: "Airbnb
-- 2/4" de R$ 800,00 em que R$ 300,00 são de um amigo que vai te pagar. Você
-- quer R$ 500,00 em "Viagem" (pessoal) e R$ 300,00 numa categoria
-- reembolsável, para essa parte aparecer em Reembolsos Diversos e ser quitada
-- pelo fluxo normal (mark_reimbursed / settle_reimbursement).
--
-- Modelo escolhido: as partes são TRANSAÇÕES IRMÃS de verdade, não linhas de
-- uma tabela auxiliar. A transação original vira a "parte primária" (mantém o
-- id, os vínculos e o grupo de parcelas) e tem o valor reduzido; as demais são
-- inseridas ao lado dela. Isso mantém TODAS as agregações do app funcionando
-- sem alteração (dashboard, fatura, reembolsos, orçamentos, relatórios): cada
-- parte é uma despesa comum com a sua própria categoria e as suas próprias
-- flags. A soma das partes é sempre igual ao valor original, então o total da
-- fatura e o saldo não se movem.
--
--   split_group_id  -> agrupa todas as partes de uma mesma divisão
--   split_parent_id -> aponta para a parte primária (NULL na própria primária)
--
-- Parcelamentos: as partes secundárias NÃO herdam installment_group_id (senão
-- o grupo passaria a ter 2 linhas por parcela e quebraria a contagem/renumeração
-- em useInstallmentGroup). Elas herdam apenas installment_number /
-- total_installments, o suficiente para exibir o badge "2/4". Dividir todas as
-- parcelas de um grupo é feito no frontend, chamando esta função uma vez por
-- parcela com os valores rateados.

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------
alter table public.transactions
  add column if not exists split_group_id uuid null;

comment on column public.transactions.split_group_id is
  'Agrupa as partes de uma transação dividida em várias categorias. NULL '
  'quando a transação não foi dividida.';

alter table public.transactions
  add column if not exists split_parent_id uuid null
    references public.transactions(id) on delete set null;

comment on column public.transactions.split_parent_id is
  'Aponta para a parte primária da divisão (a transação original, que manteve '
  'o id). NULL na própria primária e em transações não divididas.';

create index if not exists idx_transactions_split_group_id
  on public.transactions(split_group_id)
  where split_group_id is not null;

create index if not exists idx_transactions_split_parent_id
  on public.transactions(split_parent_id)
  where split_parent_id is not null;

-- ---------------------------------------------------------------------------
-- 2. RPC: dividir
-- ---------------------------------------------------------------------------
-- p_parts é um array JSON com 2+ objetos, na ordem de exibição:
--   [{ "amount": 500.00, "category_id": "uuid|null", "label": null,
--      "is_reimbursable": false, "is_corporate_expense": false }, ...]
--
-- O primeiro elemento reescreve a transação original; os demais viram linhas
-- novas. "label" é um sufixo opcional para a descrição ("- João"), e não a
-- descrição inteira: assim, ao dividir várias parcelas de um mesmo grupo, cada
-- parcela conserva a sua própria descrição base ("... 2/4", "... 3/4").
--
-- SECURITY INVOKER (default): a RLS de transactions garante que a função só
-- enxerga e escreve linhas que o usuário já podia ler/escrever.
create or replace function public.split_transaction(
  p_transaction_id uuid,
  p_parts jsonb
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_tx public.transactions%rowtype;
  v_base_description text;
  v_split_group uuid;
  v_part jsonb;
  v_idx int := 0;
  v_sum numeric(12,2);
  v_amount numeric(12,2);
  v_label text;
  v_category uuid;
  v_reimbursable boolean;
  v_corporate boolean;
  v_invoice_status text;
begin
  select * into v_tx
    from public.transactions
   where id = p_transaction_id
     for update;

  if not found then
    raise exception 'Transação não encontrada.';
  end if;

  if v_tx.split_group_id is not null then
    raise exception 'Esta transação já está dividida. Desfaça a divisão antes de dividir novamente.';
  end if;

  if v_tx.reimbursement_payment_id is not null or v_tx.reimbursement_income_id is not null then
    raise exception 'Esta transação já foi reembolsada. Estorne o reembolso antes de dividir.';
  end if;

  if v_tx.is_card_payment then
    raise exception 'Pagamentos de fatura não podem ser divididos.';
  end if;

  if p_parts is null or jsonb_typeof(p_parts) <> 'array' or jsonb_array_length(p_parts) < 2 then
    raise exception 'Informe pelo menos duas partes para dividir.';
  end if;

  select coalesce(sum(round((t.elem->>'amount')::numeric, 2)), 0)
    into v_sum
    from jsonb_array_elements(p_parts) as t(elem);

  if v_sum <> round(v_tx.amount, 2) then
    raise exception 'A soma das partes (%) é diferente do valor da transação (%).',
      to_char(v_sum, 'FM999999990.00'), to_char(v_tx.amount, 'FM999999990.00');
  end if;

  -- Fatura fechada: mesma trava dos demais fluxos de escrita (useTransactions).
  if v_tx.credit_card_id is not null and v_tx.due_date is not null then
    select status into v_invoice_status
      from public.credit_card_invoices
     where credit_card_id = v_tx.credit_card_id
       and month = extract(month from v_tx.due_date)::int
       and year = extract(year from v_tx.due_date)::int;

    if v_invoice_status = 'closed' then
      raise exception 'Esta fatura está fechada. Reabra-a antes de dividir lançamentos.';
    end if;
  end if;

  v_base_description := v_tx.description;
  v_split_group := gen_random_uuid();

  for v_part in select t.elem from jsonb_array_elements(p_parts) as t(elem)
  loop
    v_idx := v_idx + 1;
    v_amount := round((v_part->>'amount')::numeric, 2);

    if v_amount is null or v_amount <= 0 then
      raise exception 'Cada parte precisa ter valor maior que zero.';
    end if;

    v_label := nullif(btrim(coalesce(v_part->>'label', '')), '');
    v_category := nullif(btrim(coalesce(v_part->>'category_id', '')), '')::uuid;
    v_reimbursable := coalesce((v_part->>'is_reimbursable')::boolean, false);
    v_corporate := coalesce((v_part->>'is_corporate_expense')::boolean, false);

    if v_idx = 1 then
      update public.transactions
         set amount = v_amount,
             category_id = v_category,
             is_reimbursable = v_reimbursable,
             is_corporate_expense = v_corporate,
             description = v_base_description || coalesce(' - ' || v_label, ''),
             reimbursement_status = case
               when v_reimbursable or v_corporate then coalesce(reimbursement_status, 'pending')
               else null
             end,
             split_group_id = v_split_group,
             updated_at = now()
       where id = v_tx.id;
    else
      insert into public.transactions (
        user_id, account_id, credit_card_id, category_id,
        description, original_description, amount, type,
        date, due_date, status,
        is_corporate_expense, is_reimbursable, is_refund, is_card_payment,
        reimbursement_status,
        installment_number, total_installments,
        is_provisional, project_id, card_last_digits,
        split_group_id, split_parent_id
      ) values (
        v_tx.user_id, v_tx.account_id, v_tx.credit_card_id, v_category,
        v_base_description || coalesce(' - ' || v_label, ''), v_tx.original_description, v_amount, v_tx.type,
        v_tx.date, v_tx.due_date, v_tx.status,
        v_corporate, v_reimbursable, v_tx.is_refund, false,
        case when v_reimbursable or v_corporate then 'pending' else null end,
        v_tx.installment_number, v_tx.total_installments,
        v_tx.is_provisional, v_tx.project_id, v_tx.card_last_digits,
        v_split_group, v_tx.id
      );
    end if;
  end loop;

  return v_split_group;
end;
$$;

comment on function public.split_transaction(uuid, jsonb) is
  'Divide uma transação em N partes com categorias/flags próprias. A primeira '
  'parte reescreve a transação original; as demais são inseridas ao lado. A '
  'soma das partes precisa ser exatamente o valor original.';

-- ---------------------------------------------------------------------------
-- 3. RPC: desfazer a divisão
-- ---------------------------------------------------------------------------
-- Devolve todo o valor para a parte primária e apaga as secundárias. Recusa
-- quando alguma parte já foi reembolsada ou estornada — nesses casos existe um
-- lançamento espelho/estorno apontando para ela, que precisa ser desfeito antes.
create or replace function public.unsplit_transaction(
  p_transaction_id uuid
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_group uuid;
  v_primary_id uuid;
  v_total numeric(12,2);
begin
  select split_group_id into v_group
    from public.transactions
   where id = p_transaction_id;

  if v_group is null then
    raise exception 'Esta transação não faz parte de uma divisão.';
  end if;

  select id into v_primary_id
    from public.transactions
   where split_group_id = v_group
     and split_parent_id is null
   limit 1
     for update;

  if v_primary_id is null then
    raise exception 'Parte primária da divisão não encontrada.';
  end if;

  if exists (
    select 1 from public.transactions
     where split_group_id = v_group
       and (reimbursement_payment_id is not null or reimbursement_income_id is not null)
  ) then
    raise exception 'Alguma parte já foi reembolsada. Estorne o reembolso antes de desfazer a divisão.';
  end if;

  if exists (
    select 1
      from public.transactions r
      join public.transactions p on p.id = r.refunded_transaction_id
     where p.split_group_id = v_group
       and p.split_parent_id is not null
  ) then
    raise exception 'Existe um estorno vinculado a uma das partes. Exclua o estorno antes de desfazer a divisão.';
  end if;

  select coalesce(sum(amount), 0) into v_total
    from public.transactions
   where split_group_id = v_group;

  delete from public.transactions
   where split_group_id = v_group
     and split_parent_id is not null;

  update public.transactions
     set amount = v_total,
         split_group_id = null,
         updated_at = now()
   where id = v_primary_id;

  return v_primary_id;
end;
$$;

comment on function public.unsplit_transaction(uuid) is
  'Desfaz uma divisão: soma o valor das partes de volta na primária e apaga as '
  'secundárias.';
