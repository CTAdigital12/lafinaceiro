import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export interface RecurringRule {
  id: string;
  user_id: string;
  description: string;
  category_id: string | null;
  account_id: string | null;
  credit_card_id: string | null;
  estimated_amount: number;
  type: "income" | "expense";
  day_of_month: number;
  active: boolean;
  created_at: string;
  updated_at: string;
  // Joined fields
  categories?: { id: string; name: string; icon: string; color: string } | null;
  accounts?: { name: string } | null;
  credit_cards?: { name: string; last_digits: string } | null;
}

export function useRecurringRules() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["recurring_rules", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recurring_rules")
        .select(`
          *,
          categories (id, name, icon, color),
          accounts (name),
          credit_cards (name, last_digits)
        `)
        .order("description");

      if (error) throw error;
      return data as RecurringRule[];
    },
    enabled: !!user,
  });

  const createRule = useMutation({
    mutationFn: async (rule: Omit<RecurringRule, "id" | "user_id" | "created_at" | "updated_at" | "categories" | "accounts" | "credit_cards">) => {
      if (!user?.id) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase
        .from("recurring_rules")
        .insert([{ ...rule, user_id: user.id }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring_rules"] });
      toast({ title: "Regra recorrente criada!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao criar regra", description: error.message, variant: "destructive" });
    },
  });

  const updateRule = useMutation({
    // `TablesUpdate<>` vem do schema gerado, então só aceita COLUNAS reais.
    // `Partial<RecurringRule>` aceitava também as relações do join e os campos
    // calculados no cliente, que iriam parar no `.update()` e o PostgREST
    // rejeitaria como coluna desconhecida. Nenhum chamador fazia isso — era
    // folga de tipo —, mas agora o compilador impede que passe a fazer.
    mutationFn: async ({ id, ...updates }: TablesUpdate<"recurring_rules"> & { id: string }) => {
      const { data, error } = await supabase
        .from("recurring_rules")
        .update(updates)
        .eq("id", id)
        .select()
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring_rules"] });
      toast({ title: "Regra atualizada!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar regra", description: error.message, variant: "destructive" });
    },
  });

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("recurring_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring_rules"] });
      toast({ title: "Regra excluída!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao excluir regra", description: error.message, variant: "destructive" });
    },
  });

  const toggleRule = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from("recurring_rules")
        .update({ active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring_rules"] });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao alterar status", description: error.message, variant: "destructive" });
    },
  });

  const activeRules = rules.filter(r => r.active);
  const inactiveRules = rules.filter(r => !r.active);

  return {
    rules,
    activeRules,
    inactiveRules,
    isLoading,
    createRule,
    updateRule,
    deleteRule,
    toggleRule,
  };
}
