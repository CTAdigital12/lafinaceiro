-- Uma função só para recalcular a fatura do cartão.
--
-- O `CASE` que decide quanto cada lançamento pesa na fatura estava copiado
-- literalmente dentro de `mark_reimbursed` e de `unmark_reimbursed`. Hoje as
-- duas cópias CONCORDAM — mas foi exatamente essa configuração ("a mesma regra
-- escrita em vários lugares") que produziu o A10, quando a versão TypeScript
-- divergiu do SQL e `current_invoice` passou a mudar de valor conforme qual
-- caminho tivesse rodado por último.
--
-- O lado TypeScript já foi unificado em `src/lib/invoiceTotal.ts`, cujo
-- cabeçalho aponta para estas cópias como referência. Esta migration faz o
-- mesmo do lado SQL, e passam a existir DUAS definições da regra no sistema —
-- uma em cada linguagem — em vez de quatro.
--
-- REFATORAÇÃO PURA: o corpo da função é o mesmo texto que estava embutido, e
-- nada mais muda de comportamento. Conferido em Postgres 16 local comparando o
-- resultado da função com o do CASE embutido em 8 cenários (ver
-- `supabase/tests/recompute_card_invoice.sql`).
--
-- Uma nota sobre o que NÃO entra aqui: `useCreditCardInvoiceSync` (TypeScript)
-- também mexe no `status` do cartão quando o total fica positivo, e estes RPCs
-- não. É divergência real, mas mudá-la é decisão de produto, não refatoração —
-- fica registrada, não corrigida.

create or replace function public.recompute_card_invoice(p_card_id uuid)
returns numeric
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_total numeric(12,2);
begin
  if p_card_id is null then
    return null;
  end if;

  -- A ORDEM das cláusulas importa: `is_refund` decide ANTES de `type`, porque
  -- estorno gravado como `type='income'` — o formato que a conciliação de
  -- fatura produz — precisa abater igual a estorno gravado como despesa.
  --
  -- O piso em zero é deliberado, para manter paridade com o TypeScript. Ele
  -- esconde saldo credor (pagou a mais, ou estorno maior que a despesa) e está
  -- registrado como achado M2 — não se resolve aqui.
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
         )
    into v_total
    from public.transactions
   where credit_card_id = p_card_id
     and is_provisional = false
     and status = 'completed';

  update public.credit_cards
     set current_invoice = v_total
   where id = p_card_id;

  return v_total;
end;
$$;

comment on function public.recompute_card_invoice(uuid) is
  'Recalcula e grava `credit_cards.current_invoice` a partir das transações '
  'concluídas e não provisórias do cartão. Regra única do lado SQL; o espelho '
  'em TypeScript é `sumInvoice` em src/lib/invoiceTotal.ts. SECURITY INVOKER — '
  'só enxerga o que a RLS do chamador deixa ver.';

revoke all on function public.recompute_card_invoice(uuid) from public;
grant execute on function public.recompute_card_invoice(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Os dois chamadores, recriados sem a cópia
-- ---------------------------------------------------------------------------
-- Só estas duas definições estão VIVAS. A terceira cópia que o backlog citava
-- está numa versão de `unmark_reimbursed` que a migration de 31/05 já havia
-- substituído — código morto no histórico, não em produção.

CREATE OR REPLACE FUNCTION public.mark_reimbursed(p_transaction_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_original public.transactions%ROWTYPE;
  v_payment_id uuid;
BEGIN
  IF p_transaction_id IS NULL THEN
    RAISE EXCEPTION 'transaction id is required' USING ERRCODE = '22023';
  END IF;

  -- RLS applies here (SECURITY INVOKER): if the caller cannot SELECT the row,
  -- v_original stays NULL and we abort.
  -- FOR UPDATE: serialize concurrent calls on the same row so a double-click
  -- cannot create two mirrors before reimbursement_payment_id is set.
  SELECT * INTO v_original
    FROM public.transactions
   WHERE id = p_transaction_id
   FOR UPDATE;

  IF v_original.id IS NULL THEN
    RAISE EXCEPTION 'transaction not found or not accessible' USING ERRCODE = '42704';
  END IF;

  -- Idempotency: already linked to a mirror — just normalize status.
  IF v_original.reimbursement_payment_id IS NOT NULL THEN
    UPDATE public.transactions
       SET reimbursement_status = 'reimbursed'
     WHERE id = p_transaction_id;
    RETURN v_original.reimbursement_payment_id;
  END IF;

  -- No card linked: only flip status, no financial mirror.
  IF v_original.credit_card_id IS NULL THEN
    UPDATE public.transactions
       SET reimbursement_status = 'reimbursed'
     WHERE id = p_transaction_id;
    RETURN NULL;
  END IF;

  -- Insert mirror income transaction. RLS will check user_id = auth.uid()
  -- via the existing "Users can insert own transactions" policy.
  INSERT INTO public.transactions (
    user_id,
    description,
    amount,
    type,
    date,
    account_id,
    credit_card_id,
    category_id,
    status,
    is_card_payment,
    is_corporate_expense,
    is_reimbursable,
    is_refund,
    is_provisional,
    due_date
  ) VALUES (
    v_original.user_id,
    'Reembolso recebido - ' || v_original.description,
    v_original.amount,
    'income',
    CURRENT_DATE,
    NULL,
    v_original.credit_card_id,
    NULL,
    'completed',
    true,
    v_original.is_corporate_expense,
    v_original.is_reimbursable,
    false,
    false,
    v_original.due_date
  )
  RETURNING id INTO v_payment_id;

  UPDATE public.transactions
     SET reimbursement_status   = 'reimbursed',
         reimbursement_payment_id = v_payment_id
   WHERE id = p_transaction_id;

  -- Regra única: `recompute_card_invoice`. Era um CASE copiado aqui, idêntico
  -- ao de `unmark_reimbursed` — a configuração que gerou o A10.
  PERFORM public.recompute_card_invoice(v_original.credit_card_id);

  RETURN v_payment_id;
END;
$$;

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

  -- Regra única: `recompute_card_invoice` (relevante quando havia espelho
  -- is_card_payment). Era a segunda cópia do mesmo CASE.
  if v_original.credit_card_id is not null then
    perform public.recompute_card_invoice(v_original.credit_card_id);
  end if;
end;
$$;

notify pgrst, 'reload schema';
