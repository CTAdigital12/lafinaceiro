import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logError } from "@/lib/errorHandler";

/**
 * Hook to sync credit card current_invoice based on transactions
 * 
 * The current_invoice is calculated as:
 * - Sum of all completed expense transactions for the card
 * - MINUS sum of all refund transactions (is_refund = true)
 * - Pending transactions are NOT included in current_invoice
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

      // Calculate net invoice:
      // + Completed expenses (non-refund, non-payment)
      // - Refund transactions
      // - Card payments (is_card_payment = true)
      let invoiceTotal = 0;

      for (const tx of transactions || []) {
        // Only count completed transactions
        if (tx.status !== "completed") continue;

        if (tx.is_card_payment) {
          // Payments REDUCE the invoice balance
          invoiceTotal -= Number(tx.amount);
        } else if (tx.type === "expense") {
          if (tx.is_refund) {
            // Refunds reduce the invoice
            invoiceTotal -= Number(tx.amount);
          } else {
            // Regular expenses increase the invoice
            invoiceTotal += Number(tx.amount);
          }
        }
      }

      // Ensure invoice is not negative
      invoiceTotal = Math.max(0, invoiceTotal);

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
