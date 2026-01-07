-- Add reimbursement_status field to transactions table for corporate expenses
ALTER TABLE public.transactions 
ADD COLUMN reimbursement_status text DEFAULT 'pending' 
CHECK (reimbursement_status IN ('pending', 'requested', 'reimbursed'));

-- Create index for faster filtering
CREATE INDEX idx_transactions_reimbursement_status ON public.transactions(reimbursement_status) WHERE is_corporate_expense = true;