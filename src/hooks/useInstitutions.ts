import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export interface InvestmentInstitution {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export function useInstitutions() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: institutions = [], isLoading } = useQuery({
    queryKey: ["investment_institutions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("investment_institutions")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw error;
      return data as InvestmentInstitution[];
    },
    enabled: !!user,
  });

  const createInstitution = useMutation({
    mutationFn: async (institution: Omit<InvestmentInstitution, "id" | "user_id" | "created_at" | "updated_at">) => {
      const { data, error } = await supabase
        .from("investment_institutions")
        .insert([{ ...institution, user_id: user?.id }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investment_institutions"] });
      toast({ title: "Instituição criada com sucesso!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao criar instituição", description: error.message, variant: "destructive" });
    },
  });

  const updateInstitution = useMutation({
    mutationFn: async ({ id, ...institution }: Partial<InvestmentInstitution> & { id: string }) => {
      const { data, error } = await supabase
        .from("investment_institutions")
        .update(institution)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investment_institutions"] });
      toast({ title: "Instituição atualizada!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar instituição", description: error.message, variant: "destructive" });
    },
  });

  const deleteInstitution = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("investment_institutions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investment_institutions"] });
      toast({ title: "Instituição excluída!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao excluir instituição", description: error.message, variant: "destructive" });
    },
  });

  return {
    institutions,
    isLoading,
    createInstitution,
    updateInstitution,
    deleteInstitution,
  };
}
