import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCreditCards } from "./useCreditCards";

export interface CardReconciliation {
  creditCardId: string;
  creditCardName: string;
  bankInvoice: number; // current_invoice from credit_cards table
  transactionsTotal: number; // Sum of completed transactions
  pendingTotal: number; // Sum of pending transactions
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
  hasAnyDiscrepancy: boolean;
  cards: CardReconciliation[];
}

export function useCreditCardReconciliation() {
  const { user } = useAuth();
  const { creditCards } = useCreditCards();

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["credit-card-transactions-reconciliation", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .not("credit_card_id", "is", null)
        .eq("type", "expense");

      if (error) throw error;
      return data || [];
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

    const transactionsTotal = completedTransactions.reduce(
      (sum, t) => sum + Number(t.amount),
      0
    );
    const pendingTotal = pendingTransactions.reduce(
      (sum, t) => sum + Number(t.amount),
      0
    );
    const corporateTotal = completedTransactions
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
    hasAnyDiscrepancy: cards.some((c) => c.hasDiscrepancy),
    cards,
  };

  return {
    reconciliation: summary,
    isLoading,
    cards,
  };
}
