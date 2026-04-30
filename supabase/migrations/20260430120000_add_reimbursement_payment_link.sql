-- Migration: link reimbursed transactions to their payment mirror + RPCs to
-- mark / unmark a transaction as reimbursed atomically.
--
-- Context:
--   When a corporate / reimbursable expense charged on a credit card is
--   reimbursed by the company, we want to automatically write a payment
--   mirror transaction on the same card (is_card_payment=true, type='income')
--   so the invoice is reduced by the same amount. Reverting the status
--   deletes the mirror and rolls the invoice back.
--
-- Applied rules:
--   R6 — uses user_id (auth.uid()) on transactions; no profile_id touch here.
--   R7 — RLS on transactions already exists; we keep it intact.
--   R8 — no new authorization function; we rely on existing RLS via INVOKER.
--   R9 — destructive operations (DELETE on mirror) are scoped by id only.
--   R13/R14 — no logs of amount/description; only ids surface in errors.
--
-- Security posture:
--   Both functions are SECURITY INVOKER (default) so the caller's RLS applies
--   on every read/write. We pin search_path to avoid hijacking. We do NOT
--   grant EXECUTE to anon — only authenticated.

-- ---------------------------------------------------------------------------
-- 1. Schema change: link a reimbursed expense to its payment mirror
-- ---------------------------------------------------------------------------
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS reimbursement_payment_id UUID NULL
    REFERENCES public.transactions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.transactions.reimbursement_payment_id IS
  'When this expense is marked reimbursed and lives on a credit card, points '
  'to the auto-generated mirror transaction (is_card_payment=true) that '
  'reduces the invoice. NULL otherwise. ON DELETE SET NULL keeps history if '
  'the mirror is removed manually.';

-- Partial index: most rows are NULL, only mirror-linked rows benefit from the
-- index. Used by unmark_reimbursed and audit queries.
CREATE INDEX IF NOT EXISTS idx_transactions_reimbursement_payment_id
  ON public.transactions(reimbursement_payment_id)
  WHERE reimbursement_payment_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. RPC: mark a transaction as reimbursed (idempotent)
-- ---------------------------------------------------------------------------
-- Behavior:
--   - Loads the original transaction (RLS-checked).
--   - If reimbursement_payment_id is already set: just bumps status to
--     'reimbursed' and returns the existing payment id (idempotent).
--   - If credit_card_id IS NULL: only flips status, no financial side-effect.
--   - Otherwise: inserts a mirror income transaction (is_card_payment=true)
--     keeping the same due_date so it lands on the same invoice cycle, then
--     stamps the original with reimbursement_payment_id and recomputes the
--     card's current_invoice.
--
-- Atomicity: PL/pgSQL function runs inside an implicit transaction.
-- Authorization: SECURITY INVOKER — RLS on public.transactions enforces
--   that the caller may only act on its own rows.
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

  -- Recompute card invoice. Math mirrors src/hooks/useCreditCardInvoiceSync.ts.
  UPDATE public.credit_cards cc
     SET current_invoice = sub.total
    FROM (
      SELECT GREATEST(
        0,
        COALESCE(
          SUM(
            CASE
              WHEN is_card_payment THEN -amount
              WHEN is_refund THEN -amount
              WHEN type = 'expense' THEN amount
              ELSE 0
            END
          ),
          0
        )
      ) AS total
      FROM public.transactions
      WHERE credit_card_id = v_original.credit_card_id
        AND is_provisional = false
        AND status = 'completed'
    ) sub
   WHERE cc.id = v_original.credit_card_id;

  RETURN v_payment_id;
END;
$$;

COMMENT ON FUNCTION public.mark_reimbursed(uuid) IS
  'Marks a transaction as reimbursed and, when credit_card_id is set, inserts '
  'a mirror income transaction (is_card_payment=true) to reduce the invoice. '
  'Idempotent on reimbursement_payment_id. Returns the payment mirror id or '
  'NULL when no card is linked. SECURITY INVOKER — relies on RLS.';

REVOKE ALL ON FUNCTION public.mark_reimbursed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_reimbursed(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPC: revert a reimbursement (delete mirror + downgrade status)
-- ---------------------------------------------------------------------------
-- Behavior:
--   - Validates p_new_status is one of 'pending' | 'requested'.
--   - Loads original (RLS-checked).
--   - If linked to a mirror: deletes the mirror (RLS enforces ownership).
--   - Resets reimbursement_status / reimbursement_payment_id on the original.
--   - Recomputes card current_invoice.
CREATE OR REPLACE FUNCTION public.unmark_reimbursed(
  p_transaction_id uuid,
  p_new_status text
)
RETURNS void
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

  IF p_new_status IS NULL OR p_new_status NOT IN ('pending', 'requested') THEN
    RAISE EXCEPTION 'invalid new status (allowed: pending, requested)'
      USING ERRCODE = '22023';
  END IF;

  -- FOR UPDATE: serialize concurrent unmarks against this row.
  SELECT * INTO v_original
    FROM public.transactions
   WHERE id = p_transaction_id
   FOR UPDATE;

  IF v_original.id IS NULL THEN
    RAISE EXCEPTION 'transaction not found or not accessible' USING ERRCODE = '42704';
  END IF;

  v_payment_id := v_original.reimbursement_payment_id;

  IF v_payment_id IS NOT NULL THEN
    -- ON DELETE SET NULL on the FK keeps original.reimbursement_payment_id
    -- consistent even if a concurrent path also clears it.
    DELETE FROM public.transactions
     WHERE id = v_payment_id;
  END IF;

  UPDATE public.transactions
     SET reimbursement_status     = p_new_status,
         reimbursement_payment_id = NULL
   WHERE id = p_transaction_id;

  IF v_original.credit_card_id IS NOT NULL THEN
    UPDATE public.credit_cards cc
       SET current_invoice = sub.total
      FROM (
        SELECT GREATEST(
          0,
          COALESCE(
            SUM(
              CASE
                WHEN is_card_payment THEN -amount
                WHEN is_refund THEN -amount
                WHEN type = 'expense' THEN amount
                ELSE 0
              END
            ),
            0
          )
        ) AS total
        FROM public.transactions
        WHERE credit_card_id = v_original.credit_card_id
          AND is_provisional = false
          AND status = 'completed'
      ) sub
     WHERE cc.id = v_original.credit_card_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.unmark_reimbursed(uuid, text) IS
  'Reverts a reimbursement: deletes the mirror payment (if any), resets the '
  'original status to pending|requested and recomputes the invoice. '
  'SECURITY INVOKER — relies on RLS.';

REVOKE ALL ON FUNCTION public.unmark_reimbursed(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unmark_reimbursed(uuid, text) TO authenticated;
