-- Create projects table
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  target_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  icon text DEFAULT '📦',
  color text DEFAULT '#3B82F6',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own or shared projects"
  ON public.projects FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM shared_access
      WHERE shared_access.shared_with_user_id = auth.uid()
        AND shared_access.owner_id = projects.user_id
    )
  );

CREATE POLICY "Users can insert own projects"
  ON public.projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own or shared projects"
  ON public.projects FOR UPDATE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM shared_access
      WHERE shared_access.shared_with_user_id = auth.uid()
        AND shared_access.owner_id = projects.user_id
    )
  );

CREATE POLICY "Users can delete own projects"
  ON public.projects FOR DELETE
  USING (auth.uid() = user_id);

-- Reuse existing updated_at trigger
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add project_id to transactions
ALTER TABLE public.transactions
  ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;