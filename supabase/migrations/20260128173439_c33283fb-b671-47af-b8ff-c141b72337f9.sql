-- Create invoice cycles table for tracking closed/open invoice states
CREATE TABLE public.credit_card_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  credit_card_id UUID NOT NULL REFERENCES public.credit_cards(id) ON DELETE CASCADE,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  closed_amount NUMERIC DEFAULT NULL,
  due_date DATE DEFAULT NULL,
  closing_date DATE DEFAULT NULL,
  closed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  CONSTRAINT credit_card_invoices_month_check CHECK (month >= 1 AND month <= 12),
  CONSTRAINT credit_card_invoices_year_check CHECK (year >= 2020),
  CONSTRAINT credit_card_invoices_status_check CHECK (status IN ('open', 'closed', 'paid')),
  CONSTRAINT credit_card_invoices_unique_period UNIQUE(credit_card_id, month, year)
);

-- Enable Row Level Security
ALTER TABLE public.credit_card_invoices ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own invoices" 
  ON public.credit_card_invoices 
  FOR SELECT 
  USING (auth.uid() = user_id);
  
CREATE POLICY "Users can insert own invoices" 
  ON public.credit_card_invoices 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);
  
CREATE POLICY "Users can update own invoices" 
  ON public.credit_card_invoices 
  FOR UPDATE 
  USING (auth.uid() = user_id);
  
CREATE POLICY "Users can delete own invoices" 
  ON public.credit_card_invoices 
  FOR DELETE 
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_credit_card_invoices_updated_at
  BEFORE UPDATE ON public.credit_card_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();