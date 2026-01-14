-- Add is_reimbursable column to transactions table
ALTER TABLE public.transactions 
ADD COLUMN is_reimbursable BOOLEAN NOT NULL DEFAULT false;

-- Migrate existing data: transactions with category "Compras reembolsáveis" will be marked
UPDATE public.transactions 
SET is_reimbursable = true 
WHERE category_id = 'c94368b8-b2c0-4162-93b0-7536d9f4ed1e';