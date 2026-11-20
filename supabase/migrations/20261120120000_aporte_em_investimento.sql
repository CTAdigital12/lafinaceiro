-- Aporte em investimento NÃO é despesa.
--
-- O débito mensal do título de capitalização (e toda aplicação que sai da conta
-- corrente para um investimento) entrava como despesa comum: inflava a despesa
-- do mês e consumia orçamento no Planejamento. É dinheiro guardado, não gasto.
--
-- A forma é a mesma do pagamento de fatura (`is_card_payment`): a linha continua
-- `type = 'expense'` — então o SALDO da conta segue caindo, sem mexer em
-- `accountBalance.ts` — e a regra única de seleção (`src/lib/transactionFilters.ts`)
-- passa a excluí-la da despesa. O app soma esses lançamentos à parte, como
-- "Aportes".
--
-- `categorization_rules` ganha a mesma flag porque é a ÚNICA automação no caminho
-- do extrato: não existe gerador a partir de `recurring_rules` (apagado em
-- f20c8bd). Uma regra "palavra do extrato → aporte" marca o débito de todo mês.
--
-- RETROATIVO: nenhum. Os débitos já lançados continuam despesa até serem
-- marcados (pela tela ou pela correção de dados combinada à parte).

alter table public.transactions
  add column if not exists is_investment_contribution boolean not null default false;

comment on column public.transactions.is_investment_contribution is
  'Aporte em investimento: saída da conta para uma aplicação. Debita o saldo, '
  'mas NÃO é despesa nem consome orçamento (ver transactionFilters.ts).';

alter table public.categorization_rules
  add column if not exists is_investment_contribution boolean not null default false;

comment on column public.categorization_rules.is_investment_contribution is
  'Ao casar a palavra-chave, marca o lançamento como aporte em investimento.';


-- ---------------------------------------------------------------------------
-- split_transaction: recriada a partir de 20260924120000, com UMA mudança —
-- as partes secundárias herdam `is_investment_contribution` da original. A
-- primária não é tocada pelo UPDATE e mantém a sua.
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
        is_investment_contribution,
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
        v_tx.is_investment_contribution,
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
-- Tipo de ativo `capitalizacao` (título de capitalização, ex.: PIC do Itaú).
-- A CHECK é recriada com a lista inteira de 20261102120000 + o tipo novo; ela
-- tem que acompanhar `ASSET_TYPES` em src/lib/investments/assetTypes.ts (há
-- teste que confere).
-- ---------------------------------------------------------------------------
alter table public.investment_assets
  drop constraint if exists investment_assets_asset_type_check;

alter table public.investment_assets
  add constraint investment_assets_asset_type_check
  check (asset_type in (
    'renda_fixa',
    'renda_variavel',
    'fundos',
    'crypto',
    'saldo_corretora',
    'acoes',
    'etfs',
    'bdrs',
    'fiis',
    'capitalizacao'
  ));

-- ---------------------------------------------------------------------------
-- VERIFICAÇÃO (rodar depois de aplicar)
-- ---------------------------------------------------------------------------
--
-- select count(*) filter (where is_investment_contribution) as aportes,
--        count(*) as total
--   from public.transactions;
--
-- `aportes` começa em zero.

-- ---------------------------------------------------------------------------
-- ROLLBACK: recrie split_transaction a partir de 20260924120000 e a CHECK a
--   partir de 20261102120000 (só se nenhum ativo usar 'capitalizacao'); depois,
--   alter table public.transactions drop column is_investment_contribution;
--   alter table public.categorization_rules drop column is_investment_contribution;
-- ---------------------------------------------------------------------------
