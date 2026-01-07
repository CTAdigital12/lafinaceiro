-- Add parent_id column to categories for subcategories support
ALTER TABLE public.categories 
ADD COLUMN parent_id uuid REFERENCES public.categories(id) ON DELETE CASCADE;

-- Create index for better performance on parent lookups
CREATE INDEX idx_categories_parent_id ON public.categories(parent_id);