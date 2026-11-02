import { isMonthlyIncome, type TransactionFlags } from "@/lib/transactionFilters";

/**
 * Fatias do gráfico "Receitas por Categoria" do Dashboard.
 *
 * A seleção é `isMonthlyIncome` — a MESMA do card "Receitas". Antes o gráfico
 * tinha filtro próprio, escrito à mão, que divergia do card nos dois sentidos:
 * contava receita da empresa, pendente e provisória (que o card exclui) e
 * perdia toda receita sem categoria ou com categoria de despesa, porque só
 * percorria a lista de categorias de receita. Como o gráfico mostra
 * percentuais, a receita perdida sumia sem deixar rastro (out/2026: card
 * R$ 12.268,81, fatias somando menos).
 *
 * Por isso o que não cai numa categoria de receita vira a fatia
 * "Sem categoria", e a soma das fatias é, por construção, o total do card.
 */
export const UNCATEGORIZED_INCOME_ID = "__sem_categoria__";
export const UNCATEGORIZED_INCOME_NAME = "Sem categoria";
const UNCATEGORIZED_INCOME_COLOR = "hsl(210, 10%, 60%)";

type IncomeTransaction = TransactionFlags & {
  amount: number | string;
  category_id?: string | null;
};

type IncomeCategory = {
  id: string;
  name: string;
  fullName?: string;
  color?: string | null;
};

export type IncomeSlice<T> = {
  id: string;
  name: string;
  value: number;
  color: string;
  transactions: T[];
};

export function groupIncomeByCategory<T extends IncomeTransaction>(
  transactions: T[],
  incomeCategories: IncomeCategory[],
): IncomeSlice<T>[] {
  const known = new Set(incomeCategories.map((c) => c.id));
  const byCategory = new Map<string, T[]>();

  for (const t of transactions) {
    if (!isMonthlyIncome(t)) continue;
    const key = t.category_id && known.has(t.category_id) ? t.category_id : UNCATEGORIZED_INCOME_ID;
    const list = byCategory.get(key);
    if (list) list.push(t);
    else byCategory.set(key, [t]);
  }

  const sum = (list: T[]) => list.reduce((acc, t) => acc + Number(t.amount), 0);

  const slices: IncomeSlice<T>[] = incomeCategories.map((cat) => {
    const list = byCategory.get(cat.id) ?? [];
    return {
      id: cat.id,
      name: cat.fullName || cat.name,
      value: sum(list),
      color: cat.color || "hsl(var(--chart-2))",
      transactions: list,
    };
  });

  const uncategorized = byCategory.get(UNCATEGORIZED_INCOME_ID) ?? [];
  slices.push({
    id: UNCATEGORIZED_INCOME_ID,
    name: UNCATEGORIZED_INCOME_NAME,
    value: sum(uncategorized),
    color: UNCATEGORIZED_INCOME_COLOR,
    transactions: uncategorized,
  });

  return slices.filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
}
