import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { planBudgetCopy } from "@/lib/budgetsToCopy";

export interface Budget {
  id: string;
  user_id: string;
  category_id: string | null;
  month: number;
  year: number;
  planned_amount: number;
  created_at: string;
  categories?: { id: string; name: string; icon: string; color: string; parent_id: string | null } | null;
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
          categories (id, name, icon, color, parent_id)
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
      if (!user?.id) {
        throw new Error("Usuário não autenticado");
      }
      
      const { data, error } = await supabase
        .from("budgets")
        .insert([{ ...budget, user_id: user.id }])
        .select(`
          *,
          categories (id, name, icon, color, parent_id)
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
    // `TablesUpdate<>` vem do schema gerado, então só aceita COLUNAS reais.
      // `Partial<Budget>` aceitava também as relações do join e os campos
      // calculados no cliente, que iriam parar no `.update()` e o PostgREST
      // rejeitaria como coluna desconhecida. Nenhum chamador fazia isso — era
      // folga de tipo —, mas agora o compilador impede que passe a fazer.
      mutationFn: async ({ id, ...budget }: TablesUpdate<"budgets"> & { id: string }) => {
      const { data, error } = await supabase
        .from("budgets")
        .update(budget)
        .eq("id", id)
        .select(`
          *,
          categories (id, name, icon, color, parent_id)
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
      // Sem isto, `.eq("user_id", undefined)` iria para o PostgREST como
      // filtro inválido em vez de falhar aqui. Mesmo idioma de `addTransaction`.
      if (!user?.id) {
        throw new Error("Usuário não autenticado");
      }
      const userId = user.id;

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
        .eq("user_id", userId);

      if (fetchError) throw fetchError;

      if (!prevBudgets || prevBudgets.length === 0) {
        throw new Error("Nenhuma meta encontrada no mês anterior");
      }

      // Categorias que JÁ têm meta no mês de destino. Sem esse filtro o INSERT
      // inteiro é rejeitado pela unique (user_id, category_id, month, year)
      // assim que uma única categoria já existe — e nada é copiado.
      const { data: currentBudgets, error: currentError } = await supabase
        .from("budgets")
        .select("category_id")
        .eq("month", month)
        .eq("year", year)
        .eq("user_id", userId);

      if (currentError) throw currentError;

      const { toInsert, skipped } = planBudgetCopy(
        prevBudgets,
        (currentBudgets ?? []).map((b) => b.category_id),
      );

      if (toInsert.length === 0) {
        throw new Error(
          "Todas as metas do mês anterior já existem neste mês. Nada a copiar.",
        );
      }

      const newBudgets = toInsert.map(({ id, created_at, ...budget }) => ({
        ...budget,
        month,
        year,
      }));

      const { error: insertError } = await supabase
        .from("budgets")
        .insert(newBudgets);

      if (insertError) throw insertError;

      return { copied: newBudgets.length, skipped };
    },
    onSuccess: ({ copied, skipped }) => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      toast({
        title: `${copied} ${copied === 1 ? "meta copiada" : "metas copiadas"} do mês anterior`,
        description:
          skipped > 0
            ? `${skipped} já existiam neste mês e foram mantidas como estavam.`
            : undefined,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao copiar metas", description: error.message, variant: "destructive" });
    },
  });

  // Calculate total only from "leaf" budgets (subcategories or categories without children)
  const totalPlanned = useMemo(() => {
    const parentCategoryIds = new Set(
      budgets
        .filter(b => b.categories?.parent_id)
        .map(b => b.categories?.parent_id)
    );
    
    // Sum only budgets that are NOT parent categories (i.e., don't have children in the budget list)
    return budgets
      .filter(b => !parentCategoryIds.has(b.categories?.id))
      .reduce((sum, b) => sum + Number(b.planned_amount), 0);
  }, [budgets]);

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
