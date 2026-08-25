/**
 * Regras puras de "quitar previstos com um pagamento". Ficam fora do hook para
 * poderem ser testadas sem o cliente Supabase — importá-lo em teste derruba a
 * suíte no CI, onde não há VITE_SUPABASE_URL.
 *
 * Contrato com a RPC `settle_transactions_with_payment`: a soma dos alvos
 * precisa bater EXATAMENTE com o valor do pagamento (2 casas).
 */
import { round2 } from "@/lib/splitTransaction";

/** Diferença entre o valor do pagamento e a soma dos selecionados. */
export function settleRemaining(paymentAmount: number, selected: { amount: number }[]): number {
  return round2(
    round2(paymentAmount) - round2(selected.reduce((sum, t) => sum + Number(t.amount), 0)),
  );
}

/**
 * Um lançamento só pode quitar previstos quando ele é o débito real de uma
 * conta: já realizado, fora de cartão, ainda não dividido, não estornado e não
 * reembolsado. Espelha as travas da RPC, para o botão não aparecer onde o banco
 * recusaria.
 *
 * O espelho estava furado dos DOIS lados: aqui se olhava `is_refund`, que a RPC
 * ignorava, e não se olhavam as colunas de reembolso, que a RPC rejeitava. A
 * migration 20260825150000 acrescentou `is_refund` lá; estas duas colunas
 * entraram aqui.
 */
export function canSettleWithPayment(tx: {
  status: string;
  is_provisional: boolean | null;
  credit_card_id: string | null;
  is_card_payment: boolean | null;
  split_group_id: string | null;
  is_refund: boolean | null;
  reimbursement_payment_id: string | null;
  reimbursement_income_id: string | null;
}): boolean {
  return (
    tx.status === "completed" &&
    !tx.is_provisional &&
    !tx.credit_card_id &&
    !tx.is_card_payment &&
    !tx.split_group_id &&
    !tx.is_refund &&
    !tx.reimbursement_payment_id &&
    !tx.reimbursement_income_id
  );
}
