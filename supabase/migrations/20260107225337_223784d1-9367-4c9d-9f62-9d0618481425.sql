-- Add maturity_date column to investment_assets for fixed income assets
ALTER TABLE public.investment_assets
ADD COLUMN maturity_date DATE;