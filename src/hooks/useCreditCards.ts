import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { startOfMonth, endOfMonth, format } from "date-fns";
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

interface PayInvoiceParams {
  creditCardId: string;
  creditCardName: string;
  accountId: string;
  amount: number;
  date: string;
}

export interface SplitPaymentParams {
  creditCardId: string;
  creditCardName: string;
  // Invoice cycle (used to scope auto-reimbursement to the right period)
  month: number;
  year: number;
  // Corporate section
  corporateAmount: number;
  includeCorporate: boolean;
  // Personal section
  personalAmount: number;
  includePersonal: boolean;
  personalPaymentType: "bank" | "external";
  accountId: string | null;
  linkToTransactionId: string | null;
  // Residual balance section
  residualAmount: number;
  includeResidual: boolean;
  residualPaymentType: "bank" | "external";
  residualAccountId: string | null;
  residualLinkedTransactionId: string | null;
  // General
  date: string;
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
      if (!user?.id) {
        throw new Error("Usuário não autenticado");
      }
      
      const { data, error } = await supabase
        .from("credit_cards")
        .insert([{ ...card, user_id: user.id }])
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

  const payInvoice = useMutation({
    mutationFn: async ({ creditCardId, creditCardName, accountId, amount, date }: PayInvoiceParams) => {
      if (!user?.id) {
        throw new Error("Usuário não autenticado");
      }
      
      // 1. Create transaction in account (marked as card payment - won't appear in expense charts)
      const { error: txError } = await supabase.from("transactions").insert({
        user_id: user.id,
        description: `Pagamento de fatura - ${creditCardName}`,
        amount,
        type: "expense",
        date,
        account_id: accountId,
        credit_card_id: null,
        category_id: null,
        status: "completed",
        is_corporate_expense: false,
        is_reimbursable: false,
        is_refund: false,
        is_card_payment: true,
      });

      if (txError) throw txError;

      // Balance is now computed dynamically — no need to update current_balance

      // 3. Get current credit card invoice and update it
      const { data: card, error: cardFetchError } = await supabase
        .from("credit_cards")
        .select("current_invoice")
        .eq("id", creditCardId)
        .single();

      if (cardFetchError) throw cardFetchError;

      const newInvoice = Math.max(0, Number(card.current_invoice) - amount);
      const { error: cardUpdateError } = await supabase
        .from("credit_cards")
        .update({ 
          current_invoice: newInvoice,
          status: newInvoice === 0 ? "paid" : "open"
        })
        .eq("id", creditCardId);

      if (cardUpdateError) throw cardUpdateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit_cards"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast({ title: "Fatura paga com sucesso!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao pagar fatura", description: error.message, variant: "destructive" });
    },
  });

  const paySplitInvoice = useMutation({
    mutationFn: async (params: SplitPaymentParams) => {
      if (!user?.id) {
        throw new Error("Usuário não autenticado");
      }
      
      const {
        creditCardId,
        creditCardName,
        month,
        year,
        corporateAmount,
        includeCorporate,
        personalAmount,
        includePersonal,
        personalPaymentType,
        accountId,
        linkToTransactionId,
        residualAmount,
        includeResidual,
        residualPaymentType,
        residualAccountId,
        residualLinkedTransactionId,
        date,
      } = params;

      let totalPaid = 0;

      const periodStart = format(startOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");
      const periodEnd = format(endOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");
      const periodFilter = `and(due_date.gte.${periodStart},due_date.lte.${periodEnd}),and(due_date.is.null,date.gte.${periodStart},date.lte.${periodEnd})`;

      // 1. Handle corporate portion — mark each corporate expense as reimbursed.
      // Each mark_reimbursed call creates a mirror income (is_card_payment=true)
      // that reduces current_invoice via the global recompute inside the RPC.
      // We do NOT create the aggregate "Baixa Corporativa" income anymore, and
      // we do NOT add corporateAmount to totalPaid (the RPC already handled it).
      if (includeCorporate && corporateAmount > 0) {
        const { data: corpTxs, error: corpFetchError } = await supabase
          .from("transactions")
          .select("id")
          .eq("user_id", user.id)
          .eq("credit_card_id", creditCardId)
          .eq("type", "expense")
          .eq("status", "completed")
          .eq("is_corporate_expense", true)
          .eq("is_refund", false)
          .in("reimbursement_status", ["pending", "requested"])
          .or(periodFilter);

        if (corpFetchError) throw corpFetchError;

        for (const tx of corpTxs ?? []) {
          const { error: rpcError } = await supabase.rpc("mark_reimbursed", {
            p_transaction_id: tx.id,
          });
          if (rpcError) throw rpcError;
        }
      }

      // 2. Handle personal portion
      if (includePersonal && personalAmount > 0) {
        // Auto-mark reimbursable (non-corp) as reimbursed — status only, no mirror.
        // Mirror would double-count: user já está pagando do bolso via expense bank.
        const { data: reimbTxs, error: reimbFetchError } = await supabase
          .from("transactions")
          .select("id")
          .eq("user_id", user.id)
          .eq("credit_card_id", creditCardId)
          .eq("type", "expense")
          .eq("status", "completed")
          .eq("is_reimbursable", true)
          .eq("is_corporate_expense", false)
          .eq("is_refund", false)
          .in("reimbursement_status", ["pending", "requested"])
          .or(periodFilter);

        if (reimbFetchError) throw reimbFetchError;

        if (reimbTxs && reimbTxs.length > 0) {
          const reimbIds = reimbTxs.map((t) => t.id);
          const { error: updErr } = await supabase
            .from("transactions")
            .update({ reimbursement_status: "reimbursed" })
            .in("id", reimbIds);
          if (updErr) throw updErr;
        }

        if (linkToTransactionId) {
          // Link to existing transaction - also set credit_card_id for reconciliation
          const { error: linkError } = await supabase
            .from("transactions")
            .update({ is_card_payment: true, credit_card_id: creditCardId })
            .eq("id", linkToTransactionId);

          if (linkError) throw linkError;
        } else if (personalPaymentType === "bank" && accountId) {
          // Create bank debit transaction - linked to card for reconciliation
          const { error: bankError } = await supabase.from("transactions").insert({
            user_id: user.id,
            description: `Pagamento de fatura - ${creditCardName}`,
            amount: personalAmount,
            type: "expense",
            date,
            account_id: accountId,
            credit_card_id: creditCardId,
            category_id: null,
            status: "completed",
            is_corporate_expense: false,
            is_reimbursable: false,
            is_refund: false,
            is_card_payment: true,
          });

          if (bankError) throw bankError;

          // Balance is now computed dynamically — no need to update current_balance
        } else if (personalPaymentType === "external") {
          // Create external payment record (income on card, no bank debit)
          const { error: extError } = await supabase.from("transactions").insert({
            user_id: user.id,
            description: `Pagamento Externo - ${creditCardName}`,
            amount: personalAmount,
            type: "income",
            date,
            account_id: null,
            credit_card_id: creditCardId,
            category_id: null,
            status: "completed",
            is_corporate_expense: false,
            is_reimbursable: false,
            is_refund: false,
            is_card_payment: true,
          });

          if (extError) throw extError;
        }

        totalPaid += personalAmount;
      }

      // 3. Handle residual balance portion
      if (includeResidual && residualAmount > 0) {
        if (residualLinkedTransactionId) {
          // Link to existing transaction - also set credit_card_id for reconciliation
          const { error: linkError } = await supabase
            .from("transactions")
            .update({ is_card_payment: true, credit_card_id: creditCardId })
            .eq("id", residualLinkedTransactionId);

          if (linkError) throw linkError;
        } else if (residualPaymentType === "bank" && residualAccountId) {
          // Create bank debit transaction for residual - linked to card for reconciliation
          const { error: bankError } = await supabase.from("transactions").insert({
            user_id: user.id,
            description: `Pagamento de saldo - ${creditCardName}`,
            amount: residualAmount,
            type: "expense",
            date,
            account_id: residualAccountId,
            credit_card_id: creditCardId,
            category_id: null,
            status: "completed",
            is_corporate_expense: false,
            is_reimbursable: false,
            is_refund: false,
            is_card_payment: true,
          });

          if (bankError) throw bankError;

          // Balance is now computed dynamically — no need to update current_balance
        } else if (residualPaymentType === "external") {
          // Create external payment record for residual
          const { error: extError } = await supabase.from("transactions").insert({
            user_id: user.id,
            description: `Pagamento Externo (Saldo) - ${creditCardName}`,
            amount: residualAmount,
            type: "income",
            date,
            account_id: null,
            credit_card_id: creditCardId,
            category_id: null,
            status: "completed",
            is_corporate_expense: false,
            is_reimbursable: false,
            is_refund: false,
            is_card_payment: true,
          });

          if (extError) throw extError;
        }

        totalPaid += residualAmount;
      }

      // 4. Update credit card invoice
      if (totalPaid > 0) {
        const { data: card, error: cardFetchError } = await supabase
          .from("credit_cards")
          .select("current_invoice")
          .eq("id", creditCardId)
          .single();

        if (cardFetchError) throw cardFetchError;

        const newInvoice = Math.max(0, Number(card.current_invoice) - totalPaid);
        const { error: cardUpdateError } = await supabase
          .from("credit_cards")
          .update({
            current_invoice: newInvoice,
            status: newInvoice === 0 ? "paid" : "open",
          })
          .eq("id", creditCardId);

        if (cardUpdateError) throw cardUpdateError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit_cards"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["corporate-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["reimbursements"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["credit-card-transactions-reconciliation"] });
      toast({ title: "Fatura paga com sucesso!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao pagar fatura", description: error.message, variant: "destructive" });
    },
  });

  // Query pending future installments per card
  const { data: pendingByCardRaw = [] } = useQuery({
    queryKey: ["pending_installments_by_card", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("credit_card_id, amount")
        .eq("status", "pending")
        .eq("type", "expense")
        .eq("is_refund", false)
        .eq("is_card_payment", false)
        .eq("is_provisional", false)
        .not("credit_card_id", "is", null);

      if (error) throw error;

      // Group by credit_card_id
      const map: Record<string, number> = {};
      (data || []).forEach((t) => {
        const cardId = t.credit_card_id!;
        map[cardId] = (map[cardId] || 0) + Number(t.amount);
      });
      return map;
    },
    enabled: !!user,
  });

  const pendingByCard = pendingByCardRaw as unknown as Record<string, number>;
  const totalPendingInstallments = Object.values(pendingByCard).reduce((sum, v) => sum + v, 0);

  const totalInvoice = creditCards.reduce((sum, card) => sum + Number(card.current_invoice), 0);
  const totalLimit = creditCards.reduce((sum, card) => sum + Number(card.credit_limit), 0);
  const totalAvailable = totalLimit - totalInvoice - totalPendingInstallments;

  return {
    creditCards,
    isLoading,
    totalInvoice,
    totalLimit,
    totalAvailable,
    totalPendingInstallments,
    pendingByCard,
    createCreditCard,
    updateCreditCard,
    deleteCreditCard,
    payInvoice,
    paySplitInvoice,
  };
}
