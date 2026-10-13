import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { isReimbursedOutsideInvoice } from "@/lib/reimbursementOrigin";

export interface InvoiceTransaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  due_date: string | null;
  is_corporate_expense: boolean;
  is_reimbursable: boolean;
  is_refund: boolean;
  is_card_payment: boolean | null;
  status: string;
  reimbursement_status: string | null;
  /** Reembolsada por PIX/transferência, não por crédito no cartão. */
  reimbursed_outside_invoice: boolean;
  split_group_id: string | null;
  category_name: string | null;
  category_icon: string | null;
}

interface UseInvoiceTransactionsOptions {
  creditCardId: string;
  month: number;
  year: number;
  enabled?: boolean;
}

export function useInvoiceTransactions({
  creditCardId,
  month,
  year,
  enabled = true,
}: UseInvoiceTransactionsOptions) {
  const { user } = useAuth();

  const periodStart = format(startOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");
  const periodEnd = format(endOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["invoice-transactions", creditCardId, month, year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select(
          `
          id,
          description,
          amount,
          date,
          due_date,
          is_corporate_expense,
          is_reimbursable,
          is_refund,
          is_card_payment,
          status,
          reimbursement_status,
          reimbursement_income_id,
          reimbursement_payment_id,
          split_group_id,
          categories(name, icon)
        `
        )
        .eq("credit_card_id", creditCardId)
        // Estorno também entra, mesmo lançado como receita: a conciliação por
        // planilha grava todo estorno com `type='income'`, e filtrar só por
        // despesa fazia a fatura do ciclo ignorá-lo (A10). A matemática abaixo
        // já separa `is_refund` e subtrai.
        .or("type.eq.expense,is_refund.eq.true")
        // Pagamento de fatura fora — não é conteúdo da fatura. O comentário
        // acima afirmava isso, mas nada implementava: `paySplitInvoice` grava o
        // débito bancário como `type='expense'` COM `credit_card_id`
        // preenchido, então ele passava pelo filtro de despesa e era somado em
        // `personalTotal` como se fosse compra. Efeito medido no ciclo de
        // 07/2026: 25.317,06 no app contra 17.705,70 na fatura do Itaú —
        // exatamente o pagamento de 7.611,36 contado duas vezes. O
        // `useCreditCardReconciliation` já filtrava certo, por isso a tela de
        // Conciliação nunca acusou. `not.is.true` e não `eq.false`: a coluna é
        // anulável e lançamento antigo tem NULL.
        .not("is_card_payment", "is", true)
        .eq("status", "completed")
        .or(
          `and(due_date.gte.${periodStart},due_date.lte.${periodEnd}),and(due_date.is.null,date.gte.${periodStart},date.lte.${periodEnd})`
        )
        .order("date", { ascending: false });

      if (error) throw error;

      // O lançamento do reembolso é o que diz se ele veio pelo cartão (espelho,
      // `is_card_payment`) ou por fora (receita criada na conta). Consulta à
      // parte, por id, e não embed: a FK aponta para a própria `transactions`,
      // e o embed é ambíguo na direção — pode devolver as linhas que apontam
      // PARA esta, um `[]` que passaria por "lançamento encontrado".
      const paymentIds = (data || [])
        .filter(
          (t) =>
            t.reimbursement_status === "reimbursed" &&
            t.reimbursement_payment_id &&
            !t.reimbursement_income_id
        )
        .map((t) => t.reimbursement_payment_id as string);
      const payments = new Map<string, { is_card_payment: boolean | null }>();
      if (paymentIds.length > 0) {
        const { data: rows, error: paymentsError } = await supabase
          .from("transactions")
          .select("id, is_card_payment")
          .in("id", paymentIds);
        if (paymentsError) throw paymentsError;
        for (const p of rows ?? []) payments.set(p.id, p);
      }

      return (data || []).map((t) => ({
        id: t.id,
        description: t.description,
        amount: Number(t.amount),
        date: t.date,
        due_date: t.due_date,
        is_corporate_expense: t.is_corporate_expense,
        is_reimbursable: t.is_reimbursable,
        is_refund: t.is_refund,
        is_card_payment: t.is_card_payment ?? null,
        status: t.status,
        reimbursement_status: t.reimbursement_status ?? null,
        reimbursed_outside_invoice: isReimbursedOutsideInvoice({
          ...t,
          reimbursement_payment: t.reimbursement_payment_id
            ? payments.get(t.reimbursement_payment_id) ?? null
            : null,
        }),
        split_group_id: t.split_group_id ?? null,
        category_name: (t.categories as { name: string } | null)?.name || null,
        category_icon: (t.categories as { icon: string } | null)?.icon || null,
      })) as InvoiceTransaction[];
    },
    enabled: !!user && !!creditCardId && enabled,
  });

  // Calculate totals with 3 categories.
  //
  // O pagamento já é excluído na consulta; repetir aqui é deliberado. A soma
  // não pode depender de um filtro remoto para estar certa: qualquer mudança
  // na query (ou um chamador que passe outra lista) voltaria a contar o débito
  // bancário como compra pessoal, que foi exatamente o defeito.
  const invoiceContent = transactions.filter((t) => !t.is_card_payment);
  const normalTransactions = invoiceContent.filter((t) => !t.is_refund);
  const refundTransactions = invoiceContent.filter((t) => t.is_refund);

  // Already-reimbursed expenses no longer represent a debt to settle on the
  // invoice modal: a mirror payment was created by mark_reimbursed and is
  // reducing current_invoice on the card row. We exclude them from corporate
  // and reimbursable totals so PayInvoiceModal does not double-count.
  // That premise only holds for the mirror path — the ones paid back by PIX
  // come back below, in `reimbursedOutsideTotal`.
  const isPendingReimbursement = (t: InvoiceTransaction) =>
    t.reimbursement_status !== "reimbursed";

  // Corporate: is_corporate_expense = true (excluding already-reimbursed)
  const corporateNormal = normalTransactions
    .filter((t) => t.is_corporate_expense && isPendingReimbursement(t))
    .reduce((sum, t) => sum + t.amount, 0);
  const corporateRefunds = refundTransactions
    .filter((t) => t.is_corporate_expense && isPendingReimbursement(t))
    .reduce((sum, t) => sum + t.amount, 0);
  const corporateTotal = corporateNormal - corporateRefunds;

  // Reimbursable: is_reimbursable = true AND is_corporate_expense = false
  // (also excluding already-reimbursed)
  const reimbursableNormal = normalTransactions
    .filter(
      (t) => t.is_reimbursable && !t.is_corporate_expense && isPendingReimbursement(t)
    )
    .reduce((sum, t) => sum + t.amount, 0);
  const reimbursableRefunds = refundTransactions
    .filter(
      (t) => t.is_reimbursable && !t.is_corporate_expense && isPendingReimbursement(t)
    )
    .reduce((sum, t) => sum + t.amount, 0);
  const reimbursableTotal = reimbursableNormal - reimbursableRefunds;

  // Personal: is_corporate_expense = false AND is_reimbursable = false
  const personalNormal = normalTransactions
    .filter((t) => !t.is_corporate_expense && !t.is_reimbursable)
    .reduce((sum, t) => sum + t.amount, 0);
  const personalRefunds = refundTransactions
    .filter((t) => !t.is_corporate_expense && !t.is_reimbursable)
    .reduce((sum, t) => sum + t.amount, 0);
  const personalTotal = personalNormal - personalRefunds;

  // Reembolsadas POR FORA (PIX/transferência numa conta). O filtro acima as
  // tira de corporativo e reembolsável, como se o espelho tivesse abatido o
  // cartão — mas não há espelho: o banco cobrou a fatura cheia e quem pagou
  // foi você, o dinheiro voltou para a conta. Elas continuam no seu total a
  // pagar. Sem isto, o ciclo do Itaú de 09/2026 saía 753,58 abaixo do banco
  // depois de quitar três corporativas com um PIX da empresa.
  //
  // Não voltam para `corporateTotal`: o PayInvoiceModal trata esse valor como
  // o que a empresa paga direto no cartão, e `paySplitInvoice` cria espelho
  // para ele.
  const reimbursedOutside = invoiceContent.filter(
    (t) => (t.is_corporate_expense || t.is_reimbursable) && t.reimbursed_outside_invoice
  );
  const reimbursedOutsideTotal = reimbursedOutside.reduce(
    (sum, t) => sum + (t.is_refund ? -t.amount : t.amount),
    0
  );

  // My total to pay = reimbursable + personal + the ones paid back outside the
  // card (all of them come out of my pocket on this invoice)
  const myTotalToPay = reimbursableTotal + personalTotal + reimbursedOutsideTotal;
  const transactionsTotal = corporateTotal + myTotalToPay;

  // Fetch invoice cycle for this card/month/year to get closedAmount
  const { data: invoiceCycleData } = useQuery({
    queryKey: ["invoice-cycle-for-payment", creditCardId, month, year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_card_invoices")
        .select("closed_amount, status")
        .eq("credit_card_id", creditCardId)
        .eq("month", month)
        .eq("year", year)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!user && !!creditCardId && enabled,
  });

  const closedAmount = invoiceCycleData?.closed_amount != null ? Number(invoiceCycleData.closed_amount) : null;
  const invoiceStatus = (invoiceCycleData?.status as string) || "open";

  return {
    transactions,
    isLoading,
    corporateTotal,
    reimbursableTotal,
    personalTotal,
    reimbursedOutsideTotal,
    myTotalToPay,
    transactionsTotal,
    closedAmount,
    invoiceStatus,
  };
}
