
-- Table to store Pluggy items (bank connections)
CREATE TABLE public.pluggy_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  pluggy_item_id text NOT NULL UNIQUE,
  connector_name text,
  connector_logo text,
  status text NOT NULL DEFAULT 'UPDATED',
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  credit_card_id uuid REFERENCES public.credit_cards(id) ON DELETE SET NULL,
  last_sync_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.pluggy_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own pluggy_items" ON public.pluggy_items
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own pluggy_items" ON public.pluggy_items
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pluggy_items" ON public.pluggy_items
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own pluggy_items" ON public.pluggy_items
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Add pluggy_account_id to accounts for mapping
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS pluggy_account_id text UNIQUE;

-- Add pluggy_account_id to credit_cards for mapping
ALTER TABLE public.credit_cards ADD COLUMN IF NOT EXISTS pluggy_account_id text UNIQUE;
