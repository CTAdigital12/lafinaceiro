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
  corporateReimbursed: number; // Corporate expenses already reimbursed
  corporatePending: number; // Corporate expenses pending reimbursement
  personalTotal: number; // transactionsTotal - corporateTotal
  isPaid: boolean; // Whether the invoice has been paid
  paidAmount: number; // Total payments made for this card in the period
}

export interface ReconciliationSummary {
  totalBankInvoice: number;
  totalTransactions: number;
  totalDifference: number;
  totalCorporate: number;
  totalCorporateReimbursed: number;
  totalCorporatePending: number;
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
  imported_at: string | null;
  is_card_payment: boolean | null;
  reimbursement_status: string | null;
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

  // Fetch invoice cycles for the period to get closed_amount
  const { data: invoiceCyclesData = [] } = useQuery({
    queryKey: ["invoice-cycles-reconciliation", user?.id, month, year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_card_invoices")
        .select("*")
        .eq("month", month)
        .eq("year", year);

      if (error) throw error;
      return data || [];
    },
    enabled: !!user && creditCards.length > 0,
  });

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["credit-card-transactions-reconciliation", user?.id, month, year],
    queryFn: async () => {
      // Include transactions where:
      // 1. due_date is within the period, OR
      // 2. due_date is NULL and date is within the period (for refunds/adjustments without due_date)
      // Include expenses OR payment transactions (is_card_payment = true, which may be type = 'income')
      const { data, error } = await supabase
        .from("transactions")
        .select("*, categories(name, icon)")
        .not("credit_card_id", "is", null)
        .eq("is_provisional", false)
        .or(`type.eq.expense,is_card_payment.eq.true`)
        .or(`and(due_date.gte.${periodStart},due_date.lte.${periodEnd}),and(due_date.is.null,date.gte.${periodStart},date.lte.${periodEnd})`);

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

    // Separate expense transactions from payment transactions
    // Payment transactions (is_card_payment = true) should not be counted as expenses
    const expenseTransactions = cardTransactions.filter(
      (t) => t.is_card_payment !== true
    );

    const completedTransactions = expenseTransactions.filter(
      (t) => t.status === "completed"
    );
    const pendingTransactions = expenseTransactions.filter(
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

    // Separate refunds by type (personal vs corporate)
    const corporateRefunds = refundTransactions
      .filter((t) => t.is_corporate_expense)
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const personalRefunds = refundTransactions
      .filter((t) => !t.is_corporate_expense)
      .reduce((sum, t) => sum + Number(t.amount), 0);

    // Corporate = normal corporate transactions - corporate refunds
    const corporateNormal = normalTransactions
      .filter((t) => t.is_corporate_expense)
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const corporateTotal = corporateNormal - corporateRefunds;

    // Corporate reimbursement breakdown
    const corporateReimbursed = normalTransactions
      .filter((t) => t.is_corporate_expense && t.reimbursement_status === 'reimbursed')
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const corporatePending = corporateTotal - corporateReimbursed;

    // Personal = normal personal transactions - personal refunds
    const personalNormal = normalTransactions
      .filter((t) => !t.is_corporate_expense)
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const personalTotal = personalNormal - personalRefunds;

    // Get invoice cycle for this card/month/year
    const invoiceCycle = invoiceCyclesData.find(
      (ic) => ic.credit_card_id === card.id
    );
    const closedAmount = invoiceCycle?.closed_amount != null ? Number(invoiceCycle.closed_amount) : null;
    const invoiceStatus = invoiceCycle?.status || "open";
    
    // bankInvoice = closed_amount if invoice is closed, otherwise use transactionsTotal
    const bankInvoice = closedAmount ?? transactionsTotal;
    
    // Find payment transactions for this card (is_card_payment = true)
    // These are transactions that represent invoice payments
    const paymentTransactions = cardTransactions.filter(
      (t) => t.is_card_payment === true
    );
    
    // Sum of payments made for this card in the period
    const paidAmount = paymentTransactions.reduce(
      (sum, t) => sum + Number(t.amount),
      0
    );
    
    // Detect if invoice is paid:
    // - invoice status is 'paid' OR
    // - payments cover the transactions total
    const isPaid = invoiceStatus === "paid" || (paidAmount >= transactionsTotal && transactionsTotal > 0 && paidAmount > 0);
    
    // Calculate difference: bankInvoice vs transactionsTotal
    // When closed: shows if there are missing/extra transactions vs closed amount
    // When open: bankInvoice === transactionsTotal, so difference is 0
    const difference = isPaid 
      ? transactionsTotal - paidAmount
      : bankInvoice - transactionsTotal;
    
    // Only show discrepancy if difference is significant AND invoice is not paid
    const hasDiscrepancy = Math.abs(difference) > 0.01 && !isPaid;

    return {
      creditCardId: card.id,
      creditCardName: card.name,
      bankInvoice,
      transactionsTotal,
      pendingTotal,
      refundTotal,
      difference,
      hasDiscrepancy,
      corporateTotal,
      corporateReimbursed,
      corporatePending,
      personalTotal,
      isPaid,
      paidAmount,
    };
  });

  const summary: ReconciliationSummary = {
    totalBankInvoice: cards.reduce((sum, c) => sum + c.bankInvoice, 0),
    totalTransactions: cards.reduce((sum, c) => sum + c.transactionsTotal, 0),
    totalDifference: cards.reduce((sum, c) => sum + c.difference, 0),
    totalCorporate: cards.reduce((sum, c) => sum + c.corporateTotal, 0),
    totalCorporateReimbursed: cards.reduce((sum, c) => sum + c.corporateReimbursed, 0),
    totalCorporatePending: cards.reduce((sum, c) => sum + c.corporatePending, 0),
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
