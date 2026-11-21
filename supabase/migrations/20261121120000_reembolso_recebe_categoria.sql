-- A receita de um reembolso ganha a categoria "Reembolsos Diversos".
--
-- O caso real (03/11/2026): um PIX de 552,00 vindo do extrato, sem categoria,
-- foi vinculado como reembolso. `settle_reimbursement` (20260531010000) só
-- marcava `is_reimbursement` e deixava `category_id` como estava; no caminho
-- que CRIA a receita, gravava `category_id = null` de propósito. Os outros
-- reembolsos do mês estavam em "Reembolsos Diversos" porque alguém pôs à mão.
--
-- Não muda total nenhum: `is_reimbursement` já tira a receita dos KPIs
-- (isMonthlyIncome). O efeito é só em listas, filtros e relatórios, onde ela
-- aparecia como "sem categoria".
--
-- Regra:
--  * a categoria é a de RECEITA do dono da despesa cujo nome é "Reembolsos
--    Diversos" (sem diferenciar maiúsculas nem espaços nas pontas). Não há
--    flag para isso no schema; o nome é o mesmo da tela de Reembolsos.
--    Se não existir (ou foi renomeada), nada muda: a receita fica como antes.
--  * caminho 1 (vincular receita existente): só preenche se estiver VAZIA.
--    Categoria escolhida pelo usuário nunca é sobrescrita.
--  * caminho 2 (criar receita): já nasce com ela.
--
-- O resto da função é idêntico à versão de 20260531010000.
-- `settle_reimbursements` (20261013120000) chama esta, então herda a regra.

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
  v_category_id uuid;
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

  -- Categoria de destino da receita. Com duas de mesmo nome, prefere a
  -- categoria-pai e, entre iguais, a mais antiga — escolha estável.
  select c.id into v_category_id
    from public.categories c
   where c.user_id = v_original.user_id
     and c.type = 'income'
     and lower(btrim(c.name)) = 'reembolsos diversos'
   order by (c.parent_id is not null), c.created_at, c.id
   limit 1;

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
       set is_reimbursement = true,
           category_id = coalesce(category_id, v_category_id)
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
    v_category_id,
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
  '(p_account_id). A receita é marcada is_reimbursement (neutra nos KPIs) e, '
  'se estiver sem categoria, recebe a de receita "Reembolsos Diversos" do '
  'usuário, quando existir. Idempotente. SECURITY INVOKER — depende da RLS.';

revoke all on function public.settle_reimbursement(uuid, uuid, uuid, date) from public;
grant execute on function public.settle_reimbursement(uuid, uuid, uuid, date) to authenticated;
