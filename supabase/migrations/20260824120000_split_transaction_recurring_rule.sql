-- Divisão de transação: uma recorrência por parte.
--
-- Contexto: um único débito no extrato pode quitar DUAS previsões recorrentes
-- (ex.: um PIX que paga "Ingresso" e "Empréstimo Reforma" no mesmo mês). Até
-- aqui não dava para representar isso: `split_transaction` não copiava
-- `recurring_rule_id` para as partes secundárias, então a regra da segunda
-- previsão ficava sem lançamento no mês e o gerador
-- (src/hooks/useRecurringGenerator.ts) recriava a provisória por cima — o mês
-- passava a contar o gasto duas vezes.
--
-- Com esta migration cada parte pode reivindicar a sua própria recorrência.
-- O gerador enxerga as duas regras atendidas no mês e não recria nada, e a
-- conciliação continua casando 1:1 com o extrato, porque collapseSplitGroups
-- soma as partes de volta numa linha só.
--
-- Contrato de `p_parts` (a chave é opcional, para não quebrar chamadas antigas):
--   [{ "amount": 300.00, "category_id": "uuid|null", "label": null,
--      "is_reimbursable": false, "is_corporate_expense": false,
--      "recurring_rule_id": "uuid|null" }, ...]
--
--   - chave AUSENTE  -> parte primária conserva a recorrência que já tinha;
--                       partes secundárias nascem sem recorrência.
--   - chave = null   -> limpa a recorrência da parte.
--
-- Validações novas (todas dentro da transação da função):
--   - a regra precisa ser visível pelo chamador (RLS de recurring_rules,
--     SECURITY INVOKER) — id de outro usuário devolve "não encontrada";
--   - o tipo da regra precisa bater com o tipo da transação;
--   - a mesma regra não pode ser escolhida em duas partes do mesmo rateio
--     (duas linhas reivindicando o mesmo mês da mesma regra).
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
  'Divide uma transação em N partes com categoria, flags e recorrência '
  'próprias. A primeira parte reescreve a transação original; as demais são '
  'inseridas ao lado. A soma das partes precisa ser exatamente o valor '
  'original. Cada parte pode reivindicar uma recurring_rule_id distinta, para '
  'que um único débito quite mais de uma previsão recorrente do mês.';

notify pgrst, 'reload schema';
