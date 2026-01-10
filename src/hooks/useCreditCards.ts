import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export interface CreditCard {
  id: string;
  user_id: string;
  name: string;
  last_digits: string;
  brand: string;
  credit_limit: number;
  current_invoice: number;
  due_date: number;
  closing_date: number;
  color: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export function useCreditCards() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: creditCards = [], isLoading } = useQuery({
    queryKey: ["credit_cards", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_cards")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as CreditCard[];
    },
    enabled: !!user,
  });

  const createCreditCard = useMutation({
    mutationFn: async (card: Omit<CreditCard, "id" | "user_id" | "created_at" | "updated_at">) => {
      const { data, error } = await supabase
        .from("credit_cards")
        .insert([{ ...card, user_id: user?.id }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit_cards"] });
      toast({ title: "Cartão criado com sucesso!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao criar cartão", description: error.message, variant: "destructive" });
    },
  });

  const updateCreditCard = useMutation({
    mutationFn: async ({ id, ...card }: Partial<CreditCard> & { id: string }) => {
      const { data, error } = await supabase
        .from("credit_cards")
        .update(card)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit_cards"] });
      toast({ title: "Cartão atualizado!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar cartão", description: error.message, variant: "destructive" });
    },
  });

  const deleteCreditCard = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("credit_cards").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit_cards"] });
      toast({ title: "Cartão excluído!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao excluir cartão", description: error.message, variant: "destructive" });
    },
  });

  const totalInvoice = creditCards.reduce((sum, card) => sum + Number(card.current_invoice), 0);
  const totalLimit = creditCards.reduce((sum, card) => sum + Number(card.credit_limit), 0);
  const totalAvailable = totalLimit - totalInvoice;

  return {
    creditCards,
    isLoading,
    totalInvoice,
    totalLimit,
    totalAvailable,
    createCreditCard,
    updateCreditCard,
    deleteCreditCard,
  };
}
