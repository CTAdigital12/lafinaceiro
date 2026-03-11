
-- Add initial_balance column
ALTER TABLE public.accounts ADD COLUMN initial_balance numeric NOT NULL DEFAULT 0;

-- Compute initial_balance for existing accounts:
-- initial_balance = current_balance - sum(all transactions for this account)
-- where income adds and expense subtracts
UPDATE public.accounts a
SET initial_balance = a.current_balance - COALESCE(
  (SELECT SUM(
    CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END
  )
  FROM public.transactions t
  WHERE t.account_id = a.id
  ), 0
);
