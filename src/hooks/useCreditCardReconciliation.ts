import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCreditCards } from "./useCreditCards";
import { startOfMonth, endOfMonth, format } from "date-fns";

export interface CardReconciliation {
  creditCardId: string;
  creditCardName: string;
  bankInvoice: number; // current_invoice from credit_cards table
  transactionsTotal: number; // Sum of completed transactions (minus refunds)
  pendingTotal: number; // Sum of pending transactions
  refundTotal: number; // Sum of refund transactions
  difference: number; // bankInvoice - transactionsTotal
  hasDiscrepancy: boolean;
  corporateTotal: number; // Sum of corporate expenses
  personalTotal: number; // transactionsTotal - corporateTotal
}

export interface ReconciliationSummary {
  totalBankInvoice: number;
  totalTransactions: number;
  totalDifference: number;
  totalCorporate: number;
  totalPersonal: number;
  totalRefunds: number;
  hasAnyDiscrepancy: boolean;
  cards: CardReconciliation[];
}

export interface ReconciliationTransaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  due_date: string | null;
  status: string;
  is_refund: boolean;
  is_corporate_expense: boolean;
  credit_card_id: string;
  category_id: string | null;
}

interface UseCreditCardReconciliationOptions {
  month?: number;
  year?: number;
}

export function useCreditCardReconciliation(options?: UseCreditCardReconciliationOptions) {
  const { user } = useAuth();
  const { creditCards } = useCreditCards();

  // Default to current month if not specified
  const now = new Date();
  const month = options?.month ?? now.getMonth() + 1;
  const year = options?.year ?? now.getFullYear();

  // Calculate date range based on month/year
  const periodStart = format(startOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");
  const periodEnd = format(endOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["credit-card-transactions-reconciliation", user?.id, month, year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*, categories(name, icon)")
        .not("credit_card_id", "is", null)
        .eq("type", "expense")
        .gte("due_date", periodStart)
        .lte("due_date", periodEnd);

      if (error) throw error;
      return (data || []).map(t => ({
        ...t,
        category: t.categories,
      })) as (ReconciliationTransaction & { category?: { name: string; icon: string } | null })[];
    },
    enabled: !!user && creditCards.length > 0,
  });

  // Calculate reconciliation for each card
  const cards: CardReconciliation[] = creditCards.map((card) => {
    const cardTransactions = transactions.filter(
      (t) => t.credit_card_id === card.id
    );

    const completedTransactions = cardTransactions.filter(
      (t) => t.status === "completed"
    );
    const pendingTransactions = cardTransactions.filter(
      (t) => t.status === "pending"
    );

    // Separate normal transactions from refunds
    const normalTransactions = completedTransactions.filter((t) => !t.is_refund);
    const refundTransactions = completedTransactions.filter((t) => t.is_refund);

    // Calculate totals - refunds should be subtracted
    const normalTotal = normalTransactions.reduce(
      (sum, t) => sum + Number(t.amount),
      0
    );
    const refundTotal = refundTransactions.reduce(
      (sum, t) => sum + Number(t.amount),
      0
    );
    const transactionsTotal = normalTotal - refundTotal;

    const pendingTotal = pendingTransactions.reduce(
      (sum, t) => sum + Number(t.amount),
      0
    );

    // Corporate expenses should also exclude refunds
    const corporateTotal = normalTransactions
      .filter((t) => t.is_corporate_expense)
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const bankInvoice = Number(card.current_invoice);
    const difference = bankInvoice - transactionsTotal;

    return {
      creditCardId: card.id,
      creditCardName: card.name,
      bankInvoice,
      transactionsTotal,
      pendingTotal,
      refundTotal,
      difference,
      hasDiscrepancy: Math.abs(difference) > 0.01, // Allow for floating point errors
      corporateTotal,
      personalTotal: transactionsTotal - corporateTotal,
    };
  });

  const summary: ReconciliationSummary = {
    totalBankInvoice: cards.reduce((sum, c) => sum + c.bankInvoice, 0),
    totalTransactions: cards.reduce((sum, c) => sum + c.transactionsTotal, 0),
    totalDifference: cards.reduce((sum, c) => sum + c.difference, 0),
    totalCorporate: cards.reduce((sum, c) => sum + c.corporateTotal, 0),
    totalPersonal: cards.reduce((sum, c) => sum + c.personalTotal, 0),
    totalRefunds: cards.reduce((sum, c) => sum + c.refundTotal, 0),
    hasAnyDiscrepancy: cards.some((c) => c.hasDiscrepancy),
    cards,
  };

  return {
    reconciliation: summary,
    isLoading,
    cards,
    transactions,
    month,
    year,
  };
}
