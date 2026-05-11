import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Janela em dias usada para filtrar receitas candidatas em torno da data
 * informada do resgate. Mantém a lista do select curta e focada.
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

function shiftIsoDate(iso: string, days: number): string {
  // iso é "yyyy-mm-dd"; usar Date pra evitar criar Date de string ambígua.
  const [y, m, d] = iso.split("-").map((n) => Number(n));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * Lista receitas (`transactions.type='income'`) na conta selecionada, dentro
 * de uma janela de ±30 dias da data do resgate, que ainda NÃO estão linkadas
 * a nenhuma `investment_transactions.linked_transaction_id`.
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
export function useUnlinkedIncomes(
  accountId: string | undefined,
  refDate: string | undefined,
  enabled: boolean = true,
) {
  const { user } = useAuth();

  const isEnabled = !!user && !!accountId && !!refDate && enabled;

  const query = useQuery({
    queryKey: ["unlinked_incomes", user?.id, accountId, refDate],
    enabled: isEnabled,
    queryFn: async (): Promise<UnlinkedIncomeRow[]> => {
      if (!accountId || !refDate || !user?.id) return [];

      const startDate = shiftIsoDate(refDate, -DATE_WINDOW_DAYS);
      const endDate = shiftIsoDate(refDate, DATE_WINDOW_DAYS);

      const [incomesRes, linkedRes] = await Promise.all([
        supabase
          .from("transactions")
          .select("id, account_id, amount, date, description, category_id, user_id")
          .eq("user_id", user.id)
          .eq("account_id", accountId)
          .eq("type", "income")
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

      return (incomesRes.data ?? []).filter((tx) => !linkedSet.has(tx.id));
    },
    staleTime: 30_000,
  });

  return {
    incomes: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error as Error | null,
  };
}
