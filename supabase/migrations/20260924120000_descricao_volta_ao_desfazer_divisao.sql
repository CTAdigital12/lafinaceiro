-- A descrição volta ao normal quando a divisão é desfeita (B5 da auditoria).
--
-- `split_transaction` reescreve a descrição da parte primária:
--
--     description = v_base_description || coalesce(' - ' || v_label, '')
--
-- e o `unsplit_transaction` devolvia o `amount`, mas NÃO a descrição. "Mercado"
-- virava "Mercado - Comida" para sempre. Pior: ACUMULA, porque a divisão
-- seguinte toma `v_base_description := v_tx.description`, que já está suja —
-- dividir e desfazer duas vezes deixa "Mercado - Comida - Comida".
--
-- POR QUE UMA COLUNA, e não recortar o sufixo:
--   * " - " é separador legítimo dentro de descrição. A importação de fatura
--     grava `descrição - anotação` (InvoiceReviewModal), então cortar o último
--     trecho apagaria texto que o usuário escreveu.
--   * `original_description` não serve: ela guarda o texto CRU do parser/banco
--     (tipo `EC *SALLV02/02`), e restaurá-la jogaria fora a descrição que a
--     pessoa digitou.
-- A única fonte confiável é a própria descrição no instante da divisão, então
-- ela passa a ser guardada.
--
-- RETROATIVO: NÃO HÁ. Para as linhas que já estão com o sufixo grudado, a base
-- se perdeu, e adivinhá-la seria o mesmo recorte heurístico recusado acima.
-- Esta migration conserta dali para a frente; grupo antigo cai no `coalesce` e
-- mantém o comportamento atual, sem regressão.

alter table public.transactions
  add column if not exists split_base_description text;

comment on column public.transactions.split_base_description is
  'Descrição da transação ANTES de split_transaction acrescentar o rótulo da '
  'parte. Preenchida só na parte primária, enquanto a divisão existe, e '
  'devolvida por unsplit_transaction. Nula fora de divisão.';


-- ---------------------------------------------------------------------------
-- 1. split_transaction: recriada a partir de 20260824120000, com UMA mudança —
--    a gravação de `split_base_description` na parte primária.
-- ---------------------------------------------------------------------------
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
  v_has_rule boolean;
  v_rule uuid;
  v_rule_type text;
  v_used_rules uuid[] := '{}';
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

    -- Recorrência da parte. Distinguimos "chave ausente" (não mexe) de
    -- "chave null" (limpa), por isso o `?` antes de ler o valor.
    v_has_rule := v_part ? 'recurring_rule_id';
    v_rule := nullif(btrim(coalesce(v_part->>'recurring_rule_id', '')), '')::uuid;

    if v_rule is not null then
      -- SECURITY INVOKER: a RLS de recurring_rules já limita o que enxergamos,
      -- então "não encontrada" cobre tanto id inexistente quanto id de outro
      -- usuário — sem vazar qual dos dois é.
      select r.type::text into v_rule_type
        from public.recurring_rules r
       where r.id = v_rule;

      if not found then
        raise exception 'Recorrência não encontrada ou sem acesso.';
      end if;

      if v_rule_type is distinct from v_tx.type::text then
        raise exception 'A recorrência escolhida é de % e a transação é de %.',
          v_rule_type, v_tx.type;
      end if;

      if v_rule = any(v_used_rules) then
        raise exception 'A mesma recorrência foi escolhida em duas partes do rateio.';
      end if;

      v_used_rules := v_used_rules || v_rule;
    end if;

    if v_idx = 1 then
      update public.transactions
         set amount = v_amount,
             category_id = v_category,
             is_reimbursable = v_reimbursable,
             is_corporate_expense = v_corporate,
             description = v_base_description || coalesce(' - ' || v_label, ''),
             -- Guarda a descrição de ANTES do rótulo. Sem isto o
             -- `unsplit_transaction` não tem como desfazer a reescrita da linha
             -- acima, e o sufixo fica grudado para sempre.
             split_base_description = v_base_description,
             reimbursement_status = case
               when v_reimbursable or v_corporate then coalesce(reimbursement_status, 'pending')
               else null
             end,
             recurring_rule_id = case when v_has_rule then v_rule else recurring_rule_id end,
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
        recurring_rule_id,
        split_group_id, split_parent_id
      ) values (
        v_tx.user_id, v_tx.account_id, v_tx.credit_card_id, v_category,
        v_base_description || coalesce(' - ' || v_label, ''), v_tx.original_description, v_amount, v_tx.type,
        v_tx.date, v_tx.due_date, v_tx.status,
        v_corporate, v_reimbursable, v_tx.is_refund, false,
        case when v_reimbursable or v_corporate then 'pending' else null end,
        v_tx.installment_number, v_tx.total_installments,
        v_tx.is_provisional, v_tx.project_id, v_tx.card_last_digits,
        v_rule,
        v_split_group, v_tx.id
      );
    end if;
  end loop;

  return v_split_group;
end;
$$;

comment on function public.split_transaction(uuid, jsonb) is
  'Divide uma transação em N partes com categorias/flags próprias. A primeira '
  'parte reescreve a transação original (inclusive a descrição, que fica '
  'guardada em split_base_description); as demais são inseridas ao lado. A '
  'soma das partes precisa ser exatamente o valor original.';


-- ---------------------------------------------------------------------------
-- 2. unsplit_transaction: recriada a partir de 20260825150000, com UMA mudança —
--    a restauração da descrição no ramo da divisão comum.
-- ---------------------------------------------------------------------------
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
  v_is_settle boolean;
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

  -- Duas provas independentes de que as partes são lançamentos reais: a marca
  -- gravada pela quitação, e a presença de installment_group_id numa parte
  -- secundária (que `split_transaction` nunca produz). A segunda é a rede para
  -- grupos anteriores a esta migration que o retroativo não alcançou.
  select exists (
    select 1 from public.transactions
     where split_group_id = v_group
       and (split_origin = 'settle'
            or (split_parent_id is not null and installment_group_id is not null))
  ) into v_is_settle;

  if v_is_settle then
    -- DESANEXA: cada lançamento volta a viver por conta própria, com o valor
    -- que sempre foi dele. Nada é apagado e nenhum valor muda.
    update public.transactions
       set split_group_id = null,
           split_parent_id = null,
           split_origin = null,
           -- A quitação nunca reescreve descrição, então aqui não há o que
           -- restaurar; limpar é higiene, para a coluna não sobreviver ao grupo.
           split_base_description = null,
           updated_at = now()
     where split_group_id = v_group;

    return v_primary_id;
  end if;

  select coalesce(sum(amount), 0) into v_total
    from public.transactions
   where split_group_id = v_group;

  delete from public.transactions
   where split_group_id = v_group
     and split_parent_id is not null;

  update public.transactions
     set amount = v_total,
         -- Desfaz a reescrita feita pela divisão. O `coalesce` cobre os grupos
         -- criados ANTES desta migration, que não têm base guardada: eles ficam
         -- com a descrição que já tinham, que é o comportamento de hoje.
         description = coalesce(split_base_description, description),
         split_base_description = null,
         split_group_id = null,
         updated_at = now()
   where id = v_primary_id;

  return v_primary_id;
end;
$$;

comment on function public.unsplit_transaction(uuid) is
  'Desfaz uma divisão. Divisão comum: soma o valor das partes de volta na '
  'primária, RESTAURA a descrição guardada em split_base_description e apaga '
  'as secundárias. Grupo vindo de quitação (split_origin = ''settle'', ou parte '
  'secundária com installment_group_id): apenas DESANEXA — as partes são '
  'lançamentos reais e apagá-las encolheria o parcelamento.';


-- ---------------------------------------------------------------------------
-- VERIFICAÇÃO (rodar depois de aplicar)
-- ---------------------------------------------------------------------------
--
-- A coluna existe e está vazia fora de divisão:
--
-- select count(*) filter (where split_base_description is not null) as com_base,
--        count(*) filter (where split_group_id is not null)         as em_divisao
--   from public.transactions;
--
-- `com_base` só pode ser maior que zero para linhas que estão EM divisão agora.


-- ---------------------------------------------------------------------------
-- SEM ROLLBACK da coluna.
--
-- Derrubá-la enquanto existir divisão aberta apagaria a única cópia da
-- descrição original dessas linhas. Para reverter o comportamento, recrie as
-- duas funções a partir de 20260824120000 e 20260825150000 e DEIXE a coluna.
-- ---------------------------------------------------------------------------
