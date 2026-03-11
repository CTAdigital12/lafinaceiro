import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export interface Account {
  id: string;
  user_id: string;
  name: string;
  type: "bank" | "wallet" | "savings" | "investment";
  current_balance: number;
  initial_balance: number;
  icon: string;
  color: string;
  created_at: string;
  updated_at: string;
  /** Saldo calculado dinamicamente: initial_balance + sum(completed, !provisional, date<=today) */
  computed_balance: number;
}

export function useAccounts() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["accounts", user?.id],
    queryFn: async () => {
      const { data: rawAccounts, error } = await supabase
        .from("accounts")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch realized transaction sums per account
      const today = new Date().toISOString().split("T")[0];
      const { data: txData, error: txError } = await supabase
        .from("transactions")
        .select("account_id, type, amount, status, is_provisional, date")
        .not("account_id", "is", null);

      if (txError) throw txError;

      // Calculate net per account (only completed, non-provisional, date <= today)
      const netByAccount: Record<string, number> = {};
      for (const tx of txData || []) {
        if (!tx.account_id) continue;
        if (tx.status !== "completed") continue;
        if (tx.is_provisional) continue;
        if (tx.date > today) continue;

        const sign = tx.type === "income" ? 1 : -1;
        netByAccount[tx.account_id] = (netByAccount[tx.account_id] || 0) + sign * Number(tx.amount);
      }

      return (rawAccounts || []).map((acc) => {
        const initialBalance = Number((acc as any).initial_balance ?? 0);
        const txNet = netByAccount[acc.id] || 0;
        return {
          ...acc,
          initial_balance: initialBalance,
          computed_balance: initialBalance + txNet,
        } as Account;
      });
    },
    enabled: !!user,
  });

  const createAccount = useMutation({
    mutationFn: async (account: Omit<Account, "id" | "user_id" | "created_at" | "updated_at" | "computed_balance" | "initial_balance"> & { initial_balance?: number }) => {
      if (!user?.id) {
        throw new Error("Usuário não autenticado");
      }
      
      const initialBalance = account.current_balance || 0;
      const { data, error } = await supabase
        .from("accounts")
        .insert([{ 
          ...account, 
          user_id: user.id,
          initial_balance: initialBalance,
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast({ title: "Conta criada com sucesso!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao criar conta", description: error.message, variant: "destructive" });
    },
  });

  const updateAccount = useMutation({
    mutationFn: async ({ id, ...account }: Partial<Account> & { id: string }) => {
      // Remove computed field before sending to DB
      const { computed_balance, ...dbFields } = account as any;
      const { data, error } = await supabase
        .from("accounts")
        .update(dbFields)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast({ title: "Conta atualizada!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar conta", description: error.message, variant: "destructive" });
    },
  });

  const deleteAccount = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast({ title: "Conta excluída!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao excluir conta", description: error.message, variant: "destructive" });
    },
  });

  const totalBalance = accounts.reduce((sum, acc) => sum + acc.computed_balance, 0);

  return {
    accounts,
    isLoading,
    totalBalance,
    createAccount,
    updateAccount,
    deleteAccount,
  };
}
