import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { LinkKind } from "@/lib/investments/linkCandidate";

/**
 * Janela em dias usada para filtrar lançamentos candidatos em torno da data
 * informada da operação. Mantém a lista do select curta e focada.
 */
const DATE_WINDOW_DAYS = 30;

export interface UnlinkedIncomeRow {
  id: string;
  account_id: string | null;
  amount: number;
  date: string; // ISO yyyy-mm-dd
  description: string;
  category_id: string | null;
  user_id: string;
}

/** Mesma forma para despesa: a lista serve aos dois lados. */
export type UnlinkedTransactionRow = UnlinkedIncomeRow;

/** Prefixo de cache comum — a mutação de operação invalida os dois lados. */
export const UNLINKED_TRANSACTIONS_KEY = "unlinked_transactions";

function shiftIsoDate(iso: string, days: number): string {
  // iso é "yyyy-mm-dd"; usar Date pra evitar criar Date de string ambígua.
  const [y, m, d] = iso.split("-").map((n) => Number(n));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * Lista lançamentos da conta selecionada — RECEITAS para resgate, DESPESAS
 * para aplicação —, dentro de uma janela de ±30 dias da data da operação, que
 * ainda NÃO estão linkados a nenhuma `investment_transactions.linked_transaction_id`.
 *
 * Despesa entrou em 21/11/2026: a parcela do título de capitalização já chega
 * debitada pelo extrato, e a aplicação precisa VINCULAR esse débito em vez de
 * criar outro (que dobraria a saída da conta). Pagamento de fatura nunca é
 * candidato.
 *
 * IMPORTANTE — Defesa em profundidade vs. shared_access:
 * A RLS de SELECT em `transactions` permite leitura de receitas de OUTROS
 * usuários quando há shared_access ativo. Para evitar que esta feature linke
 * uma receita do dono compartilhado a um investimento individual (vetor de
 * cross-tenant lock pelo UNIQUE índice em linked_transaction_id), filtramos
 * explicitamente por `user_id = auth user.id`. RLS continua sendo a fonte
 * autoritativa para acesso; este filtro restringe o escopo ao próprio usuário.
 *
 * Filtros adicionais: `status='completed'` e `is_provisional=false` — receitas
 * pendentes/provisórias não compõem saldo (regra já consolidada em
 * `useAccounts`) e portanto não fazem sentido como destino de um resgate real.
 *
 * PostgREST não suporta `NOT IN` com subquery direta, então buscamos os dois
 * sets e fazemos diff em memória. Para o volume típico (<1k linhas linkadas)
 * isso é barato; se passar disso, migrar para uma view ou RPC.
 */
export function useUnlinkedTransactions(
  kind: LinkKind,
  accountId: string | undefined,
  refDate: string | undefined,
  enabled: boolean = true,
) {
  const { user } = useAuth();

  const isEnabled = !!user && !!accountId && !!refDate && enabled;

  const query = useQuery({
    queryKey: [UNLINKED_TRANSACTIONS_KEY, kind, user?.id, accountId, refDate],
    enabled: isEnabled,
    queryFn: async (): Promise<UnlinkedTransactionRow[]> => {
      if (!accountId || !refDate || !user?.id) return [];

      const startDate = shiftIsoDate(refDate, -DATE_WINDOW_DAYS);
      const endDate = shiftIsoDate(refDate, DATE_WINDOW_DAYS);

      const [incomesRes, linkedRes] = await Promise.all([
        supabase
          .from("transactions")
          .select("id, account_id, amount, date, description, category_id, user_id, is_card_payment")
          .eq("user_id", user.id)
          .eq("account_id", accountId)
          .eq("type", kind)
          .eq("status", "completed")
          .eq("is_provisional", false)
          .gte("date", startDate)
          .lte("date", endDate)
          .order("date", { ascending: false })
          .limit(100),
        supabase
          .from("investment_transactions")
          .select("linked_transaction_id")
          .not("linked_transaction_id", "is", null),
      ]);

      if (incomesRes.error) throw incomesRes.error;
      if (linkedRes.error) throw linkedRes.error;

      const linkedSet = new Set(
        (linkedRes.data ?? [])
          .map((row) => row.linked_transaction_id)
          .filter((id): id is string => !!id),
      );

      // Em memória, e não `.eq("is_card_payment", false)`: a coluna aceita
      // NULL, e o `eq` deixaria de fora as linhas antigas sem o valor.
      return (incomesRes.data ?? [])
        .filter((tx) => !linkedSet.has(tx.id) && !tx.is_card_payment)
        .map(({ is_card_payment: _cardPayment, ...row }) => row);
    },
    staleTime: 30_000,
  });

  return {
    transactions: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error as Error | null,
  };
}

/** Atalho do lado do resgate (receitas), com o nome de antes. */
export function useUnlinkedIncomes(
  accountId: string | undefined,
  refDate: string | undefined,
  enabled: boolean = true,
) {
  const { transactions, ...rest } = useUnlinkedTransactions("income", accountId, refDate, enabled);
  return { incomes: transactions, ...rest };
}
