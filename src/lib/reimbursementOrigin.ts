/**
 * Por onde voltou o dinheiro de uma despesa reembolsada — e, portanto, se ela
 * ainda pesa no que VOCÊ pagou ao banco naquela fatura.
 *
 * São dois caminhos (a pergunta do `ReimbursementOriginDialog`):
 *
 *  - Crédito na própria fatura: `mark_reimbursed` cria um espelho
 *    (`is_card_payment`) que abate o cartão. Quem devia pagou o banco direto;
 *    a despesa deixa de ser dívida sua na fatura.
 *  - PIX/transferência numa conta: `settle_reimbursements` vincula uma receita
 *    já lançada (`reimbursement_income_id`) ou cria uma na conta
 *    (`reimbursement_payment_id` apontando para receita SEM cartão). O banco
 *    cobrou a fatura cheia e você pagou; o dinheiro voltou por fora.
 *
 * Na dúvida vale o comportamento anterior: abatida na fatura. É o caso da
 * despesa reembolsada sem vínculo nenhum (dado de antes do espelho, 30/04/2026,
 * quando a baixa corporativa era um lançamento agregado) e do vínculo cujo
 * lançamento a consulta não trouxe. Só muda de lugar o que se PROVA ter vindo
 * por fora.
 */
export interface ReimbursementLink {
  reimbursement_status: string | null;
  reimbursement_income_id?: string | null;
  reimbursement_payment_id?: string | null;
  /** O lançamento apontado por `reimbursement_payment_id`, quando a consulta o traz. */
  reimbursement_payment?: { is_card_payment: boolean | null } | null;
}

export function isReimbursedOutsideInvoice(t: ReimbursementLink): boolean {
  if (t.reimbursement_status !== "reimbursed") return false;
  if (t.reimbursement_income_id) return true;
  return (
    !!t.reimbursement_payment_id &&
    !!t.reimbursement_payment &&
    t.reimbursement_payment.is_card_payment !== true
  );
}
