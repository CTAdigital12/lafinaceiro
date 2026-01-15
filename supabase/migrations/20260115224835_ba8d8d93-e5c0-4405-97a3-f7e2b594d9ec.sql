-- Add column to identify credit card invoice payments (should not appear in expense reports)
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS is_card_payment BOOLEAN DEFAULT false;