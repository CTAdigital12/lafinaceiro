-- Create investment_institutions table
CREATE TABLE public.investment_institutions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '🏦',
  color TEXT DEFAULT '#3B82F6',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.investment_institutions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own or shared investment_institutions"
  ON public.investment_institutions
  FOR SELECT
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM shared_access
      WHERE shared_access.shared_with_user_id = auth.uid()
      AND shared_access.owner_id = investment_institutions.user_id
    )
  );

CREATE POLICY "Users can insert own investment_institutions"
  ON public.investment_institutions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own investment_institutions"
  ON public.investment_institutions
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own investment_institutions"
  ON public.investment_institutions
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add updated_at trigger
CREATE TRIGGER update_investment_institutions_updated_at
  BEFORE UPDATE ON public.investment_institutions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add institution_id to investment_assets
ALTER TABLE public.investment_assets
ADD COLUMN institution_id UUID REFERENCES public.investment_institutions(id) ON DELETE SET NULL;