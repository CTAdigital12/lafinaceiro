import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface CreditCardTransaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  category_id: string | null;
  is_corporate_expense: boolean;
  categories?: { name: string; icon: string; color: string } | null;
}

export function useCreditCardTransactions(creditCardId: string | null) {
  const { user } = useAuth();

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["credit_card_transactions", creditCardId],
    queryFn: async () => {
      if (!creditCardId) return [];
      
      const { data, error } = await supabase
        .from("transactions")
        .select(`
          id,
          description,
          amount,
          date,
          category_id,
          is_corporate_expense,
          categories (name, icon, color)
        `)
        .eq("credit_card_id", creditCardId)
        .order("date", { ascending: false });

      if (error) throw error;
      return data as CreditCardTransaction[];
    },
    enabled: !!user && !!creditCardId,
  });

  const personalTransactions = transactions.filter((t) => !t.is_corporate_expense);
  const corporateTransactions = transactions.filter((t) => t.is_corporate_expense);

  const totalAmount = transactions.reduce((sum, t) => sum + Number(t.amount), 0);
  const personalTotal = personalTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
  const corporateTotal = corporateTransactions.reduce((sum, t) => sum + Number(t.amount), 0);

  return {
    transactions,
    personalTransactions,
    corporateTransactions,
    totalAmount,
    personalTotal,
    corporateTotal,
    isLoading,
  };
}
