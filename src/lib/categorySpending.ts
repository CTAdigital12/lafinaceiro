import type { TransactionFlags } from "@/lib/transactionFilters";
import { isForecastExpense, isMonthlyExpense, isMonthlyExpenseRefund } from "@/lib/transactionFilters";

/** Chave do gasto sem categoria nos mapas abaixo. */
export const UNCATEGORIZED = "uncategorized";

export interface CategorySpending {
  /** Despesa pessoal paga, estornos abatidos (o "total de despesas" das outras telas). */
  paid: Record<string, number>;
  /** Provisórias e pendentes. */
  forecast: Record<string, number>;
  /** `paid + forecast`. */
  spent: Record<string, number>;
}

/**
 * Gasto por categoria, com o da subcategoria somado TAMBÉM no pai.
 *
 * É a entrada de `buildHierarchicalBudgets`: o pai mede o gasto dele e o de
 * todas as filhas contra a meta. Morava dentro do `Planning.tsx`. Saiu para cá
 * quando o relatório "Orçamento vs Realizado" passou a usar a mesma árvore,
 * para as duas telas não somarem por regras diferentes.
 *
 * Os mapas têm o gasto da filha nela e no pai, então NÃO se somam os valores
 * de um mapa para chegar ao total: isso conta a filha duas vezes. O total sai
 * de `sumBudgetSpending`.
 */
export function buildCategorySpending(
  transactions: readonly (TransactionFlags & { amount: number | string; category_id: string | null })[],
  categories: readonly { id: string; parent_id: string | null }[],
): CategorySpending {
  const parentOf = new Map(categories.map((c) => [c.id, c.parent_id]));
  const paid: Record<string, number> = {};
  const forecast: Record<string, number> = {};

  for (const t of transactions) {
    let target: Record<string, number>;
    let amount = Number(t.amount);

    if (isMonthlyExpense(t)) {
      target = paid;
    } else if (isMonthlyExpenseRefund(t)) {
      target = paid;
      amount = -amount;
    } else if (isForecastExpense(t)) {
      target = forecast;
    } else {
      continue;
    }

    const catId = t.category_id || UNCATEGORIZED;
    target[catId] = (target[catId] || 0) + amount;

    const parentId = parentOf.get(catId);
    if (parentId) {
      target[parentId] = (target[parentId] || 0) + amount;
    }
  }

  const spent: Record<string, number> = {};
  new Set([...Object.keys(paid), ...Object.keys(forecast)]).forEach((catId) => {
    spent[catId] = (paid[catId] || 0) + (forecast[catId] || 0);
  });

  return { paid, forecast, spent };
}
