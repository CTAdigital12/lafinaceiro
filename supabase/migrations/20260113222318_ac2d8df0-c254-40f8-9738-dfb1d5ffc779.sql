-- Add installment grouping fields to transactions table
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS installment_group_id uuid DEFAULT NULL,
ADD COLUMN IF NOT EXISTS installment_number integer DEFAULT NULL,
ADD COLUMN IF NOT EXISTS total_installments integer DEFAULT NULL;

-- Create index for efficient group queries
CREATE INDEX IF NOT EXISTS idx_transactions_installment_group_id 
ON public.transactions(installment_group_id) 
WHERE installment_group_id IS NOT NULL;