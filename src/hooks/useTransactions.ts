import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

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
  status: "completed" | "pending";
  is_corporate_expense: boolean;
  created_at: string;
  updated_at: string;
  categories?: { name: string; icon: string; color: string } | null;
  accounts?: { name: string } | null;
}

export function useTransactions(month?: number, year?: number) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const currentDate = new Date();
  const selectedMonth = month ?? currentDate.getMonth() + 1;
  const selectedYear = year ?? currentDate.getFullYear();

  const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`;
  const endDate = new Date(selectedYear, selectedMonth, 0).toISOString().split("T")[0];

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["transactions", user?.id, selectedMonth, selectedYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select(`
          *,
          categories (name, icon, color),
          accounts (name)
        `)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: false });

      if (error) throw error;
      return data as Transaction[];
    },
    enabled: !!user,
  });

  const createTransaction = useMutation({
    mutationFn: async (transaction: Omit<Transaction, "id" | "user_id" | "created_at" | "updated_at" | "categories" | "accounts">) => {
      const { data, error } = await supabase
        .from("transactions")
        .insert([{ ...transaction, user_id: user?.id }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast({ title: "Transação criada com sucesso!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao criar transação", description: error.message, variant: "destructive" });
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
    createTransaction,
    updateTransaction,
    deleteTransaction,
  };
}
