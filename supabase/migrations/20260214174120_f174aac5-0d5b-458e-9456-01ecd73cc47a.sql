
-- transactions
DROP POLICY "Users can update own transactions" ON transactions;
CREATE POLICY "Users can update own or shared transactions" ON transactions
  FOR UPDATE USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM shared_access 
      WHERE shared_access.shared_with_user_id = auth.uid() 
      AND shared_access.owner_id = transactions.user_id
    )
  );

-- categories
DROP POLICY "Users can update own categories" ON categories;
CREATE POLICY "Users can update own or shared categories" ON categories
  FOR UPDATE USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM shared_access 
      WHERE shared_access.shared_with_user_id = auth.uid() 
      AND shared_access.owner_id = categories.user_id
    )
  );

-- accounts
DROP POLICY "Users can update own accounts" ON accounts;
CREATE POLICY "Users can update own or shared accounts" ON accounts
  FOR UPDATE USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM shared_access 
      WHERE shared_access.shared_with_user_id = auth.uid() 
      AND shared_access.owner_id = accounts.user_id
    )
  );

-- credit_cards
DROP POLICY "Users can update own credit_cards" ON credit_cards;
CREATE POLICY "Users can update own or shared credit_cards" ON credit_cards
  FOR UPDATE USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM shared_access 
      WHERE shared_access.shared_with_user_id = auth.uid() 
      AND shared_access.owner_id = credit_cards.user_id
    )
  );

-- budgets
DROP POLICY "Users can update own budgets" ON budgets;
CREATE POLICY "Users can update own or shared budgets" ON budgets
  FOR UPDATE USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM shared_access 
      WHERE shared_access.shared_with_user_id = auth.uid() 
      AND shared_access.owner_id = budgets.user_id
    )
  );

-- credit_card_invoices
DROP POLICY "Users can update own invoices" ON credit_card_invoices;
CREATE POLICY "Users can update own or shared invoices" ON credit_card_invoices
  FOR UPDATE USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM shared_access 
      WHERE shared_access.shared_with_user_id = auth.uid() 
      AND shared_access.owner_id = credit_card_invoices.user_id
    )
  );
