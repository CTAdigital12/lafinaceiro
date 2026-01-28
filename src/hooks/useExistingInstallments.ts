import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, startOfMonth, endOfMonth } from "date-fns";

export interface ExistingInstallment {
  id: string;
  description: string;
  amount: number;
  installment_number: number | null;
  total_installments: number | null;
}

interface UseExistingInstallmentsParams {
  creditCardId: string;
  month: number;
  year: number;
  enabled?: boolean;
}

/**
 * Hook to fetch existing installments for a specific credit card and period.
 * Used for deduplication during invoice import.
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
        .select("id, description, amount, installment_number, total_installments")
        .eq("credit_card_id", creditCardId)
        .eq("type", "expense")
        .not("installment_number", "is", null)
        .or(
          `and(due_date.gte.${periodStart},due_date.lte.${periodEnd}),and(due_date.is.null,date.gte.${periodStart},date.lte.${periodEnd})`
        );

      if (error) throw error;
      return (data || []) as ExistingInstallment[];
    },
    enabled: !!user && !!creditCardId && enabled,
  });
}

/**
 * Detects duplicate installments by comparing imported items against existing transactions.
 * Uses a tolerance of ±R$ 0.05 for amount comparison.
 */
export function detectDuplicates(
  importedItems: Array<{
    transaction_value: number;
    installment_current?: number | null;
    installment_total?: number | null;
  }>,
  existingInstallments: ExistingInstallment[]
): Map<number, ExistingInstallment> {
  const duplicateMap = new Map<number, ExistingInstallment>();
  const TOLERANCE = 0.05;

  importedItems.forEach((item, index) => {
    // Only check items that are installments
    if (!item.installment_current || !item.installment_total) return;

    const match = existingInstallments.find(
      (existing) =>
        Math.abs(Number(existing.amount) - item.transaction_value) <= TOLERANCE &&
        existing.installment_number === item.installment_current &&
        existing.total_installments === item.installment_total
    );

    if (match) {
      duplicateMap.set(index, match);
    }
  });

  return duplicateMap;
}
