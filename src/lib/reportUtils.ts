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
      !t.is_provisional &&
      t.status !== "pending" &&
      !t.is_corporate_expense
  );
}

/**
 * Returns the competence date for a transaction:
 * - Credit card transactions use due_date
 * - Others use date
 */
export function getCompetenceDate(t: Transaction): string {
  return t.credit_card_id && t.due_date ? t.due_date : t.date;
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
