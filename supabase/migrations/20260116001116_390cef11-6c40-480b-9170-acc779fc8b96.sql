-- Update existing transactions that are credit card payments based on description patterns
UPDATE transactions 
SET is_card_payment = true 
WHERE is_card_payment = false
  AND (
    description ILIKE '%FATURA PAGA%'
    OR description ILIKE '%PAG FATURA%'
    OR description ILIKE '%PAGAMENTO FATURA%'
    OR description ILIKE '%FATURA CARTAO%'
    OR description ILIKE '%FATURA CARTÃO%'
    OR description ILIKE '%PAG CARTAO%'
    OR description ILIKE '%PAG CARTÃO%'
    OR description ILIKE '%PGTO FATURA%'
    OR description ILIKE '%VISA FATURA%'
    OR description ILIKE '%MASTERCARD FATURA%'
    OR description ILIKE '%ELO FATURA%'
    OR description ILIKE '%AMEX FATURA%'
    OR description ILIKE '%HIPERCARD FATURA%'
  );