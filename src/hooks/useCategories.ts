import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export interface Category {
  id: string;
  user_id: string;
  name: string;
  icon: string | null;
  color: string | null;
  type: "income" | "expense";
  parent_id: string | null;
  created_at: string;
}

export function useCategories() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["categories", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("name");

      if (error) throw error;
      return data as Category[];
    },
    enabled: !!user,
  });

  const createCategory = useMutation({
    mutationFn: async (category: { name: string; icon: string; color: string; type: "income" | "expense"; parent_id?: string | null }) => {
      const { data, error } = await supabase
        .from("categories")
        .insert([{ ...category, user_id: user?.id }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast({ title: "Categoria criada com sucesso!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao criar categoria", description: error.message, variant: "destructive" });
    },
  });

  const updateCategory = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Category> & { id: string }) => {
      const { data, error } = await supabase
        .from("categories")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast({ title: "Categoria atualizada!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar categoria", description: error.message, variant: "destructive" });
    },
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("categories")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast({ title: "Categoria excluída!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao excluir categoria", description: error.message, variant: "destructive" });
    },
  });

  const incomeCategories = categories.filter((c) => c.type === "income");
  const expenseCategories = categories.filter((c) => c.type === "expense");

  return {
    categories,
    incomeCategories,
    expenseCategories,
    isLoading,
    createCategory,
    updateCategory,
    deleteCategory,
  };
}
