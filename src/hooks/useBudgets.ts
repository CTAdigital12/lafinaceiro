import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export interface Budget {
  id: string;
  user_id: string;
  category_id: string | null;
  month: number;
  year: number;
  planned_amount: number;
  created_at: string;
  categories?: { name: string; icon: string; color: string } | null;
}

export function useBudgets(month: number, year: number) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: budgets = [], isLoading } = useQuery({
    queryKey: ["budgets", user?.id, month, year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budgets")
        .select(`
          *,
          categories (name, icon, color)
        `)
        .eq("month", month)
        .eq("year", year)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as Budget[];
    },
    enabled: !!user,
  });

  const createBudget = useMutation({
    mutationFn: async (budget: Omit<Budget, "id" | "user_id" | "created_at" | "categories">) => {
      const { data, error } = await supabase
        .from("budgets")
        .insert([{ ...budget, user_id: user?.id }])
        .select(`
          *,
          categories (name, icon, color)
        `)
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      toast({ title: "Meta criada com sucesso!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao criar meta", description: error.message, variant: "destructive" });
    },
  });

  const updateBudget = useMutation({
    mutationFn: async ({ id, ...budget }: Partial<Budget> & { id: string }) => {
      const { data, error } = await supabase
        .from("budgets")
        .update(budget)
        .eq("id", id)
        .select(`
          *,
          categories (name, icon, color)
        `)
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      toast({ title: "Meta atualizada!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar meta", description: error.message, variant: "destructive" });
    },
  });

  const deleteBudget = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("budgets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      toast({ title: "Meta excluída!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao excluir meta", description: error.message, variant: "destructive" });
    },
  });

  const copyFromPreviousMonth = useMutation({
    mutationFn: async () => {
      // Calculate previous month
      let prevMonth = month - 1;
      let prevYear = year;
      if (prevMonth < 1) {
        prevMonth = 12;
        prevYear = year - 1;
      }

      // Fetch previous month budgets
      const { data: prevBudgets, error: fetchError } = await supabase
        .from("budgets")
        .select("*")
        .eq("month", prevMonth)
        .eq("year", prevYear)
        .eq("user_id", user?.id);

      if (fetchError) throw fetchError;

      if (!prevBudgets || prevBudgets.length === 0) {
        throw new Error("Nenhuma meta encontrada no mês anterior");
      }

      // Create new budgets for current month
      const newBudgets = prevBudgets.map(({ id, created_at, ...budget }) => ({
        ...budget,
        month,
        year,
      }));

      const { error: insertError } = await supabase
        .from("budgets")
        .insert(newBudgets);

      if (insertError) throw insertError;

      return newBudgets;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      toast({ title: "Metas copiadas do mês anterior!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao copiar metas", description: error.message, variant: "destructive" });
    },
  });

  const totalPlanned = budgets.reduce((sum, b) => sum + Number(b.planned_amount), 0);

  return {
    budgets,
    isLoading,
    totalPlanned,
    createBudget,
    updateBudget,
    deleteBudget,
    copyFromPreviousMonth,
  };
}
