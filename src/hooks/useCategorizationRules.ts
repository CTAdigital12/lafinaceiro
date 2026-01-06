import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export interface CategorizationRule {
  id: string;
  user_id: string;
  keyword: string;
  category_id: string;
  created_at: string;
  updated_at: string;
}

export function useCategorizationRules() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["categorization_rules", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categorization_rules")
        .select("*")
        .order("keyword");

      if (error) throw error;
      return data as CategorizationRule[];
    },
    enabled: !!user,
  });

  const createRule = useMutation({
    mutationFn: async (rule: { keyword: string; category_id: string }) => {
      const { data, error } = await supabase
        .from("categorization_rules")
        .upsert([{ 
          ...rule, 
          user_id: user?.id,
          keyword: rule.keyword.toUpperCase()
        }], {
          onConflict: 'user_id,keyword'
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categorization_rules"] });
    },
    onError: (error: Error) => {
      console.error("Error creating rule:", error);
    },
  });

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("categorization_rules")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categorization_rules"] });
      toast({ title: "Regra removida!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao remover regra", description: error.message, variant: "destructive" });
    },
  });

  // Function to find matching category for a description
  const findCategoryForDescription = (description: string): string | null => {
    const upperDesc = description.toUpperCase();
    
    for (const rule of rules) {
      if (upperDesc.includes(rule.keyword.toUpperCase())) {
        return rule.category_id;
      }
    }
    
    return null;
  };

  return {
    rules,
    isLoading,
    createRule,
    deleteRule,
    findCategoryForDescription,
  };
}