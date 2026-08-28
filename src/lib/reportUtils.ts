import type { Transaction } from "@/hooks/useTransactions";

/**
 * Filters "pure" expenses for report calculations.
 * Excludes card payments, provisional, pending, corporate, reimbursable.
 * Does NOT exclude refunds — caller decides how to handle them.
 */
export function filterPureExpenses(transactions: Transaction[]): Transaction[] {
  return transactions.filter(
    (t) =>
      t.type === "expense" &&
      !t.is_card_payment &&
      !t.is_provisional &&
      t.status !== "pending" &&
      !t.is_corporate_expense &&
      !t.is_reimbursable
  );
}

/**
 * Filters "pure" income for report calculations.
 */
export function filterPureIncome(transactions: Transaction[]): Transaction[] {
  return transactions.filter(
    (t) =>
      t.type === "income" &&
      !t.is_refund &&
      !t.is_card_payment &&
      !t.is_reimbursement &&
      !t.is_provisional &&
      t.status !== "pending" &&
      !t.is_corporate_expense
  );
}

/**
 * Returns the competence date for a transaction:
 * - Credit card transactions use due_date
 * - Others use date
 *
 * O parâmetro é a forma MÍNIMA que a função lê, e não `Transaction`, para que
 * telas com um recorte próprio da transação possam reusar a regra em vez de
 * reescrevê-la. `Transaction` satisfaz esta forma, então nenhum chamador muda.
 */
export function getCompetenceDate(t: {
  credit_card_id: string | null;
  due_date: string | null;
  date: string;
}): string {
  return t.credit_card_id && t.due_date ? t.due_date : t.date;
}

/**
 * A MESMA regra de competência, escrita como filtro do PostgREST — para
 * recortar o período no banco em vez de trazer tudo e filtrar depois.
 *
 * São três ramos, e o terceiro é o que costuma faltar:
 *
 *   1. sem cartão                    -> vale a data da compra
 *   2. com cartão e com vencimento   -> vale o vencimento
 *   3. com cartão e SEM vencimento   -> volta a valer a data da compra
 *
 * Sem o ramo 3, uma transação de cartão com `due_date` nulo não satisfaz
 * nenhuma condição e desaparece de TODOS os meses — não existe período em que
 * ela apareça, e nada na interface indica que ela existe. Foi o defeito
 * corrigido em Despesas da Empresa e Reembolsos (be32a51), que continuava no
 * filtro do Dashboard.
 *
 * Mantenha as duas funções em sincronia: `getCompetenceDate` decide em JS o
 * mesmo que este filtro decide em SQL.
 */
export function competenceRangeFilter(startDate: string, endDate: string): string {
  return [
    `and(credit_card_id.is.null,date.gte.${startDate},date.lte.${endDate})`,
    `and(credit_card_id.not.is.null,due_date.gte.${startDate},due_date.lte.${endDate})`,
    `and(credit_card_id.not.is.null,due_date.is.null,date.gte.${startDate},date.lte.${endDate})`,
  ].join(",");
}

/**
 * Groups transactions by month (YYYY-MM) using competence date.
 */
export function groupByMonth(transactions: Transaction[]): Record<string, Transaction[]> {
  const groups: Record<string, Transaction[]> = {};
  for (const t of transactions) {
    const month = getCompetenceDate(t).substring(0, 7); // YYYY-MM
    if (!groups[month]) groups[month] = [];
    groups[month].push(t);
  }
  return groups;
}

/**
 * Calculates net expense total (expenses - refunds) from filtered transactions.
 */
export function calcNetExpense(pureExpenses: Transaction[]): number {
  let total = 0;
  for (const t of pureExpenses) {
    if (t.is_refund) {
      total -= Number(t.amount);
    } else {
      total += Number(t.amount);
    }
  }
  return total;
}

/**
 * Calculates total income from filtered transactions.
 */
export function calcTotalIncome(pureIncome: Transaction[]): number {
  return pureIncome.reduce((sum, t) => sum + Number(t.amount), 0);
}
