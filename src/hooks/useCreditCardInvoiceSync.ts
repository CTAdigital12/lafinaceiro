import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logError } from "@/lib/errorHandler";
import { sumInvoice } from "@/lib/invoiceTotal";

/**
 * Hook to sync credit card current_invoice based on transactions
 *
 * A regra do total vive em `@/lib/invoiceTotal` e é a mesma do SQL:
 * pagamento e estorno abatem, despesa soma, o resto é zero — e `is_refund`
 * vale para qualquer `type`. Pendentes e provisórias ficam de fora.
 */
export function useCreditCardInvoiceSync() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const recalculateInvoice = useMutation({
    mutationFn: async (creditCardId: string) => {
      // Fetch all transactions for this credit card (expenses + payments)
      const { data: transactions, error: txError } = await supabase
        .from("transactions")
        .select("amount, type, status, is_refund, is_card_payment, is_provisional")
        .eq("credit_card_id", creditCardId)
        .eq("is_provisional", false);

      if (txError) throw txError;

      // Regra única, compartilhada com o CASE dos RPCs SQL. Antes esta soma
      // era escrita à mão aqui e só reconhecia estorno dentro de
      // `type === 'expense'`, divergindo do SQL para estorno lançado como
      // receita (A10). `sumInvoice` já aplica o filtro de completed/provisória
      // e o piso em zero.
      const invoiceTotal = sumInvoice(transactions || []);

      // Update the credit card.
      // `status` é um flag GLOBAL do cartão. Quando entram novas despesas (ex.:
      // import do mês seguinte) e a fatura volta a ter saldo, o cartão não pode
      // continuar marcado como "Paga" — reabrimos para "open". Não rebaixamos
      // "closed" aqui (fechamento é controlado manualmente).
      const update: { current_invoice: number; status?: string } = {
        current_invoice: invoiceTotal,
      };
      if (invoiceTotal > 0) {
        update.status = "open";
      }

      const { error: updateError } = await supabase
        .from("credit_cards")
        .update(update)
        .eq("id", creditCardId);

      if (updateError) throw updateError;

      return { creditCardId, newInvoice: invoiceTotal };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit_cards"] });
      queryClient.invalidateQueries({ queryKey: ["credit-card-transactions-reconciliation"] });
    },
    onError: (error: Error) => {
      logError(error, "useCreditCardInvoiceSync.recalculateInvoice");
    },
  });

  /**
   * Sync invoice after a transaction change
   * Call this after creating, updating, or deleting a credit card transaction
   */
  const syncInvoiceForCard = useCallback(
    async (creditCardId: string | null | undefined) => {
      if (!creditCardId) return;
      try {
        await recalculateInvoice.mutateAsync(creditCardId);
      } catch (error) {
        logError(error as Error, "syncInvoiceForCard");
      }
    },
    [recalculateInvoice]
  );

  return {
    syncInvoiceForCard,
    recalculateInvoice,
    isRecalculating: recalculateInvoice.isPending,
  };
}
