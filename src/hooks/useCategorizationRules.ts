import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useState, useCallback } from "react";

export interface CategorizationRule {
  id: string;
  user_id: string;
  keyword: string;
  category_id: string;
  is_corporate: boolean;
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
    mutationFn: async (rule: { keyword: string; category_id: string | null; is_corporate?: boolean }) => {
      if (!user?.id) {
        throw new Error("Usuário não autenticado");
      }
      
      const { data, error } = await supabase
        .from("categorization_rules")
        .upsert([{ 
          ...rule, 
          user_id: user.id,
          keyword: rule.keyword.toUpperCase(),
          category_id: rule.category_id || null,
          is_corporate: rule.is_corporate ?? false
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

  const updateRule = useMutation({
    mutationFn: async ({ id, keyword, category_id, is_corporate }: { id: string; keyword?: string; category_id?: string | null; is_corporate?: boolean }) => {
      // Tipado pelo schema em vez de `Record<string, unknown>`: o cliente do
      // Supabase não consegue validar um record aberto contra as colunas da
      // tabela, então qualquer chave errada só apareceria como erro do
      // PostgREST em runtime.
      const updateData: TablesUpdate<"categorization_rules"> = {};
      if (keyword !== undefined) updateData.keyword = keyword.toUpperCase();
      if (category_id !== undefined) updateData.category_id = category_id;
      if (is_corporate !== undefined) updateData.is_corporate = is_corporate;

      const { data, error } = await supabase
        .from("categorization_rules")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categorization_rules"] });
      toast({ title: "Regra atualizada!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar regra", description: error.message, variant: "destructive" });
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

  // Function to find matching category and corporate status for a description
  const findCategoryForDescription = useCallback((description: string): string | null => {
    const upperDesc = description.toUpperCase();
    
    for (const rule of rules) {
      if (upperDesc.includes(rule.keyword.toUpperCase())) {
        return rule.category_id;
      }
    }
    
    return null;
  }, [rules]);

  // Function to find if a description matches a corporate rule
  const findCorporateForDescription = useCallback((description: string): boolean => {
    const upperDesc = description.toUpperCase();
    
    for (const rule of rules) {
      if (upperDesc.includes(rule.keyword.toUpperCase())) {
        return rule.is_corporate || false;
      }
    }
    
    return false;
  }, [rules]);

  // State for bulk apply operation
  const [isApplyingRules, setIsApplyingRules] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Preview which transactions would be affected by rules
  const previewRulesApplication = async (): Promise<{ ruleId: string; keyword: string; categoryId: string | null; count: number; transactionIds: string[] }[]> => {
    setIsLoadingPreview(true);
    
    try {
      // Fetch all transactions without category
      const { data: uncategorizedTransactions, error: fetchError } = await supabase
        .from("transactions")
        .select("id, description")
        .is("category_id", null);

      if (fetchError) throw fetchError;

      if (!uncategorizedTransactions || uncategorizedTransactions.length === 0) {
        return [];
      }

      const preview: { ruleId: string; keyword: string; categoryId: string | null; count: number; transactionIds: string[] }[] = [];
      const matchedTransactionIds = new Set<string>();

      // For each rule, count matching transactions
      for (const rule of rules) {
        const matchingTransactions = uncategorizedTransactions.filter(
          (t) => !matchedTransactionIds.has(t.id) && t.description.toUpperCase().includes(rule.keyword.toUpperCase())
        );

        if (matchingTransactions.length > 0) {
          matchingTransactions.forEach((t) => matchedTransactionIds.add(t.id));
          preview.push({
            ruleId: rule.id,
            keyword: rule.keyword,
            categoryId: rule.category_id,
            count: matchingTransactions.length,
            transactionIds: matchingTransactions.map((t) => t.id),
          });
        }
      }

      return preview;
    } catch (error) {
      console.error("Error previewing rules:", error);
      return [];
    } finally {
      setIsLoadingPreview(false);
    }
  };
  const applyRulesToUncategorized = async (transactionIds?: string[]): Promise<number> => {
    setIsApplyingRules(true);
    
    try {
      // If specific transaction IDs are provided, use them. Otherwise fetch all uncategorized
      let transactionsToProcess: { id: string; description: string }[];
      
      if (transactionIds && transactionIds.length > 0) {
        const { data, error } = await supabase
          .from("transactions")
          .select("id, description")
          .in("id", transactionIds);
        
        if (error) throw error;
        transactionsToProcess = data || [];
      } else {
        const { data, error } = await supabase
          .from("transactions")
          .select("id, description")
          .is("category_id", null);
        
        if (error) throw error;
        transactionsToProcess = data || [];
      }

      if (transactionsToProcess.length === 0) {
        toast({ title: "Nenhuma transação para processar" });
        return 0;
      }

      let updatedCount = 0;

      // For each transaction, check if any rule matches
      for (const transaction of transactionsToProcess) {
        const upperDesc = transaction.description.toUpperCase();
        
        for (const rule of rules) {
          if (upperDesc.includes(rule.keyword.toUpperCase())) {
            // Found a matching rule, update the transaction
            const { error: updateError } = await supabase
              .from("transactions")
              .update({
                category_id: rule.category_id,
                is_corporate_expense: rule.is_corporate,
              })
              .eq("id", transaction.id);

            if (!updateError) {
              updatedCount++;
            }
            break; // Only apply the first matching rule
          }
        }
      }

      if (updatedCount > 0) {
        queryClient.invalidateQueries({ queryKey: ["transactions"] });
        toast({ 
          title: "Regras aplicadas com sucesso!",
          description: `${updatedCount} transação(ões) categorizada(s)` 
        });
      } else {
        toast({ 
          title: "Nenhuma correspondência encontrada",
          description: "Nenhuma transação corresponde às regras existentes" 
        });
      }

      return updatedCount;
    } catch (error) {
      console.error("Error applying rules:", error);
      toast({ 
        title: "Erro ao aplicar regras", 
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive" 
      });
      return 0;
    } finally {
      setIsApplyingRules(false);
    }
  };

  return {
    rules,
    isLoading,
    createRule,
    updateRule,
    deleteRule,
    findCategoryForDescription,
    findCorporateForDescription,
    previewRulesApplication,
    isLoadingPreview,
    applyRulesToUncategorized,
    isApplyingRules,
  };
}