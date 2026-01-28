import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Transaction } from "./useTransactions";
import { addMonths, format, parseISO } from "date-fns";

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

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["installment-group", groupId] });
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
  };

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
      invalidateQueries();
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

  // Mutation to toggle installment status (paid/pending)
  const toggleInstallmentStatus = useMutation({
    mutationFn: async ({ id, newStatus }: { id: string; newStatus: "completed" | "pending" }) => {
      const { error } = await supabase
        .from("transactions")
        .update({ status: newStatus })
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: (_, { newStatus }) => {
      invalidateQueries();
      toast({ title: newStatus === "completed" ? "Parcela marcada como paga!" : "Parcela marcada como pendente!" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erro ao atualizar status", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  // Mutation to delete a single installment
  const deleteSingleInstallment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateQueries();
      toast({ title: "Parcela excluída!" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erro ao excluir parcela", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  // Mutation to delete all pending installments
  const deletePendingInstallments = useMutation({
    mutationFn: async () => {
      if (!groupId) throw new Error("No group ID");
      
      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("installment_group_id", groupId)
        .eq("status", "pending");
      
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateQueries();
      toast({ title: "Parcelas pendentes excluídas!" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erro ao excluir parcelas", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  // Mutation to update all installments (description/amount/category)
  const updateAllInstallments = useMutation({
    mutationFn: async (data: { description?: string; amount?: number; category_id?: string }) => {
      if (!groupId) throw new Error("No group ID");
      if (!user) throw new Error("User not authenticated");
      
      // Build update object with only provided fields
      const updateData: Record<string, unknown> = {};
      
      if (data.description !== undefined) {
        // Update all with new base description + installment number
        const updates = installments.map(inst => ({
          id: inst.id,
          description: `${data.description} ${inst.installment_number}/${inst.total_installments}`,
          amount: data.amount ?? inst.amount,
          category_id: data.category_id ?? inst.category_id,
        }));
        
        for (const update of updates) {
          const { error } = await supabase
            .from("transactions")
            .update({
              description: update.description,
              amount: update.amount,
              category_id: update.category_id,
            })
            .eq("id", update.id);
          
          if (error) throw error;
        }
        return;
      }
      
      // Simple update without description changes
      if (data.amount !== undefined) updateData.amount = data.amount;
      if (data.category_id !== undefined) updateData.category_id = data.category_id;
      
      if (Object.keys(updateData).length > 0) {
        const { error } = await supabase
          .from("transactions")
          .update(updateData)
          .eq("installment_group_id", groupId);
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidateQueries();
      toast({ title: "Todas as parcelas atualizadas!" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erro ao atualizar parcelas", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  // Mutation to add new installments at the end
  const addInstallments = useMutation({
    mutationFn: async (count: number) => {
      if (!groupId) throw new Error("No group ID");
      if (!user) throw new Error("User not authenticated");
      if (installments.length === 0) throw new Error("No existing installments");
      
      const lastInstallment = installments[installments.length - 1];
      const currentTotal = lastInstallment.total_installments || installments.length;
      const newTotal = currentTotal + count;
      
      // First, update total_installments for all existing
      const { error: updateError } = await supabase
        .from("transactions")
        .update({ total_installments: newTotal })
        .eq("installment_group_id", groupId);
      
      if (updateError) throw updateError;
      
      // Create new installments
      const newInstallments = [];
      const lastDueDate = lastInstallment.due_date ? parseISO(lastInstallment.due_date) : new Date();
      
      for (let i = 1; i <= count; i++) {
        const installmentNumber = currentTotal + i;
        const dueDate = addMonths(lastDueDate, i);
        
        newInstallments.push({
          user_id: user.id,
          description: `${baseDescription} ${installmentNumber}/${newTotal}`,
          amount: lastInstallment.amount,
          type: lastInstallment.type,
          category_id: lastInstallment.category_id,
          credit_card_id: lastInstallment.credit_card_id,
          account_id: lastInstallment.account_id,
          date: format(dueDate, "yyyy-MM-dd"),
          due_date: format(dueDate, "yyyy-MM-dd"),
          status: "pending",
          is_corporate_expense: lastInstallment.is_corporate_expense,
          is_reimbursable: lastInstallment.is_reimbursable,
          is_refund: false,
          is_card_payment: false,
          installment_group_id: groupId,
          installment_number: installmentNumber,
          total_installments: newTotal,
        });
      }
      
      const { error: insertError } = await supabase
        .from("transactions")
        .insert(newInstallments);
      
      if (insertError) throw insertError;
      
      // Also update descriptions of existing installments to reflect new total
      for (const inst of installments) {
        const { error } = await supabase
          .from("transactions")
          .update({ 
            description: `${baseDescription} ${inst.installment_number}/${newTotal}`,
            total_installments: newTotal,
          })
          .eq("id", inst.id);
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidateQueries();
      toast({ title: "Parcelas adicionadas com sucesso!" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erro ao adicionar parcelas", 
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
    toggleInstallmentStatus,
    deleteSingleInstallment,
    deletePendingInstallments,
    updateAllInstallments,
    addInstallments,
  };
}
