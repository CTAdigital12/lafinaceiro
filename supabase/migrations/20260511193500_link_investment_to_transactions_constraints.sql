-- Garante 1:1 entre investment_transactions e transactions via linked_transaction_id.
--
-- Contexto: a coluna investment_transactions.linked_transaction_id já existe
-- (FK p/ transactions(id) ON DELETE SET NULL, migration 20260107223812) e hoje é
-- usada para linkar uma COMPRA a uma despesa na conta corrente. Esta migration
-- adiciona suporte ao mesmo padrão na VENDA/RESGATE, garantindo que uma mesma
-- transactions só seja linkada a UMA investment_transaction (evita duplicação
-- de receita ao vincular).
--
-- Idempotente: usa IF NOT EXISTS no índice único parcial.
--
-- Pré-check (se aparecer linha, abortar e limpar antes de aplicar):
--   SELECT linked_transaction_id, COUNT(*)
--   FROM public.investment_transactions
--   WHERE linked_transaction_id IS NOT NULL
--   GROUP BY 1 HAVING COUNT(*) > 1;
--
-- Rollback documentado:
--   DROP INDEX IF EXISTS public.investment_transactions_linked_transaction_id_key;

DO $$
DECLARE
  v_dup_count integer;
BEGIN
  SELECT COUNT(*)
    INTO v_dup_count
    FROM (
      SELECT linked_transaction_id
        FROM public.investment_transactions
       WHERE linked_transaction_id IS NOT NULL
       GROUP BY linked_transaction_id
      HAVING COUNT(*) > 1
    ) AS dups;

  IF v_dup_count > 0 THEN
    RAISE EXCEPTION
      'Existem % linked_transaction_id duplicados em investment_transactions. Limpe antes de aplicar esta migration.',
      v_dup_count;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS
  investment_transactions_linked_transaction_id_key
  ON public.investment_transactions(linked_transaction_id)
  WHERE linked_transaction_id IS NOT NULL;

COMMENT ON COLUMN public.investment_transactions.linked_transaction_id
  IS 'Linka 1:1 a transactions na conta corrente. Aplica-se a compra (expense) e venda/resgate (income).';
