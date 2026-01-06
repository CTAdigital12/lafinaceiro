-- Create table for categorization rules (auto-learning)
CREATE TABLE public.categorization_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  keyword TEXT NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, keyword)
);

-- Enable RLS
ALTER TABLE public.categorization_rules ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own rules" 
ON public.categorization_rules 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own rules" 
ON public.categorization_rules 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own rules" 
ON public.categorization_rules 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own rules" 
ON public.categorization_rules 
FOR DELETE 
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_categorization_rules_updated_at
BEFORE UPDATE ON public.categorization_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();