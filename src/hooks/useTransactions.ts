import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDate } from "@/contexts/DateContext";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

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
  reimbursement_status: string | null;
  created_at: string;
  updated_at: string;
  categories?: { id: string; name: string; icon: string; color: string } | null;
  accounts?: { name: string } | null;
  credit_cards?: { id: string; name: string; last_digits: string; color: string | null } | null;
}

interface UseTransactionsOptions {
  showAll?: boolean;
  page?: number;
  pageSize?: number;
  filterByDueDate?: boolean;
  creditCardFilter?: "only" | "exclude" | null;
}

export function useTransactions(overrideMonth?: number, overrideYear?: number, options: UseTransactionsOptions = {}) {
  const { user } = useAuth();
  const { month: contextMonth, year: contextYear } = useDate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { showAll = false, page = 1, pageSize = 20, filterByDueDate = false, creditCardFilter = null } = options;

  // Use override values if provided, otherwise use context
  const month = overrideMonth ?? contextMonth;
  const year = overrideYear ?? contextYear;

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(year, month, 0).toISOString().split("T")[0];

  // Query for paginated transactions (all or filtered by date)
  const { data: paginatedData, isLoading } = useQuery({
    queryKey: ["transactions", user?.id, showAll ? "all" : `${month}-${year}`, page, pageSize, filterByDueDate, creditCardFilter],
    queryFn: async () => {
      let query = supabase
        .from("transactions")
        .select(`
          *,
          categories (id, name, icon, color),
          accounts (name),
          credit_cards (id, name, last_digits, color)
        `, { count: "exact" });

      // Apply date filter only if not showing all
      if (!showAll) {
        if (filterByDueDate) {
          // Filter by due_date for credit card invoices
          query = query.gte("due_date", startDate).lte("due_date", endDate);
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

      // Apply pagination only if not fetching all transactions for dashboard
      if (options.showAll) {
        const { data, error, count } = await query
          .order("date", { ascending: false });

        if (error) throw error;
        return { transactions: data as Transaction[], totalCount: count || 0 };
      } else {
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        const { data, error, count } = await query
          .order("date", { ascending: false })
          .range(from, to);

        if (error) throw error;
        return { transactions: data as Transaction[], totalCount: count || 0 };
      }
    },
    enabled: !!user,
  });

  const transactions = paginatedData?.transactions || [];
  const totalCount = paginatedData?.totalCount || 0;
  // When showAll is true, we load all transactions without pagination
  // so totalPages should be 1 (no pagination needed)
  const totalPages = showAll ? 1 : Math.ceil(totalCount / pageSize);

  const createTransaction = useMutation({
    mutationFn: async (transaction: Omit<Transaction, "id" | "user_id" | "created_at" | "updated_at" | "categories" | "accounts" | "credit_cards" | "due_date" | "imported_at" | "reimbursement_status"> & { due_date?: string | null; imported_at?: string | null; reimbursement_status?: string | null; silent?: boolean }) => {
      // Sanitize UUID fields - convert empty strings to null
      const { silent, ...transactionData } = transaction;
      const sanitizedTransaction = {
        ...transactionData,
        user_id: user?.id,
        category_id: transactionData.category_id && transactionData.category_id.trim() !== "" ? transactionData.category_id : null,
        account_id: transactionData.account_id && transactionData.account_id.trim() !== "" ? transactionData.account_id : null,
        credit_card_id: transactionData.credit_card_id && transactionData.credit_card_id.trim() !== "" ? transactionData.credit_card_id : null,
        due_date: transactionData.due_date || null,
        imported_at: transactionData.imported_at || null,
        reimbursement_status: transactionData.reimbursement_status || null,
      };
      
      const { data, error } = await supabase
        .from("transactions")
        .insert([sanitizedTransaction])
        .select()
        .single();

      if (error) throw error;
      return { data, silent };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
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
      const { data, error } = await supabase
        .from("transactions")
        .update(transaction)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast({ title: "Transação atualizada!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar transação", description: error.message, variant: "destructive" });
    },
  });

  const deleteTransaction = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("transactions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast({ title: "Transação excluída!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao excluir transação", description: error.message, variant: "destructive" });
    },
  });

  const totalIncome = transactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  // Exclude corporate expenses from personal expense total
  const totalExpense = transactions
    .filter((t) => t.type === "expense" && !t.is_corporate_expense)
    .reduce((sum, t) => sum + Number(t.amount), 0);

  return {
    transactions,
    isLoading,
    totalIncome,
    totalExpense,
    totalCount,
    totalPages,
    createTransaction,
    updateTransaction,
    deleteTransaction,
  };
}
