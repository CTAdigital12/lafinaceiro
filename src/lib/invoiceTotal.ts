/**
 * Regra canônica de quanto uma transação pesa na fatura de um cartão.
 *
 * A referência é o `CASE` dos RPCs SQL (`mark_reimbursed`, `unmark_reimbursed`,
 * três cópias idênticas nas migrations), que já estava certo:
 *
 *     WHEN is_card_payment THEN -amount
 *     WHEN is_refund       THEN -amount
 *     WHEN type = 'expense' THEN amount
 *     ELSE 0
 *
 * O que importa é a ORDEM: `is_refund` decide ANTES de `type`. Um estorno
 * gravado como `type='income'` — que é como o SpreadsheetReconciliationModal
 * grava todo estorno de conciliação — precisa abater a fatura igual a um
 * estorno gravado como despesa.
 *
 * Era exatamente aí que o TypeScript divergia do SQL (achado A10): ele só
 * olhava `is_refund` dentro de `type === 'expense'`, então o estorno vindo da
 * conciliação era ignorado por um caminho e subtraído pelo outro, e
 * `current_invoice` mudava de valor conforme qual dos dois rodou por último.
 */

export interface InvoiceRow {
  amount: number | string;
  type?: string | null;
  is_refund?: boolean | null;
  is_card_payment?: boolean | null;
}

export interface InvoiceRowStatus {
  status?: string | null;
  is_provisional?: boolean | null;
}

/**
 * Contribuição com sinal de UMA transação para a fatura. Espelha o `CASE` do
 * SQL, inclusive na ordem das cláusulas.
 */
export function invoiceDelta(tx: InvoiceRow): number {
  const amount = Number(tx.amount);
  if (!Number.isFinite(amount)) return 0;

  if (tx.is_card_payment) return -amount;
  if (tx.is_refund) return -amount;
  if (tx.type === "expense") return amount;
  return 0;
}

/**
 * Quais linhas entram no cálculo. Espelha o `WHERE` do SQL
 * (`is_provisional = false AND status = 'completed'`): provisórias e pendentes
 * ficam de fora — pendente é parcela futura, que conta no limite, não na fatura.
 */
export function countsTowardInvoice(tx: InvoiceRowStatus): boolean {
  return tx.status === "completed" && tx.is_provisional !== true;
}

/**
 * Total da fatura de um cartão a partir das transações dele.
 *
 * O piso em zero espelha o `GREATEST(0, …)` do SQL. É deliberado manter a
 * paridade, mas o piso esconde saldo credor (pagou a mais, ou estorno maior
 * que a despesa) — está registrado como achado M2 e não se resolve aqui.
 */
export function sumInvoice(rows: (InvoiceRow & InvoiceRowStatus)[]): number {
  const total = rows
    .filter(countsTowardInvoice)
    .reduce((sum, row) => sum + invoiceDelta(row), 0);

  return Math.max(0, total);
}
