import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { InstallmentRow } from "@/lib/installmentsReport";

/**
 * Todas as parcelas do usuário — passadas e futuras — para o relatório de
 * Parcelamentos.
 *
 * O filtro é `total_installments > 1`, e não `installment_group_id`: as partes
 * secundárias de uma parcela dividida (rateio por categoria) não herdam o
 * grupo, só o número/total da parcela. Filtrar pelo grupo esconderia essas
 * partes e subestimaria o valor de cada mês. Ver `src/lib/installmentsReport.ts`.
 *
 * Diferente das outras abas de Relatórios, aqui não dá para reaproveitar
 * `useTransactions`: ele traz a página de transações do mês (ou 10k linhas de
 * tudo) e o que interessa aqui é a cauda futura inteira, que é pequena.
 */
export function useInstallmentsReport() {
  const { user } = useAuth();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["installments-report", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select(
          `id, description, amount, date, due_date, status, is_refund, is_card_payment,
           is_corporate_expense, is_reimbursable,
           installment_group_id, installment_number, total_installments,
           split_group_id, split_parent_id, credit_card_id,
           categories (name, icon),
           credit_cards (id, name, color)`
        )
        .eq("type", "expense")
        .gt("total_installments", 1)
        .order("date", { ascending: true })
        .limit(5000);

      if (error) throw error;
      return (data ?? []) as unknown as InstallmentRow[];
    },
    enabled: !!user,
  });

  return { rows, isLoading };
}
