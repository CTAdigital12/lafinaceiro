import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Transaction } from "./useTransactions";

export function useInstallmentGroup(groupId: string | null) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: installments = [], isLoading } = useQuery({
    queryKey: ["installment-group", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      
      const { data, error } = await supabase
        .from("transactions")
        .select(`
          *,
          categories (id, name, icon, color),
          credit_cards (id, name, last_digits, color)
        `)
        .eq("installment_group_id", groupId)
        .order("due_date", { ascending: true });
      
      if (error) throw error;
      return data as Transaction[];
    },
    enabled: !!user && !!groupId,
  });

  // Calculations
  const totalAmount = installments.reduce((sum, i) => sum + Number(i.amount), 0);
  const paidInstallments = installments.filter(i => i.status === "completed");
  const paidAmount = paidInstallments.reduce((sum, i) => sum + Number(i.amount), 0);
  const paidCount = paidInstallments.length;
  const remainingAmount = totalAmount - paidAmount;
  const remainingCount = installments.length - paidCount;
  const progressPercentage = installments.length > 0 ? (paidCount / installments.length) * 100 : 0;
  
  // Find current installment (first pending one)
  const currentInstallment = installments.find(i => i.status === "pending");
  
  // Get single installment value (assume equal installments)
  const installmentValue = installments.length > 0 ? Number(installments[0].amount) : 0;
  
  // Get base description (cleaned from installment pattern)
  const baseDescription = installments.length > 0 
    ? installments[0].description
        .replace(/\s*\d+\/\d+\s*$/g, '')
        .replace(/\s*\d+\s+de\s+\d+\s*$/gi, '')
        .replace(/\s*PARC(?:ELA)?\s*\d+\/\d+/gi, '')
        .replace(/\s*\(\d+\/\d+\)\s*$/g, '')
        .replace(/\s+-\s+.*$/, '')
        .trim()
    : "";

  // Mutation to update category for all installments in group
  const updateCategoryForAll = useMutation({
    mutationFn: async (newCategoryId: string) => {
      if (!groupId) throw new Error("No group ID");
      
      const { error } = await supabase
        .from("transactions")
        .update({ category_id: newCategoryId })
        .eq("installment_group_id", groupId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["installment-group", groupId] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast({ title: "Categoria atualizada em todas as parcelas!" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erro ao atualizar categoria", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  return {
    installments,
    isLoading,
    totalAmount,
    paidAmount,
    paidCount,
    remainingAmount,
    remainingCount,
    progressPercentage,
    currentInstallment,
    installmentValue,
    baseDescription,
    updateCategoryForAll,
  };
}
