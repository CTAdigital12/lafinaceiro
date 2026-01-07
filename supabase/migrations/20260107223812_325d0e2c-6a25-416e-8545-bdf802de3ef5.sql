-- Investment assets table (holdings)
CREATE TABLE public.investment_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  ticker TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('renda_fixa', 'renda_variavel', 'fiis', 'crypto', 'saldo_corretora')),
  quantity NUMERIC NOT NULL DEFAULT 0,
  average_price NUMERIC NOT NULL DEFAULT 0,
  current_price NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Investment transactions table (buy, sell, dividend)
CREATE TABLE public.investment_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  asset_id UUID REFERENCES public.investment_assets(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('buy', 'sell', 'dividend')),
  quantity NUMERIC NOT NULL DEFAULT 0,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  fees NUMERIC NOT NULL DEFAULT 0,
  total_value NUMERIC NOT NULL DEFAULT 0,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  realized_profit NUMERIC,
  linked_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.investment_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_transactions ENABLE ROW LEVEL SECURITY;

-- RLS policies for investment_assets
CREATE POLICY "Users can view own or shared investment_assets"
ON public.investment_assets FOR SELECT
USING (
  auth.uid() = user_id OR 
  EXISTS (
    SELECT 1 FROM shared_access 
    WHERE shared_access.shared_with_user_id = auth.uid() 
    AND shared_access.owner_id = investment_assets.user_id
  )
);

CREATE POLICY "Users can insert own investment_assets"
ON public.investment_assets FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own investment_assets"
ON public.investment_assets FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own investment_assets"
ON public.investment_assets FOR DELETE
USING (auth.uid() = user_id);

-- RLS policies for investment_transactions
CREATE POLICY "Users can view own or shared investment_transactions"
ON public.investment_transactions FOR SELECT
USING (
  auth.uid() = user_id OR 
  EXISTS (
    SELECT 1 FROM shared_access 
    WHERE shared_access.shared_with_user_id = auth.uid() 
    AND shared_access.owner_id = investment_transactions.user_id
  )
);

CREATE POLICY "Users can insert own investment_transactions"
ON public.investment_transactions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own investment_transactions"
ON public.investment_transactions FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own investment_transactions"
ON public.investment_transactions FOR DELETE
USING (auth.uid() = user_id);

-- Update trigger for investment_assets
CREATE TRIGGER update_investment_assets_updated_at
BEFORE UPDATE ON public.investment_assets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();