import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDate } from "@/contexts/DateContext";
import { useToast } from "@/hooks/use-toast";
import { useState, useCallback } from "react";
import { useCreditCardInvoiceSync } from "./useCreditCardInvoiceSync";
import { isMonthlyExpense, isMonthlyExpenseRefund, isMonthlyIncome } from "@/lib/transactionFilters";
import { endOfMonthYmd, invoicePeriodFromDueDate, startOfMonthYmd } from "@/lib/dateUtils";

// Utility to check if invoice is closed for a given card/month/year
async function checkInvoiceClosed(creditCardId: string | null | undefined, dueDate: string | null | undefined): Promise<{ isClosed: boolean; message?: string }> {
  if (!creditCardId || !dueDate) {
    return { isClosed: false };
  }

  // Este caminho já fazia o parsing correto por string; agora usa o helper
  // compartilhado para não existirem duas implementações da mesma conta.
  const period = invoicePeriodFromDueDate(dueDate);
  if (!period) {
    return { isClosed: false };
  }
  const { month, year } = period;

  const { data, error } = await supabase
    .from("credit_card_invoices")
    .select("status")
    .eq("credit_card_id", creditCardId)
    .eq("month", month)
    .eq("year", year)
    .maybeSingle();

  if (error) {
    console.error("Error checking invoice status:", error);
    return { isClosed: false };
  }

  if (data?.status === "closed") {
    return {
      isClosed: true,
      message: "Esta fatura está fechada. Por segurança, você precisa reabri-la antes de modificar lançamentos.",
    };
  }

  return { isClosed: false };
}

export interface Transaction {
  id: string;
  user_id: string;
  account_id: string | null;
  credit_card_id: string | null;
  category_id: string | null;
  description: string;
  amount: number;
  type: "income" | "expense";
  date: string;
  due_date: string | null;
  imported_at: string | null;
  status: "completed" | "pending";
  is_corporate_expense: boolean;
  is_refund: boolean;
  is_reimbursable: boolean;
  is_reimbursement: boolean;
  is_card_payment: boolean | null;
  refunded_transaction_id: string | null;
  reimbursement_status: string | null;
  reimbursement_payment_id: string | null;
  reimbursement_income_id: string | null;
  // Installment fields
  installment_group_id: string | null;
  installment_number: number | null;
  total_installments: number | null;
  // Split fields (transação dividida em várias categorias)
  split_group_id: string | null;
  split_parent_id: string | null;
  is_provisional: boolean;
  recurring_rule_id: string | null;
  project_id: string | null;
  card_last_digits: string | null;
  created_at: string;
  updated_at: string;
  categories?: { id: string; name: string; icon: string; color: string } | null;
  accounts?: { name: string } | null;
  credit_cards?: { id: string; name: string; last_digits: string; color: string | null } | null;
  projects?: { id: string; name: string; icon: string | null; color: string | null } | null;
}

interface UseTransactionsOptions {
  showAll?: boolean;
  loadedCount?: number;
  filterByDueDate?: boolean;
  creditCardFilter?: "only" | "exclude" | null;
  searchQuery?: string;
  useHybridDateFilter?: boolean; // For Dashboard: date for regular transactions, due_date for credit card
}

export function useTransactions(overrideMonth?: number, overrideYear?: number, options: UseTransactionsOptions = {}) {
  const { user } = useAuth();
  const { month: contextMonth, year: contextYear } = useDate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { syncInvoiceForCard } = useCreditCardInvoiceSync();

  const { showAll = false, loadedCount = 20, filterByDueDate = false, creditCardFilter = null, searchQuery = "", useHybridDateFilter = false } = options;

  // Use override values if provided, otherwise use context
  const month = overrideMonth ?? contextMonth;
  const year = overrideYear ?? contextYear;

  // endOfMonthYmd em vez de `new Date(year, month, 0).toISOString()`: o
  // toISOString converte para UTC e, em fusos a leste de Greenwich, devolvia o
  // penúltimo dia do mês — cortando os lançamentos do último dia do filtro.
  const startDate = startOfMonthYmd(year, month);
  const endDate = endOfMonthYmd(year, month);

  // Query for transactions with "load more" support
  const { data: paginatedData, isLoading } = useQuery({
    queryKey: ["transactions", user?.id, showAll ? "all" : `${month}-${year}`, loadedCount, filterByDueDate, creditCardFilter, searchQuery, useHybridDateFilter],
    queryFn: async () => {
      let query = supabase
        .from("transactions")
        .select(`
          *,
          categories (id, name, icon, color),
          accounts (name),
          credit_cards (id, name, last_digits, color),
          projects (id, name, icon, color)
        `, { count: "exact" });

      // Apply date filter only if not showing all
      if (!showAll) {
        if (useHybridDateFilter) {
          // Hybrid filter for Dashboard:
          // - Transactions WITHOUT credit card: filter by date
          // - Transactions WITH credit card: filter by due_date
          query = query.or(
            `and(credit_card_id.is.null,date.gte.${startDate},date.lte.${endDate}),` +
            `and(credit_card_id.not.is.null,due_date.gte.${startDate},due_date.lte.${endDate})`
          );
        } else if (filterByDueDate) {
          // Filter by due_date for credit card invoices
          // Include transactions where:
          // 1. due_date is within the period, OR
          // 2. due_date is NULL and date is within the period (for refunds/adjustments without due_date)
          query = query.or(`and(due_date.gte.${startDate},due_date.lte.${endDate}),and(due_date.is.null,date.gte.${startDate},date.lte.${endDate})`);
        } else {
          // Filter by transaction date
          query = query.gte("date", startDate).lte("date", endDate);
        }
      }

      // Apply credit card filter
      if (creditCardFilter === "only") {
        query = query.not("credit_card_id", "is", null);
      } else if (creditCardFilter === "exclude") {
        query = query.is("credit_card_id", null);
      }

      // Apply search filter on database level
      if (searchQuery && searchQuery.trim() !== "") {
        query = query.ilike("description", `%${searchQuery}%`);
      }

      // Use loadedCount to limit results (for "load more" functionality)
      const { data, error, count } = await query
        .order("date", { ascending: false })
        .range(0, loadedCount - 1);

      if (error) throw error;
      return { transactions: data as Transaction[], totalCount: count || 0 };
    },
    enabled: !!user,
  });

  const transactions = paginatedData?.transactions || [];
  const totalCount = paginatedData?.totalCount || 0;
  const hasMore = transactions.length < totalCount;

  const createTransaction = useMutation({
    // split_group_id/split_parent_id ficam fora: uma transação nunca nasce
    // dividida — o rateio é feito depois, pela RPC split_transaction.
    mutationFn: async (transaction: Omit<Transaction, "id" | "user_id" | "created_at" | "updated_at" | "categories" | "accounts" | "credit_cards" | "projects" | "due_date" | "imported_at" | "reimbursement_status" | "is_provisional" | "recurring_rule_id" | "project_id" | "split_group_id" | "split_parent_id"> & { due_date?: string | null; imported_at?: string | null; reimbursement_status?: string | null; is_provisional?: boolean; recurring_rule_id?: string | null; project_id?: string | null; original_description?: string | null; silent?: boolean; skipInvoiceCheck?: boolean; skipSync?: boolean }) => {
      if (!user?.id) {
        throw new Error("Usuário não autenticado");
      }

      // Sanitize UUID fields - convert empty strings to null
      const { silent, skipInvoiceCheck, skipSync, original_description, ...transactionData } = transaction;
      const sanitizedTransaction = {
        ...transactionData,
        user_id: user.id,
        original_description: original_description || null,
        category_id: transactionData.category_id && transactionData.category_id.trim() !== "" ? transactionData.category_id : null,
        account_id: transactionData.account_id && transactionData.account_id.trim() !== "" ? transactionData.account_id : null,
        credit_card_id: transactionData.credit_card_id && transactionData.credit_card_id.trim() !== "" ? transactionData.credit_card_id : null,
        due_date: transactionData.due_date || null,
        imported_at: transactionData.imported_at || null,
        // card_last_digits tem constraint no banco (^[0-9]{4}$ ou null). Só
        // incluímos a chave quando ela foi informada (imports de fatura),
        // normalizando para os 4 últimos dígitos — valores fora do padrão (ou
        // ausentes) viram null em vez de quebrar o insert.
        ...("card_last_digits" in transactionData
          ? {
              card_last_digits: (() => {
                const raw = (transactionData as { card_last_digits?: string | null })
                  .card_last_digits;
                if (raw == null) return null;
                const digits = String(raw).replace(/\D/g, "").slice(-4);
                return /^\d{4}$/.test(digits) ? digits : null;
              })(),
            }
          : {}),
        reimbursement_status:
          transactionData.reimbursement_status ||
          (transactionData.is_reimbursable || transactionData.is_corporate_expense
            ? "pending"
            : null),
      };

      // Check if invoice is closed (skip for imports that already handled this)
      if (!skipInvoiceCheck) {
        const { isClosed, message } = await checkInvoiceClosed(
          sanitizedTransaction.credit_card_id,
          sanitizedTransaction.due_date
        );
        if (isClosed) {
          throw new Error(message);
        }
      }
      
      const { data, error } = await supabase
        .from("transactions")
        .insert([sanitizedTransaction])
        .select()
        .single();

      if (error) throw error;
      return { data, silent, skipSync, creditCardId: sanitizedTransaction.credit_card_id };
    },
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });

      // Sync credit card invoice if this was a credit card transaction.
      // Imports em massa passam skipSync e fazem um único recalc no final.
      if (result.creditCardId && !result.skipSync) {
        await syncInvoiceForCard(result.creditCardId);
      }
      
      if (!result.silent) {
        toast({ title: "Transação criada com sucesso!" });
      }
    },
    onError: (error: Error, variables) => {
      if (!variables.silent) {
        toast({ title: "Erro ao criar transação", description: error.message, variant: "destructive" });
      }
    },
  });

  const updateTransaction = useMutation({
    mutationFn: async ({ id, ...transaction }: Partial<Transaction> & { id: string }) => {
      // First, get the original transaction to check for credit card changes and invoice status
      const { data: original } = await supabase
        .from("transactions")
        .select("credit_card_id, due_date")
        .eq("id", id)
        .maybeSingle();

      // Check if original invoice is closed
      if (original) {
        const { isClosed, message } = await checkInvoiceClosed(
          original.credit_card_id,
          original.due_date
        );
        if (isClosed) {
          throw new Error(message);
        }
      }

      // If moving to a different card/period, check that one too
      if (transaction.credit_card_id && transaction.due_date) {
        const { isClosed, message } = await checkInvoiceClosed(
          transaction.credit_card_id,
          transaction.due_date
        );
        if (isClosed) {
          throw new Error(message);
        }
      }

      const { data, error } = await supabase
        .from("transactions")
        .update(transaction)
        .eq("id", id)
        .select()
        .maybeSingle();

      if (error) throw error;
      
      // Return both old and new credit card IDs for syncing
      return {
        data,
        oldCreditCardId: original?.credit_card_id,
        newCreditCardId: transaction.credit_card_id ?? data.credit_card_id,
      };
    },
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      
      // Sync credit card invoices if affected
      if (result.oldCreditCardId) {
        await syncInvoiceForCard(result.oldCreditCardId);
      }
      if (result.newCreditCardId && result.newCreditCardId !== result.oldCreditCardId) {
        await syncInvoiceForCard(result.newCreditCardId);
      }
      
      toast({ title: "Transação atualizada!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar transação", description: error.message, variant: "destructive" });
    },
  });

  const deleteTransaction = useMutation({
    mutationFn: async (id: string) => {
      // First, get the transaction to check invoice status and know which credit card to sync
      const { data: original } = await supabase
        .from("transactions")
        .select("credit_card_id, due_date")
        .eq("id", id)
        .maybeSingle();

      // Check if invoice is closed
      if (original) {
        const { isClosed, message } = await checkInvoiceClosed(
          original.credit_card_id,
          original.due_date
        );
        if (isClosed) {
          throw new Error(message);
        }
      }

      const { error } = await supabase.from("transactions").delete().eq("id", id);
      if (error) throw error;

      return { creditCardId: original?.credit_card_id };
    },
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      
      // Sync credit card invoice if this was a credit card transaction
      if (result.creditCardId) {
        await syncInvoiceForCard(result.creditCardId);
      }
      
      toast({ title: "Transação excluída!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao excluir transação", description: error.message, variant: "destructive" });
    },
  });

  const totalIncome = transactions
    .filter(isMonthlyIncome)
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const expenseTotal = transactions
    .filter(isMonthlyExpense)
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const expenseRefunds = transactions
    .filter(isMonthlyExpenseRefund)
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const totalExpense = expenseTotal - expenseRefunds;

  return {
    transactions,
    isLoading,
    totalIncome,
    totalExpense,
    totalCount,
    hasMore,
    createTransaction,
    updateTransaction,
    deleteTransaction,
  };
}
