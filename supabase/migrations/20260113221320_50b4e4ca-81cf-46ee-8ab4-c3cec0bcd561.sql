-- Add refund columns to transactions table
ALTER TABLE public.transactions 
ADD COLUMN is_refund boolean NOT NULL DEFAULT false;

ALTER TABLE public.transactions 
ADD COLUMN refunded_transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL;

-- Add index for better performance when querying refunded transactions
CREATE INDEX idx_transactions_refunded_transaction_id ON public.transactions(refunded_transaction_id) WHERE refunded_transaction_id IS NOT NULL;