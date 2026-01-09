import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCreditCards } from "./useCreditCards";
import { addMonths, format, parse, differenceInDays, isBefore, isAfter } from "date-fns";

export interface PendingInstallment {
  id: string;
  description: string;
  amount: number;
  date: string;
  credit_card_id: string;
  credit_card_name: string;
  credit_card_color: string;
  closing_date: number;
  days_until_closing: number;
  is_near_closing: boolean;
  is_past_closing: boolean;
  category_name?: string;
  category_icon?: string;
}

export interface InstallmentSummary {
  totalPending: number;
  totalAmount: number;
  nearClosingCount: number;
  byMonth: {
    month: string;
    amount: number;
    count: number;
  }[];
  byCreditCard: {
    id: string;
    name: string;
    color: string;
    amount: number;
    count: number;
  }[];
}

export function usePendingInstallments() {
  const { user } = useAuth();
  const { creditCards } = useCreditCards();

  const { data: pendingInstallments = [], isLoading } = useQuery({
    queryKey: ["pending-installments", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select(`
          *,
          categories (name, icon, color),
          credit_cards (name, color, closing_date)
        `)
        .eq("status", "pending")
        .eq("type", "expense")
        .not("credit_card_id", "is", null)
        .order("date", { ascending: true });

      if (error) throw error;

      const today = new Date();

      return (data || []).map((transaction): PendingInstallment => {
        const creditCard = transaction.credit_cards;
        const closingDate = creditCard?.closing_date || 1;
        
        // Calculate next closing date
        const transactionDate = parse(transaction.date, "yyyy-MM-dd", new Date());
        let nextClosingDate = new Date(transactionDate.getFullYear(), transactionDate.getMonth(), closingDate);
        
        // If transaction date is after this month's closing, use next month's closing
        if (isAfter(transactionDate, nextClosingDate)) {
          nextClosingDate = addMonths(nextClosingDate, 1);
        }
        
        const daysUntilClosing = differenceInDays(nextClosingDate, today);
        const isNearClosing = daysUntilClosing >= 0 && daysUntilClosing <= 7;
        const isPastClosing = daysUntilClosing < 0;

        return {
          id: transaction.id,
          description: transaction.description,
          amount: Number(transaction.amount),
          date: transaction.date,
          credit_card_id: transaction.credit_card_id!,
          credit_card_name: creditCard?.name || "Cartão",
          credit_card_color: creditCard?.color || "from-gray-500 to-gray-600",
          closing_date: closingDate,
          days_until_closing: daysUntilClosing,
          is_near_closing: isNearClosing,
          is_past_closing: isPastClosing,
          category_name: transaction.categories?.name,
          category_icon: transaction.categories?.icon,
        };
      });
    },
    enabled: !!user,
  });

  // Calculate summary
  const summary: InstallmentSummary = {
    totalPending: pendingInstallments.length,
    totalAmount: pendingInstallments.reduce((sum, i) => sum + i.amount, 0),
    nearClosingCount: pendingInstallments.filter((i) => i.is_near_closing).length,
    byMonth: [],
    byCreditCard: [],
  };

  // Group by month
  const monthMap = new Map<string, { amount: number; count: number }>();
  pendingInstallments.forEach((installment) => {
    const date = parse(installment.date, "yyyy-MM-dd", new Date());
    const monthKey = format(date, "yyyy-MM");
    const existing = monthMap.get(monthKey) || { amount: 0, count: 0 };
    monthMap.set(monthKey, {
      amount: existing.amount + installment.amount,
      count: existing.count + 1,
    });
  });
  
  summary.byMonth = Array.from(monthMap.entries())
    .map(([month, data]) => ({ month, ...data }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // Group by credit card
  const cardMap = new Map<string, { name: string; color: string; amount: number; count: number }>();
  pendingInstallments.forEach((installment) => {
    const existing = cardMap.get(installment.credit_card_id) || {
      name: installment.credit_card_name,
      color: installment.credit_card_color,
      amount: 0,
      count: 0,
    };
    cardMap.set(installment.credit_card_id, {
      ...existing,
      amount: existing.amount + installment.amount,
      count: existing.count + 1,
    });
  });
  
  summary.byCreditCard = Array.from(cardMap.entries())
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.amount - a.amount);

  return {
    pendingInstallments,
    isLoading,
    summary,
    nearClosingInstallments: pendingInstallments.filter((i) => i.is_near_closing),
  };
}
