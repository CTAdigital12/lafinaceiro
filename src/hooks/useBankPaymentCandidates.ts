import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { subDays, addDays, format } from "date-fns";

export interface BankPaymentCandidate {
  id: string;
  description: string;
  amount: number;
  date: string;
  account_id: string;
  account_name: string;
  is_card_payment: boolean;
}

interface UseBankPaymentCandidatesOptions {
  targetAmount: number;
  dueDate: Date;
  enabled?: boolean;
}

export function useBankPaymentCandidates({
  targetAmount,
  dueDate,
  enabled = true,
}: UseBankPaymentCandidatesOptions) {
  const { user } = useAuth();

  // Search window: 10 days before and 5 days after due date
  const startDate = format(subDays(dueDate, 10), "yyyy-MM-dd");
  const endDate = format(addDays(dueDate, 5), "yyyy-MM-dd");

  // Amount tolerance: 20% to 200% of target amount (to catch partial payments too)
  const minAmount = targetAmount * 0.2;
  const maxAmount = targetAmount * 2.0;

  const { data: candidates = [], isLoading } = useQuery({
    queryKey: [
      "bank-payment-candidates",
      user?.id,
      targetAmount,
      startDate,
      endDate,
    ],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select(
          `
          id,
          description,
          amount,
          date,
          account_id,
          is_card_payment,
          accounts!inner(name)
        `
        )
        .not("account_id", "is", null)
        .is("credit_card_id", null)
        .eq("type", "expense")
        .gte("date", startDate)
        .lte("date", endDate)
        .gte("amount", minAmount)
        .lte("amount", maxAmount)
        .order("date", { ascending: false });

      if (error) throw error;

      return (data || []).map((t) => ({
        id: t.id,
        description: t.description,
        amount: Number(t.amount),
        date: t.date,
        account_id: t.account_id!,
        account_name: (t.accounts as unknown as { name: string })?.name || "",
        is_card_payment: t.is_card_payment || false,
      })) as BankPaymentCandidate[];
    },
    enabled: !!user && enabled && targetAmount > 0,
  });

  return {
    candidates,
    isLoading,
  };
}
