import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { startOfMonth, endOfMonth, format } from "date-fns";

export interface InvoiceTransaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  due_date: string | null;
  is_corporate_expense: boolean;
  is_reimbursable: boolean;
  is_refund: boolean;
  status: string;
  reimbursement_status: string | null;
  split_group_id: string | null;
  category_name: string | null;
  category_icon: string | null;
}

interface UseInvoiceTransactionsOptions {
  creditCardId: string;
  month: number;
  year: number;
  enabled?: boolean;
}

export function useInvoiceTransactions({
  creditCardId,
  month,
  year,
  enabled = true,
}: UseInvoiceTransactionsOptions) {
  const { user } = useAuth();

  const periodStart = format(startOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");
  const periodEnd = format(endOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["invoice-transactions", creditCardId, month, year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select(
          `
          id,
          description,
          amount,
          date,
          due_date,
          is_corporate_expense,
          is_reimbursable,
          is_refund,
          status,
          reimbursement_status,
          split_group_id,
          categories(name, icon)
        `
        )
        .eq("credit_card_id", creditCardId)
        .eq("type", "expense")
        .eq("status", "completed")
        .or(
          `and(due_date.gte.${periodStart},due_date.lte.${periodEnd}),and(due_date.is.null,date.gte.${periodStart},date.lte.${periodEnd})`
        )
        .order("date", { ascending: false });

      if (error) throw error;

      return (data || []).map((t) => ({
        id: t.id,
        description: t.description,
        amount: Number(t.amount),
        date: t.date,
        due_date: t.due_date,
        is_corporate_expense: t.is_corporate_expense,
        is_reimbursable: t.is_reimbursable,
        is_refund: t.is_refund,
        status: t.status,
        reimbursement_status: t.reimbursement_status ?? null,
        split_group_id: t.split_group_id ?? null,
        category_name: (t.categories as { name: string } | null)?.name || null,
        category_icon: (t.categories as { icon: string } | null)?.icon || null,
      })) as InvoiceTransaction[];
    },
    enabled: !!user && !!creditCardId && enabled,
  });

  // Calculate totals with 3 categories
  const normalTransactions = transactions.filter((t) => !t.is_refund);
  const refundTransactions = transactions.filter((t) => t.is_refund);

  // Already-reimbursed expenses no longer represent a debt to settle on the
  // invoice modal: a mirror payment was created by mark_reimbursed and is
  // reducing current_invoice on the card row. We exclude them from corporate
  // and reimbursable totals so PayInvoiceModal does not double-count.
  const isPendingReimbursement = (t: InvoiceTransaction) =>
    t.reimbursement_status !== "reimbursed";

  // Corporate: is_corporate_expense = true (excluding already-reimbursed)
  const corporateNormal = normalTransactions
    .filter((t) => t.is_corporate_expense && isPendingReimbursement(t))
    .reduce((sum, t) => sum + t.amount, 0);
  const corporateRefunds = refundTransactions
    .filter((t) => t.is_corporate_expense && isPendingReimbursement(t))
    .reduce((sum, t) => sum + t.amount, 0);
  const corporateTotal = corporateNormal - corporateRefunds;

  // Reimbursable: is_reimbursable = true AND is_corporate_expense = false
  // (also excluding already-reimbursed)
  const reimbursableNormal = normalTransactions
    .filter(
      (t) => t.is_reimbursable && !t.is_corporate_expense && isPendingReimbursement(t)
    )
    .reduce((sum, t) => sum + t.amount, 0);
  const reimbursableRefunds = refundTransactions
    .filter(
      (t) => t.is_reimbursable && !t.is_corporate_expense && isPendingReimbursement(t)
    )
    .reduce((sum, t) => sum + t.amount, 0);
  const reimbursableTotal = reimbursableNormal - reimbursableRefunds;

  // Personal: is_corporate_expense = false AND is_reimbursable = false
  const personalNormal = normalTransactions
    .filter((t) => !t.is_corporate_expense && !t.is_reimbursable)
    .reduce((sum, t) => sum + t.amount, 0);
  const personalRefunds = refundTransactions
    .filter((t) => !t.is_corporate_expense && !t.is_reimbursable)
    .reduce((sum, t) => sum + t.amount, 0);
  const personalTotal = personalNormal - personalRefunds;

  // My total to pay = reimbursable + personal (both come out of my pocket)
  const myTotalToPay = reimbursableTotal + personalTotal;
  const transactionsTotal = corporateTotal + reimbursableTotal + personalTotal;

  // Fetch invoice cycle for this card/month/year to get closedAmount
  const { data: invoiceCycleData } = useQuery({
    queryKey: ["invoice-cycle-for-payment", creditCardId, month, year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_card_invoices")
        .select("closed_amount, status")
        .eq("credit_card_id", creditCardId)
        .eq("month", month)
        .eq("year", year)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!user && !!creditCardId && enabled,
  });

  const closedAmount = invoiceCycleData?.closed_amount != null ? Number(invoiceCycleData.closed_amount) : null;
  const invoiceStatus = (invoiceCycleData?.status as string) || "open";

  return {
    transactions,
    isLoading,
    corporateTotal,
    reimbursableTotal,
    personalTotal,
    myTotalToPay,
    transactionsTotal,
    closedAmount,
    invoiceStatus,
  };
}
