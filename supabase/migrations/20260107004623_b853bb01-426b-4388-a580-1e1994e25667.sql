-- Add is_corporate_expense field to transactions table
ALTER TABLE public.transactions 
ADD COLUMN is_corporate_expense boolean NOT NULL DEFAULT false;

-- Add is_corporate flag to categorization_rules for learning corporate vendors
ALTER TABLE public.categorization_rules 
ADD COLUMN is_corporate boolean NOT NULL DEFAULT false;

-- Create index for faster filtering
CREATE INDEX idx_transactions_is_corporate ON public.transactions(is_corporate_expense);