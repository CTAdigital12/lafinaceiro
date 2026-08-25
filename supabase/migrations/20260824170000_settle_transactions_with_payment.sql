-- Um débito real quitando VÁRIOS lançamentos previstos.
--
-- Contexto: um único PIX de R$ 1.611,00 pagou duas parcelas do mês — R$
-- 1.500,00 do empréstimo e R$ 111,00 do ingresso. Hoje não há como registrar
-- isso sem estragar alguma coisa:
--   - lançar o PIX e apagar as parcelas encolhe o grupo do parcelamento
--     (useInstallmentGroup conta as linhas para o progresso "3 de 5");
--   - dar baixa nas duas e apagar o PIX preserva o parcelamento, mas deixa a
--     linha do extrato (valor cheio) sem par na conciliação, que casa por
--     data + valor (src/lib/spreadsheetReconciliation.ts).
--
-- Solução: em vez de criar linhas novas, os próprios lançamentos previstos
-- viram as partes de UMA divisão, e o lançamento do pagamento (que era só o
-- espelho manual do extrato) é apagado. Cada previsto conserva o seu id, a sua
-- categoria e o seu installment_group_id / recurring_rule_id — o parcelamento
-- continua com o mesmo número de parcelas —, e collapseSplitGroups soma o
-- grupo de volta numa linha só, com a data e o valor do débito do banco. A
-- conciliação volta a casar 1:1.
--
-- Fora de escopo por decisão explícita: lançamentos de CARTÃO. Mover data e
-- conta de um item de fatura mexeria no cálculo de current_invoice, que tem o
-- seu próprio fluxo de baixa. A função recusa os dois lados nesse caso.
create or replace function public.settle_transactions_with_payment(
  p_payment_id uuid,
  p_target_ids uuid[]
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_payment public.transactions%rowtype;
  v_target public.transactions%rowtype;
  v_group uuid;
  v_primary_id uuid;
  v_sum numeric(12,2);
  v_count int;
  v_origin text;
begin
  if p_payment_id is null then
    raise exception 'Informe o lançamento do pagamento.';
  end if;

  if p_target_ids is null or array_length(p_target_ids, 1) is null then
    raise exception 'Selecione pelo menos um lançamento para quitar.';
  end if;

  if p_payment_id = any(p_target_ids) then
    raise exception 'O próprio pagamento não pode estar na lista de lançamentos a quitar.';
  end if;

  -- FOR UPDATE serializa cliques concorrentes sobre o mesmo pagamento.
  select * into v_payment
    from public.transactions
   where id = p_payment_id
     for update;

  if not found then
    raise exception 'Lançamento do pagamento não encontrado.';
  end if;

  if v_payment.split_group_id is not null then
    raise exception 'O pagamento já faz parte de uma divisão. Desfaça a divisão antes.';
  end if;

  if v_payment.credit_card_id is not null then
    raise exception 'Lançamento de cartão tem o seu próprio fluxo de baixa (fatura).';
  end if;

  if v_payment.is_card_payment then
    raise exception 'Pagamento de fatura não pode quitar outros lançamentos.';
  end if;

  if v_payment.reimbursement_payment_id is not null
     or v_payment.reimbursement_income_id is not null then
    raise exception 'Este lançamento já foi reembolsado. Estorne o reembolso antes.';
  end if;

  -- Uma passada de validação sobre os alvos ANTES de escrever qualquer coisa:
  -- a soma precisa fechar, e um alvo inválido no meio não pode deixar metade
  -- do grupo montada (a função é atômica, mas o erro fica mais claro assim).
  -- Trava as linhas antes de somar: FOR UPDATE não convive com agregação.
  perform 1
     from public.transactions
    where id = any(p_target_ids)
      for update;

  select count(*), coalesce(sum(round(amount, 2)), 0)
    into v_count, v_sum
    from public.transactions
   where id = any(p_target_ids);

  if v_count <> cardinality(p_target_ids) then
    raise exception 'Algum lançamento selecionado não foi encontrado ou não está acessível.';
  end if;

  if v_sum <> round(v_payment.amount, 2) then
    raise exception 'A soma dos lançamentos (%) é diferente do valor do pagamento (%).',
      to_char(v_sum, 'FM999999990.00'), to_char(round(v_payment.amount, 2), 'FM999999990.00');
  end if;

  for v_target in
    select * from public.transactions where id = any(p_target_ids) order by date, created_at
  loop
    if v_target.type is distinct from v_payment.type then
      raise exception 'Lançamento "%" é de tipo diferente do pagamento.', v_target.description;
    end if;
    if v_target.split_group_id is not null then
      raise exception 'Lançamento "%" já faz parte de uma divisão.', v_target.description;
    end if;
    if v_target.credit_card_id is not null then
      raise exception 'Lançamento "%" é de cartão — use a baixa da fatura.', v_target.description;
    end if;
    if v_target.is_card_payment then
      raise exception 'Lançamento "%" é pagamento de fatura.', v_target.description;
    end if;
    if v_target.reimbursement_payment_id is not null
       or v_target.reimbursement_income_id is not null then
      raise exception 'Lançamento "%" já foi reembolsado. Estorne antes.', v_target.description;
    end if;
  end loop;

  v_group := gen_random_uuid();
  -- A descrição do extrato vive no pagamento, que vai embora. Ela migra para o
  -- original_description da parte primária, que é a linha representante na
  -- conciliação e na deduplicação de importação.
  v_origin := coalesce(v_payment.original_description, v_payment.description);

  for v_target in
    select * from public.transactions where id = any(p_target_ids) order by date, created_at
  loop
    if v_primary_id is null then
      v_primary_id := v_target.id;
    end if;

    update public.transactions
       set status = 'completed',
           is_provisional = false,
           date = v_payment.date,
           account_id = v_payment.account_id,
           original_description = case
             when v_target.id = v_primary_id then v_origin
             else original_description
           end,
           split_group_id = v_group,
           split_parent_id = case when v_target.id = v_primary_id then null else v_primary_id end,
           updated_at = now()
     where id = v_target.id;
  end loop;

  -- O pagamento era o espelho manual da linha do extrato; o grupo agora ocupa
  -- o lugar dele, com a mesma data e a mesma soma.
  delete from public.transactions where id = p_payment_id;

  return v_group;
end;
$$;

comment on function public.settle_transactions_with_payment(uuid, uuid[]) is
  'Quita N lançamentos previstos com UM débito real: os previstos viram as '
  'partes de uma divisão (conservando id, categoria, parcelamento e '
  'recorrência), recebem a data e a conta do pagamento, e o lançamento do '
  'pagamento é apagado. A soma dos alvos precisa ser exatamente o valor do '
  'pagamento. Recusa lançamentos de cartão. SECURITY INVOKER — depende da RLS.';

revoke all on function public.settle_transactions_with_payment(uuid, uuid[]) from public;
grant execute on function public.settle_transactions_with_payment(uuid, uuid[]) to authenticated;

notify pgrst, 'reload schema';
