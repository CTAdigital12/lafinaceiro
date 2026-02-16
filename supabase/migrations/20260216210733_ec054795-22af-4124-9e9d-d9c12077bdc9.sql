
-- Nova tabela recurring_rules
CREATE TABLE recurring_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  description text NOT NULL,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  credit_card_id uuid REFERENCES credit_cards(id) ON DELETE SET NULL,
  estimated_amount numeric NOT NULL DEFAULT 0,
  type text NOT NULL DEFAULT 'expense',
  day_of_month integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE recurring_rules ENABLE ROW LEVEL SECURITY;

-- RLS policies (padrao owner + shared_access)
CREATE POLICY "Users can view own or shared recurring_rules" ON recurring_rules
  FOR SELECT USING (
    auth.uid() = user_id OR EXISTS (
      SELECT 1 FROM shared_access 
      WHERE shared_with_user_id = auth.uid() AND owner_id = recurring_rules.user_id
    )
  );

CREATE POLICY "Users can insert own recurring_rules" ON recurring_rules
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own or shared recurring_rules" ON recurring_rules
  FOR UPDATE USING (
    auth.uid() = user_id OR EXISTS (
      SELECT 1 FROM shared_access 
      WHERE shared_with_user_id = auth.uid() AND owner_id = recurring_rules.user_id
    )
  );

CREATE POLICY "Users can delete own recurring_rules" ON recurring_rules
  FOR DELETE USING (auth.uid() = user_id);

-- Trigger updated_at
CREATE TRIGGER update_recurring_rules_updated_at 
  BEFORE UPDATE ON recurring_rules 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Novos campos em transactions
ALTER TABLE transactions ADD COLUMN is_provisional boolean NOT NULL DEFAULT false;
ALTER TABLE transactions ADD COLUMN recurring_rule_id uuid REFERENCES recurring_rules(id) ON DELETE SET NULL;
