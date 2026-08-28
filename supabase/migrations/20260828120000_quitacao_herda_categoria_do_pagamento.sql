-- Previsto sem categoria saía da quitação ainda sem categoria, e a categoria do
-- pagamento era jogada fora.
--
-- `settle_transactions_with_payment` (20260824170000, recriada na
-- 20260825150000) nunca tocou em `category_id`: por decisão, cada previsto
-- conserva a SUA classificação. O efeito colateral aparece quando o previsto
-- não tem nenhuma — provisória gerada de uma `recurring_rule` sem
-- `category_id` (useRecurringGenerator.ts), ou `pending` criado à mão sem
-- escolher categoria. O previsto vira parte da divisão ainda sem categoria, e
-- o lançamento do pagamento — que o usuário muitas vezes JÁ tinha
-- classificado, porque é a linha que veio do extrato — é apagado no fim da
-- função, levando a categoria junto. Classificação existente sendo destruída.
--
-- Correção: o alvo herda a categoria do pagamento SOMENTE quando está sem
-- categoria. `coalesce(category_id, v_payment.category_id)` — o alvo que já
-- tem categoria nunca é sobrescrito, que é o ponto inteiro da quitação. Se o
-- pagamento também não tiver, nada muda.
--
-- Por que é seguro do ponto de vista de tipo: a função já recusa alvo com
-- `type` diferente do pagamento, então a categoria do pagamento é sempre
-- compatível com o tipo do alvo (categoria de despesa em despesa, de receita
-- em receita).
--
-- SEM RETROATIVO — e não é esquecimento: nos grupos já existentes o
-- lançamento do pagamento foi APAGADO, e com ele a categoria. Não há de onde
-- herdar. As partes sem categoria de quitações antigas precisam ser
-- classificadas na mão, na própria lista de lançamentos.
--
-- Sobre desfazer: `unsplit_transaction` desanexa sem restaurar nada, então a
-- categoria herdada FICA no lançamento. É o comportamento desejado — herdada
-- ou digitada, é uma classificação real, e o desfazer nunca prometeu voltar
-- ao estado anterior (ver o cabeçalho da 20260825150000).
--
-- Recriada a partir da 20260825150000 com UMA mudança, assinalada em
-- comentário no corpo.
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

  -- O pagamento tem que ser DÉBITO REAL. Sem esta trava, quitar com uma linha
  -- ainda pendente apagava a linha e dava baixa nos previstos: o saldo caía por
  -- dinheiro que não saiu. A checagem existia só no cliente
  -- (`canSettleWithPayment`), que não protege chamada direta nem lista velha.
  if v_payment.status is distinct from 'completed' or coalesce(v_payment.is_provisional, false) then
    raise exception 'O pagamento precisa ser um lançamento já realizado.';
  end if;

  -- Estorno cancela uma despesa ANTERIOR; usar um como pagamento não tem
  -- sentido. O cliente já barrava, o banco não — e a divergência valia nos dois
  -- sentidos, porque o cliente também não olhava as colunas de reembolso.
  if v_payment.is_refund then
    raise exception 'Um estorno não pode quitar lançamentos.';
  end if;

  if v_payment.reimbursement_payment_id is not null
     or v_payment.reimbursement_income_id is not null then
    raise exception 'Este lançamento já foi reembolsado. Estorne o reembolso antes.';
  end if;

  -- O pagamento é APAGADO no fim, então nada pode apontar para ele. As FKs são
  -- ON DELETE SET NULL: sem esta trava o estorno sobreviveria órfão, apontando
  -- para nada. `unsplit_transaction` já guardava este caso; esta não guardava.
  if exists (
    select 1 from public.transactions
     where refunded_transaction_id = p_payment_id
        or reimbursement_payment_id = p_payment_id
        or reimbursement_income_id = p_payment_id
  ) then
    raise exception 'Existe um estorno ou reembolso apontando para este pagamento. Desfaça antes.';
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
    -- Alvo já quitado não pode ser quitado de novo. Com uma lista de candidatas
    -- velha na tela, isso marcava como pago algo já pago E apagava o pagamento
    -- novo — sumindo com gasto real do saldo.
    if v_target.status is distinct from 'pending'
       and not coalesce(v_target.is_provisional, false) then
      raise exception 'Lançamento "%" não está em aberto.', v_target.description;
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
           -- A categoria do pagamento também morre com ele no delete lá
           -- embaixo. Só o alvo SEM categoria a herda; alvo classificado
           -- nunca é sobrescrito.
           category_id = coalesce(category_id, v_payment.category_id),
           original_description = case
             when v_target.id = v_primary_id then v_origin
             else original_description
           end,
           split_group_id = v_group,
           split_parent_id = case when v_target.id = v_primary_id then null else v_primary_id end,
           -- Marca para o `unsplit_transaction` saber que estas partes são
           -- lançamentos REAIS e nunca podem ser apagadas ao desfazer.
           split_origin = 'settle',
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
  'pagamento é apagado. Alvo SEM categoria herda a do pagamento, que de outro '
  'modo se perderia no delete. A soma dos alvos precisa ser exatamente o valor '
  'do pagamento. Recusa lançamentos de cartão, alvo já quitado, pagamento não '
  'realizado e pagamento com estorno apontando para ele. Marca as partes com '
  'split_origin = ''settle'', que impede o desfazer de apagá-las. '
  'SECURITY INVOKER — depende da RLS.';

notify pgrst, 'reload schema';
