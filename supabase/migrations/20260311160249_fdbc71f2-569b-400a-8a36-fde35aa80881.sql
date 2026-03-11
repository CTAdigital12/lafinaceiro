
-- Recalculate initial_balance for all accounts using only realized transactions
-- Formula: initial_balance = current_balance - SUM(realized completed non-provisional transactions with date <= today)
-- This way computed_balance = initial_balance + SUM(realized) = current_balance (matching the legacy value that was correct before)
-- But actually we need: initial_balance = desired_balance - SUM(realized)
-- The problem is the original migration used ALL transactions, but should have used only realized ones.
-- Fix: recalculate using the correct filter (completed, non-provisional, date <= CURRENT_DATE)

UPDATE public.accounts a
SET initial_balance = a.current_balance - COALESCE(
  (SELECT SUM(
    CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END
  )
  FROM public.transactions t
  WHERE t.account_id = a.id
    AND t.status = 'completed'
    AND t.is_provisional = false
    AND t.date <= CURRENT_DATE
  ), 0
);
