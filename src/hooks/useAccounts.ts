import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { fetchRealizedNetByAccount } from "@/lib/accountBalance";

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

      // Soma paginada e filtrada no banco (auditoria C2). Antes buscava todas
      // as transações de uma vez e filtrava no cliente — o que estourava o
      // teto de linhas do PostgREST em silêncio e truncava o saldo.
      const netByAccount = await fetchRealizedNetByAccount();

      return (rawAccounts || []).map((acc) => {
        const initialBalance = Number(acc.initial_balance ?? 0);
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
      // `computed_balance` é calculado no cliente e não é coluna: fora antes
      // do update. `Partial<Account>` já o declara, então não há cast aqui.
      const { computed_balance: _computed, ...dbFields } = account;
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
