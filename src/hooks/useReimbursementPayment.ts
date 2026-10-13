import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/**
 * Hook for marking / unmarking a transaction as reimbursed with automatic
 * invoice settlement on the linked credit card.
 *
 * Behavior is implemented in the Postgres RPCs `mark_reimbursed` and
 * `unmark_reimbursed` (see migration 20260430120000) so the whole flow runs
 * atomically server-side and respects RLS via SECURITY INVOKER.
 *
 * - When the transaction has a credit_card_id: marking creates a mirror
 *   income transaction (is_card_payment=true) on the same invoice cycle and
 *   recomputes credit_cards.current_invoice. Unmarking deletes the mirror
 *   and rolls the invoice back.
 * - When credit_card_id is NULL: only the reimbursement_status is touched.
 * - Idempotent on reimbursement_payment_id (calling mark twice does not
 *   create two mirrors).
 */
export function useReimbursementPayment() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const markAsReimbursed = useMutation({
    mutationFn: async ({ transactionId }: { transactionId: string }) => {
      const { error } = await supabase.rpc("mark_reimbursed", {
        p_transaction_id: transactionId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["credit_cards"] });
      qc.invalidateQueries({ queryKey: ["reimbursements"] });
      qc.invalidateQueries({ queryKey: ["corporate-expenses"] });
      qc.invalidateQueries({ queryKey: ["invoice-transactions"] });
      qc.invalidateQueries({ queryKey: ["credit-card-transactions-reconciliation"] });
      toast({ title: "Reembolso registrado e fatura atualizada" });
    },
    onError: (e: Error) =>
      toast({
        title: "Erro ao registrar reembolso",
        description: e.message,
        variant: "destructive",
      }),
  });

  const unmarkAsReimbursed = useMutation({
    mutationFn: async ({
      transactionId,
      newStatus,
    }: {
      transactionId: string;
      newStatus: "pending" | "requested";
    }) => {
      const { error } = await supabase.rpc("unmark_reimbursed", {
        p_transaction_id: transactionId,
        p_new_status: newStatus,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["credit_cards"] });
      qc.invalidateQueries({ queryKey: ["reimbursements"] });
      qc.invalidateQueries({ queryKey: ["corporate-expenses"] });
      qc.invalidateQueries({ queryKey: ["invoice-transactions"] });
      qc.invalidateQueries({ queryKey: ["credit-card-transactions-reconciliation"] });
      toast({ title: "Status revertido" });
    },
    onError: (e: Error) =>
      toast({
        title: "Erro ao reverter status",
        description: e.message,
        variant: "destructive",
      }),
  });

  /**
   * Quita despesas reembolsáveis com recebimento EXTERNO (PIX / transferência
   * numa conta), em vez de baixa na fatura do cartão. Dois caminhos:
   *  - incomeId  : vincula uma receita já existente (o PIX lançado pelo
   *                usuário) — TODAS as despesas apontam para ela, porque um PIX
   *                só costuma cobrir várias
   *  - accountId : cria uma receita de reembolso por despesa nessa conta
   * A receita resultante é marcada como is_reimbursement (neutra nos KPIs).
   * O lote é atômico no banco (`settle_reimbursements`): ou quita todas, ou
   * nenhuma — vinculadas uma a uma, uma falha no meio deixava o PIX preso.
   */
  const settleExternal = useMutation({
    mutationFn: async ({
      transactionIds,
      incomeId,
      accountId,
      date,
    }: {
      transactionIds: string[];
      incomeId?: string;
      accountId?: string;
      date?: string;
    }) => {
      const { error } = await supabase.rpc("settle_reimbursements", {
        p_transaction_ids: transactionIds,
        p_income_id: incomeId ?? undefined,
        p_account_id: accountId ?? undefined,
        p_date: date ?? undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["reimbursements"] });
      qc.invalidateQueries({ queryKey: ["reimbursement-income-candidates"] });
      qc.invalidateQueries({ queryKey: ["corporate-expenses"] });
      toast({ title: "Reembolso recebido registrado" });
    },
    onError: (e: Error) =>
      toast({
        title: "Erro ao registrar reembolso recebido",
        description: e.message,
        variant: "destructive",
      }),
  });

  return { markAsReimbursed, unmarkAsReimbursed, settleExternal };
}
