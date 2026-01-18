-- Add new columns for fixed income handling
ALTER TABLE investment_assets ADD COLUMN IF NOT EXISTS pricing_method TEXT DEFAULT 'unit_price';
ALTER TABLE investment_assets ADD COLUMN IF NOT EXISTS current_balance NUMERIC DEFAULT 0;
ALTER TABLE investment_assets ADD COLUMN IF NOT EXISTS yield_info TEXT;

-- Migrate existing fixed income assets to use total_balance method
UPDATE investment_assets 
SET pricing_method = 'total_balance',
    current_balance = quantity * current_price
WHERE asset_type IN ('renda_fixa', 'saldo_corretora');

-- Update variable income assets to explicitly use unit_price
UPDATE investment_assets 
SET pricing_method = 'unit_price'
WHERE asset_type IN ('acoes', 'fiis', 'etfs', 'crypto', 'bdrs');