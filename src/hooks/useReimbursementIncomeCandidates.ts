import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Janela em dias para listar receitas candidatas a serem o reembolso (PIX /
 * transferência) de uma despesa. Mantém a lista curta e relevante.
 */
const DATE_WINDOW_DAYS = 60;

export interface IncomeCandidate {
  id: string;
  account_id: string | null;
  amount: number;
  date: string;
  description: string;
  accounts?: { name: string } | null;
}

function shiftIsoDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map((n) => Number(n));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * Lista receitas (`type='income'`) numa conta (não cartão), dentro de ±60 dias
 * da data de referência, que ainda NÃO estão marcadas como reembolso. Usadas
 * para vincular um PIX/transferência já lançado a uma despesa reembolsável.
 *
 * Filtra por user_id próprio (defesa em profundidade vs. shared_access) além da
 * RLS. Apenas completed/não-provisório, e is_reimbursement=false para não
 * reaproveitar uma receita já usada em outra baixa.
 */
export function useReimbursementIncomeCandidates(
  refDate: string | undefined,
  enabled: boolean = true,
) {
  const { user } = useAuth();
  const isEnabled = !!user && !!refDate && enabled;

  const query = useQuery({
    queryKey: ["reimbursement-income-candidates", user?.id, refDate],
    enabled: isEnabled,
    queryFn: async (): Promise<IncomeCandidate[]> => {
      if (!refDate || !user?.id) return [];

      const startDate = shiftIsoDate(refDate, -DATE_WINDOW_DAYS);
      const endDate = shiftIsoDate(refDate, DATE_WINDOW_DAYS);

      const { data, error } = await supabase
        .from("transactions")
        .select("id, account_id, amount, date, description, accounts (name)")
        .eq("user_id", user.id)
        .eq("type", "income")
        .eq("status", "completed")
        .eq("is_provisional", false)
        .eq("is_reimbursement", false)
        .not("account_id", "is", null)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: false })
        .limit(100);

      if (error) throw error;
      return (data ?? []) as IncomeCandidate[];
    },
    staleTime: 30_000,
  });

  return {
    candidates: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error as Error | null,
  };
}
