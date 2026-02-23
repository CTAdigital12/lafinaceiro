import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, startOfMonth, endOfMonth } from "date-fns";

export interface ExistingInstallment {
  id: string;
  description: string;
  amount: number;
  date: string;
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
        .select("id, description, amount, date, installment_number, total_installments")
        .eq("credit_card_id", creditCardId)
        .eq("type", "expense")
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
 * Detects duplicate transactions by comparing imported items against existing transactions.
 * Handles both installments (by amount + installment numbers) and one-off expenses
 * (by amount + date + normalized description). Uses a tolerance of ±R$ 0.05.
 */
export function detectDuplicates(
  importedItems: Array<{
    transaction_value: number;
    installment_current?: number | null;
    installment_total?: number | null;
    purchase_date?: string;
    description?: string;
  }>,
  existingTransactions: ExistingInstallment[]
): Map<number, ExistingInstallment> {
  const duplicateMap = new Map<number, ExistingInstallment>();
  const usedExistingIds = new Set<string>();
  const TOLERANCE = 0.05;

  importedItems.forEach((item, index) => {
    const isInstallment = !!(item.installment_current && item.installment_total);

    const match = existingTransactions.find((existing) => {
      if (usedExistingIds.has(existing.id)) return false;

      const amountMatch = Math.abs(Number(existing.amount) - item.transaction_value) <= TOLERANCE;
      if (!amountMatch) return false;

      if (isInstallment) {
        return (
          existing.installment_number === item.installment_current &&
          existing.total_installments === item.installment_total
        );
      } else {
        const dateMatch = existing.date === item.purchase_date;
        const descMatch =
          existing.description?.trim().toUpperCase() ===
          item.description?.trim().toUpperCase();
        return dateMatch && descMatch;
      }
    });

    if (match) {
      duplicateMap.set(index, match);
      usedExistingIds.add(match.id);
    }
  });

  return duplicateMap;
}
