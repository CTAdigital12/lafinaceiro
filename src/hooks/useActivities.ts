import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export interface Activity {
  imported_at: string;
  transaction_count: number;
  total_amount: number;
  source_type: "credit_card" | "account";
  source_name: string;
  first_date: string;
  last_date: string;
  credit_card_id: string | null;
  account_id: string | null;
}

export function useActivities() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const activitiesQuery = useQuery({
    queryKey: ["activities", user?.id],
    queryFn: async (): Promise<Activity[]> => {
      if (!user) return [];

      // Fetch transactions with imported_at set (imports only)
      const { data: transactions, error } = await supabase
        .from("transactions")
        .select(`
          imported_at,
          amount,
          date,
          credit_card_id,
          account_id,
          credit_cards(name),
          accounts(name)
        `)
        .not("imported_at", "is", null)
        .order("imported_at", { ascending: false });

      if (error) throw error;
      if (!transactions || transactions.length === 0) return [];

      // Group by imported_at
      const grouped = new Map<string, {
        transactions: typeof transactions;
        credit_card_id: string | null;
        account_id: string | null;
        credit_card_name: string | null;
        account_name: string | null;
      }>();

      for (const tx of transactions) {
        if (!tx.imported_at) continue;
        
        const key = tx.imported_at;
        if (!grouped.has(key)) {
          grouped.set(key, {
            transactions: [],
            credit_card_id: tx.credit_card_id,
            account_id: tx.account_id,
            credit_card_name: (tx.credit_cards as { name: string } | null)?.name || null,
            account_name: (tx.accounts as { name: string } | null)?.name || null,
          });
        }
        grouped.get(key)!.transactions.push(tx);
      }

      // Convert to Activity array
      const activities: Activity[] = [];
      for (const [imported_at, group] of grouped) {
        const dates = group.transactions.map(t => t.date).sort();
        const totalAmount = group.transactions.reduce((sum, t) => sum + Number(t.amount), 0);
        
        const sourceType = group.credit_card_id ? "credit_card" : "account";
        const sourceName = group.credit_card_id 
          ? group.credit_card_name || "Cartão" 
          : group.account_name || "Conta";

        activities.push({
          imported_at,
          transaction_count: group.transactions.length,
          total_amount: totalAmount,
          source_type: sourceType,
          source_name: sourceName,
          first_date: dates[0],
          last_date: dates[dates.length - 1],
          credit_card_id: group.credit_card_id,
          account_id: group.account_id,
        });
      }

      // Limit to 50 most recent
      return activities.slice(0, 50);
    },
    enabled: !!user,
  });

  const undoActivity = useMutation({
    mutationFn: async (imported_at: string) => {
      if (!user) throw new Error("User not authenticated");

      const { error, count } = await supabase
        .from("transactions")
        .delete()
        .eq("imported_at", imported_at);

      if (error) throw error;
      
      return count || 0;
    },
    onSuccess: (count) => {
      toast({
        title: "Importação desfeita",
        description: `${count} transações removidas com sucesso.`,
      });
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["credit-cards"] });
    },
    onError: (error) => {
      console.error("Error undoing activity:", error);
      toast({
        title: "Erro ao desfazer",
        description: "Não foi possível desfazer a importação.",
        variant: "destructive",
      });
    },
  });

  return {
    activities: activitiesQuery.data || [],
    isLoading: activitiesQuery.isLoading,
    error: activitiesQuery.error,
    undoActivity: undoActivity.mutate,
    isUndoing: undoActivity.isPending,
  };
}
