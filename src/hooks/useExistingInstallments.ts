import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, startOfMonth, endOfMonth } from "date-fns";

export interface ExistingInstallment {
  id: string;
  description: string;
  original_description: string | null;
  amount: number;
  date: string;
  installment_number: number | null;
  total_installments: number | null;
  split_group_id: string | null;
  split_parent_id: string | null;
  is_refund: boolean | null;
}

interface UseExistingInstallmentsParams {
  creditCardId: string;
  month: number;
  year: number;
  enabled?: boolean;
}

/**
 * Hook to fetch existing transactions for a specific credit card and period.
 * Used for deduplication during invoice import (both installments and one-off expenses).
 */
export function useExistingInstallments({
  creditCardId,
  month,
  year,
  enabled = true,
}: UseExistingInstallmentsParams) {
  const { user } = useAuth();

  const periodStart = format(startOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");
  const periodEnd = format(endOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");

  return useQuery({
    queryKey: ["existing-installments", creditCardId, month, year],
    queryFn: async (): Promise<ExistingInstallment[]> => {
      const { data, error } = await supabase
        .from("transactions")
        // split_group_id/split_parent_id: detectDuplicates colapsa as partes de
        // uma transação dividida para casar com a linha única da fatura.
        .select("id, description, original_description, amount, date, installment_number, total_installments, split_group_id, split_parent_id, is_refund")
        .eq("credit_card_id", creditCardId)
        // Estorno entra, mesmo gravado como receita: um crédito da fatura é
        // `type='income' + is_refund=true`, e filtrar só por despesa fazia o
        // dedup nunca enxergá-lo — reimportar a fatura duplicava todo estorno.
        // Mesmo defeito do A10, aqui no caminho da importação.
        .or("type.eq.expense,is_refund.eq.true")
        .or(
          `and(due_date.gte.${periodStart},due_date.lte.${periodEnd}),and(due_date.is.null,date.gte.${periodStart},date.lte.${periodEnd})`
        );

      if (error) throw error;
      return (data || []) as ExistingInstallment[];
    },
    enabled: !!user && !!creditCardId && enabled,
  });
}

// Re-export detectDuplicates from the centralized deduplication module
export { detectDuplicates } from "@/lib/deduplication";
