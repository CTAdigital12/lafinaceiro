-- "Desfazer divisão" apagava lançamentos REAIS quando o grupo tinha nascido de
-- uma quitação.
--
-- `settle_transactions_with_payment` (20260824170000) transforma lançamentos
-- previstos EXISTENTES nas partes de uma divisão — cada um conservando o seu
-- id, a sua categoria e o seu installment_group_id. Já `unsplit_transaction`
-- (20260727120000) foi escrita para divisões comuns, onde as partes
-- secundárias são linhas SINTÉTICAS criadas pela própria divisão, e por isso
-- faz:
--
--     delete from transactions where split_group_id = g and split_parent_id is not null;
--     update  transactions set amount = <soma do grupo> where id = <primária>;
--
-- Num grupo vindo da quitação isso apaga parcela de verdade. Reproduzido em
-- Postgres 16 local com o cenário do cabeçalho da 20260824170000 (PIX de
-- R$ 1.611,00 quitando o Empréstimo 3/5 e o Ingresso 2/4):
--
--   antes:  empréstimo 2 parcelas / R$ 3.000,00   ingresso 2 parcelas / R$ 222,00
--   depois: empréstimo 2 parcelas / R$ 3.111,00   ingresso 1 parcela  / R$ 111,00
--
-- O Ingresso 2/4 sumiu e o Empréstimo 3/5 virou R$ 1.611,00 — exatamente o
-- encolhimento do grupo de parcelamento que a 20260824170000 dizia evitar. E é
-- alcançável em dois cliques: o ícone de divisão aparece em TODA linha com
-- split_group_id (Transactions.tsx), inclusive nas que a quitação criou.
--
-- Correção em três partes:
--   1. `split_origin` marca de onde o grupo veio;
--   2. `unsplit_transaction` DESANEXA em vez de apagar quando o grupo é de
--      quitação;
--   3. as travas que faltavam na própria quitação (alvo já pago, pagamento
--      pendente, pagamento com estorno apontando para ele).
--
-- Sobre o desanexar: ele NÃO restaura data, status nem recria o pagamento —
-- para isso seria preciso guardar o estado anterior, que é a trilha de
-- auditoria ainda não construída. Ele devolve os lançamentos separados e
-- quitados, com os valores próprios de volta. Nenhum dado é perdido, e a soma
-- do grupo não muda.

-- ---------------------------------------------------------------------------
-- 1. Marca de origem
-- ---------------------------------------------------------------------------
alter table public.transactions
  add column if not exists split_origin text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'transactions_split_origin_check'
  ) then
    alter table public.transactions
      add constraint transactions_split_origin_check
      check (split_origin is null or split_origin = 'settle');
  end if;
end;
$$;

comment on column public.transactions.split_origin is
  'Origem do grupo de divisão: nulo = divisão comum (partes sintéticas, podem '
  'ser apagadas ao desfazer); ''settle'' = veio de settle_transactions_with_payment '
  '(as partes são lançamentos reais e NUNCA podem ser apagadas ao desfazer).';

-- Retroativo: grupos de quitação que já existem. `split_transaction` nunca
-- gravou installment_group_id nas partes que insere (conferido nas duas
-- versões, 20260727120000 e 20260824120000), então parte SECUNDÁRIA com
-- installment_group_id só pode ter vindo de uma quitação. É prova, não
-- heurística — mas cobre só os grupos que contêm parcela; ver a consulta de
-- diagnóstico entregue junto para os demais.
update public.transactions
   set split_origin = 'settle'
 where split_group_id in (
   select split_group_id
     from public.transactions
    where split_group_id is not null
      and split_parent_id is not null
      and installment_group_id is not null
 )
   and split_origin is null;

-- ---------------------------------------------------------------------------
-- 2. Desfazer divisão que preserva lançamento real
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
         split_group_id = null,
         updated_at = now()
   where id = v_primary_id;

  return v_primary_id;
end;
$$;

comment on function public.unsplit_transaction(uuid) is
  'Desfaz uma divisão. Divisão comum: soma o valor das partes de volta na '
  'primária e apaga as secundárias. Grupo vindo de quitação (split_origin = '
  '''settle'', ou parte secundária com installment_group_id): apenas DESANEXA — '
  'as partes são lançamentos reais e apagá-las encolheria o parcelamento.';

-- ---------------------------------------------------------------------------
-- 3. Travas que faltavam na quitação
-- ---------------------------------------------------------------------------
-- Recriada a partir da 20260824170000 com quatro mudanças, todas assinaladas
-- em comentário no corpo: trava de status do pagamento, trava de estorno
-- apontando para o pagamento, trava de alvo já quitado, e a gravação de
-- `split_origin = 'settle'` nas partes.
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
  'pagamento é apagado. A soma dos alvos precisa ser exatamente o valor do '
  'pagamento. Recusa lançamentos de cartão, alvo já quitado, pagamento não '
  'realizado e pagamento com estorno apontando para ele. Marca as partes com '
  'split_origin = ''settle'', que impede o desfazer de apagá-las. '
  'SECURITY INVOKER — depende da RLS.';

notify pgrst, 'reload schema';
