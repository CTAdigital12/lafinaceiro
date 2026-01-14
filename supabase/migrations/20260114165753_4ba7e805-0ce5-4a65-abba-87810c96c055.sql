-- Fix existing credit card transactions with NULL due_date
UPDATE transactions t
SET due_date = (
  CASE 
    WHEN EXTRACT(DAY FROM t.date) > cc.closing_date THEN
      make_date(
        EXTRACT(YEAR FROM t.date + INTERVAL '1 month')::integer,
        EXTRACT(MONTH FROM t.date + INTERVAL '1 month')::integer,
        cc.due_date
      )
    ELSE
      make_date(
        EXTRACT(YEAR FROM t.date)::integer,
        EXTRACT(MONTH FROM t.date)::integer,
        cc.due_date
      )
  END
)
FROM credit_cards cc
WHERE cc.id = t.credit_card_id
AND t.credit_card_id IS NOT NULL
AND t.due_date IS NULL;