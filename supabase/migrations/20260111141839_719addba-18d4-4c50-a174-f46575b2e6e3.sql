-- Add due_date and imported_at columns to transactions table
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS due_date date,
ADD COLUMN IF NOT EXISTS imported_at timestamp with time zone;

-- Add comment for documentation
COMMENT ON COLUMN public.transactions.due_date IS 'Data de vencimento da fatura (para transações de cartão de crédito)';
COMMENT ON COLUMN public.transactions.imported_at IS 'Data e hora em que a transação foi importada de um arquivo';