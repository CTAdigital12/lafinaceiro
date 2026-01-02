-- Create invitations table to manage shared access
CREATE TABLE public.invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_email TEXT NOT NULL,
  invited_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  accepted_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Policies for invitations
CREATE POLICY "Owners can view their sent invitations"
  ON public.invitations FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Invited users can view invitations sent to them"
  ON public.invitations FOR SELECT
  USING (auth.email() = invited_email OR auth.uid() = invited_user_id);

CREATE POLICY "Owners can create invitations"
  ON public.invitations FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can delete their invitations"
  ON public.invitations FOR DELETE
  USING (auth.uid() = owner_id);

CREATE POLICY "Invited users can update invitation status"
  ON public.invitations FOR UPDATE
  USING (auth.email() = invited_email OR auth.uid() = invited_user_id);

-- Create shared_access table to track who has access to whose data
CREATE TABLE public.shared_access (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_with_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(owner_id, shared_with_user_id)
);

-- Enable RLS
ALTER TABLE public.shared_access ENABLE ROW LEVEL SECURITY;

-- Policies for shared_access
CREATE POLICY "Owners and shared users can view access"
  ON public.shared_access FOR SELECT
  USING (auth.uid() = owner_id OR auth.uid() = shared_with_user_id);

CREATE POLICY "Owners can manage shared access"
  ON public.shared_access FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can revoke access"
  ON public.shared_access FOR DELETE
  USING (auth.uid() = owner_id);

-- Update RLS policies for accounts to allow shared access
DROP POLICY IF EXISTS "Users can view own accounts" ON public.accounts;
CREATE POLICY "Users can view own or shared accounts"
  ON public.accounts FOR SELECT
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM public.shared_access 
      WHERE shared_with_user_id = auth.uid() AND owner_id = accounts.user_id
    )
  );

-- Update RLS policies for transactions to allow shared access
DROP POLICY IF EXISTS "Users can view own transactions" ON public.transactions;
CREATE POLICY "Users can view own or shared transactions"
  ON public.transactions FOR SELECT
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM public.shared_access 
      WHERE shared_with_user_id = auth.uid() AND owner_id = transactions.user_id
    )
  );

-- Update RLS policies for categories to allow shared access
DROP POLICY IF EXISTS "Users can view own categories" ON public.categories;
CREATE POLICY "Users can view own or shared categories"
  ON public.categories FOR SELECT
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM public.shared_access 
      WHERE shared_with_user_id = auth.uid() AND owner_id = categories.user_id
    )
  );

-- Update RLS policies for credit_cards to allow shared access
DROP POLICY IF EXISTS "Users can view own credit_cards" ON public.credit_cards;
CREATE POLICY "Users can view own or shared credit_cards"
  ON public.credit_cards FOR SELECT
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM public.shared_access 
      WHERE shared_with_user_id = auth.uid() AND owner_id = credit_cards.user_id
    )
  );

-- Update RLS policies for budgets to allow shared access
DROP POLICY IF EXISTS "Users can view own budgets" ON public.budgets;
CREATE POLICY "Users can view own or shared budgets"
  ON public.budgets FOR SELECT
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM public.shared_access 
      WHERE shared_with_user_id = auth.uid() AND owner_id = budgets.user_id
    )
  );