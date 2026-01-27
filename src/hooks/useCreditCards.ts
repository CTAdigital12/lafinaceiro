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

  const payInvoice = useMutation({
    mutationFn: async ({ creditCardId, creditCardName, accountId, amount, date }: PayInvoiceParams) => {
      // 1. Create transaction in account (marked as card payment - won't appear in expense charts)
      const { error: txError } = await supabase.from("transactions").insert({
        user_id: user?.id,
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

      // 2. Update account balance
      const { data: account, error: accFetchError } = await supabase
        .from("accounts")
        .select("current_balance")
        .eq("id", accountId)
        .single();

      if (accFetchError) throw accFetchError;

      const newBalance = Number(account.current_balance) - amount;
      const { error: accUpdateError } = await supabase
        .from("accounts")
        .update({ current_balance: newBalance })
        .eq("id", accountId);

      if (accUpdateError) throw accUpdateError;

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
      const {
        creditCardId,
        creditCardName,
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

      // 1. Handle corporate portion
      if (includeCorporate && corporateAmount > 0) {
        const { error: corpError } = await supabase.from("transactions").insert({
          user_id: user?.id,
          description: `Baixa Corporativa - ${creditCardName}`,
          amount: corporateAmount,
          type: "income",
          date,
          account_id: null,
          credit_card_id: creditCardId,
          category_id: null,
          status: "completed",
          is_corporate_expense: true,
          is_reimbursable: false,
          is_refund: false,
          is_card_payment: true,
        });

        if (corpError) throw corpError;
        totalPaid += corporateAmount;
      }

      // 2. Handle personal portion
      if (includePersonal && personalAmount > 0) {
        if (linkToTransactionId) {
          // Link to existing transaction
          const { error: linkError } = await supabase
            .from("transactions")
            .update({ is_card_payment: true })
            .eq("id", linkToTransactionId);

          if (linkError) throw linkError;
        } else if (personalPaymentType === "bank" && accountId) {
          // Create bank debit transaction
          const { error: bankError } = await supabase.from("transactions").insert({
            user_id: user?.id,
            description: `Pagamento de fatura - ${creditCardName}`,
            amount: personalAmount,
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

          if (bankError) throw bankError;

          // Update account balance
          const { data: account, error: accFetchError } = await supabase
            .from("accounts")
            .select("current_balance")
            .eq("id", accountId)
            .single();

          if (accFetchError) throw accFetchError;

          const newBalance = Number(account.current_balance) - personalAmount;
          const { error: accUpdateError } = await supabase
            .from("accounts")
            .update({ current_balance: newBalance })
            .eq("id", accountId);

          if (accUpdateError) throw accUpdateError;
        } else if (personalPaymentType === "external") {
          // Create external payment record (income on card, no bank debit)
          const { error: extError } = await supabase.from("transactions").insert({
            user_id: user?.id,
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
          // Link to existing transaction
          const { error: linkError } = await supabase
            .from("transactions")
            .update({ is_card_payment: true })
            .eq("id", residualLinkedTransactionId);

          if (linkError) throw linkError;
        } else if (residualPaymentType === "bank" && residualAccountId) {
          // Create bank debit transaction for residual
          const { error: bankError } = await supabase.from("transactions").insert({
            user_id: user?.id,
            description: `Pagamento de saldo - ${creditCardName}`,
            amount: residualAmount,
            type: "expense",
            date,
            account_id: residualAccountId,
            credit_card_id: null,
            category_id: null,
            status: "completed",
            is_corporate_expense: false,
            is_reimbursable: false,
            is_refund: false,
            is_card_payment: true,
          });

          if (bankError) throw bankError;

          // Update account balance
          const { data: account, error: accFetchError } = await supabase
            .from("accounts")
            .select("current_balance")
            .eq("id", residualAccountId)
            .single();

          if (accFetchError) throw accFetchError;

          const newBalance = Number(account.current_balance) - residualAmount;
          const { error: accUpdateError } = await supabase
            .from("accounts")
            .update({ current_balance: newBalance })
            .eq("id", residualAccountId);

          if (accUpdateError) throw accUpdateError;
        } else if (residualPaymentType === "external") {
          // Create external payment record for residual
          const { error: extError } = await supabase.from("transactions").insert({
            user_id: user?.id,
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
      toast({ title: "Fatura paga com sucesso!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao pagar fatura", description: error.message, variant: "destructive" });
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
    payInvoice,
    paySplitInvoice,
  };
}
