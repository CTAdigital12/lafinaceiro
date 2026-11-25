import type { Budget } from "@/hooks/useBudgets";
import type { Category } from "@/hooks/useCategories";
import type { Transaction } from "@/hooks/useTransactions";
import { buildHierarchicalBudgets, leafPlannedTotal } from "@/lib/buildHierarchicalBudgets";
import { buildCategorySpending, UNCATEGORIZED } from "@/lib/categorySpending";
import { getCompetenceDate } from "@/lib/reportUtils";
import { sumBudgetSpending } from "@/lib/transactionFilters";

/**
 * "Orçamento vs Realizado" de um PERÍODO (3, 6 ou 12 meses) na aba Planejamento
 * dos Relatórios: gráfico mês a mês, card acumulado e quadro por categoria.
 *
 * Cada mês é montado com as MESMAS regras da tela de Planejamento — árvore de
 * `buildHierarchicalBudgets`, gasto de `buildCategorySpending`, total de
 * `leafPlannedTotal` — e os meses são somados depois. Somar antes daria errado:
 * uma categoria pode ter meta num mês e não no outro, e o pai só ignora a
 * própria meta nos meses em que os filhos têm meta.
 *
 * "Realizado" é a despesa pessoal PAGA, com estornos abatidos (`paid` de
 * `sumBudgetSpending`); previstas ficam de fora. O relatório antigo não abatia
 * estorno e montava o quadro por regra própria, que deixava de fora gasto sem
 * categoria e subcategoria sem meta — o total do quadro não fechava com o
 * gráfico. Aqui toda despesa aparece numa linha: as sem meta vêm marcadas.
 */
export interface MonthKey {
  /** `yyyy-MM` */
  key: string;
  month: number;
  year: number;
  label: string;
}

export interface BudgetPeriodMonth {
  label: string;
  planned: number;
  actual: number;
  /** `(realizado − orçado) / orçado`, em %. `null` quando não há orçado. */
  variancePct: number | null;
}

export interface BudgetPeriodItem {
  id: string;
  name: string;
  icon: string;
  planned: number;
  spent: number;
  /** `spent / planned`, em %. 0 quando não há meta. */
  pct: number;
  overBudget: boolean;
  /** Sem meta (ou meta zero) no período inteiro: gasto fora do orçamento. */
  unbudgeted: boolean;
  children: BudgetPeriodItem[];
}

export interface BudgetPeriodReport {
  months: BudgetPeriodMonth[];
  totalPlanned: number;
  totalActual: number;
  /** `totalActual / totalPlanned`, em %. */
  pct: number;
  diff: number;
  /** Linhas do quadro: pais (com filhos) e avulsas, maior consumo primeiro. */
  items: BudgetPeriodItem[];
}

interface Acc {
  id: string;
  name: string;
  icon: string;
  planned: number;
  spent: number;
  budgetedSomeMonth: boolean;
  children: Map<string, Acc>;
}

const pct = (spent: number, planned: number) =>
  planned > 0 ? Math.round((spent / planned) * 100) : 0;

function finish(a: Acc): BudgetPeriodItem {
  const p = pct(a.spent, a.planned);
  return {
    id: a.id,
    name: a.name,
    icon: a.icon,
    planned: a.planned,
    spent: a.spent,
    pct: p,
    overBudget: a.planned > 0 && a.spent > a.planned,
    // Meta gravada como 0,00 não é meta: sem isto a linha aparecia "0%" com gasto.
    unbudgeted: !a.budgetedSomeMonth || a.planned <= 0,
    children: [...a.children.values()].map(finish).sort(byConsumption),
  };
}

/** Com meta primeiro, do mais consumido ao menos; sem meta por fim, maior gasto primeiro. */
function byConsumption(a: BudgetPeriodItem, b: BudgetPeriodItem) {
  if (a.unbudgeted !== b.unbudgeted) return a.unbudgeted ? 1 : -1;
  if (a.unbudgeted) return b.spent - a.spent;
  return b.pct - a.pct;
}

export function buildBudgetPeriodReport(
  budgets: readonly Budget[],
  transactions: readonly Transaction[],
  categories: readonly Category[],
  months: readonly MonthKey[],
): BudgetPeriodReport {
  const txByMonth = new Map<string, Transaction[]>(months.map((m) => [m.key, []]));
  for (const t of transactions) {
    txByMonth.get(getCompetenceDate(t).substring(0, 7))?.push(t);
  }

  const rows = new Map<string, Acc>();
  const acc = (into: Map<string, Acc>, id: string, name: string, icon: string): Acc => {
    let a = into.get(id);
    if (!a) {
      a = { id, name, icon, planned: 0, spent: 0, budgetedSomeMonth: false, children: new Map() };
      into.set(id, a);
    }
    return a;
  };

  const monthRows: BudgetPeriodMonth[] = months.map((m) => {
    const monthBudgets = budgets.filter((b) => b.month === m.month && b.year === m.year);
    const monthTx = txByMonth.get(m.key) ?? [];
    const { paid } = buildCategorySpending(monthTx, categories);
    const tree = buildHierarchicalBudgets(monthBudgets, paid, [...categories]);

    for (const node of tree) {
      const catId = node.categories?.id ?? node.category_id ?? node.id;
      const row = acc(rows, catId, node.categories?.name ?? "Sem nome", node.categories?.icon || "📊");
      // Mesma meta que a tela de Planejamento usa na linha do pai.
      row.planned += node.isParent ? node.totalPlanned : Number(node.planned_amount);
      row.spent += node.totalSpent;
      if (!node.isUnbudgeted) row.budgetedSomeMonth = true;

      for (const child of node.children) {
        const childId = child.categories?.id ?? child.category_id ?? child.id;
        const c = acc(row.children, childId, child.categories?.name ?? "Sem nome", child.categories?.icon || "📊");
        c.planned += Number(child.planned_amount);
        c.spent += child.totalSpent;
        if (!child.isUnbudgeted) c.budgetedSomeMonth = true;
      }
    }

    // A árvore só tem categorias: o gasto sem categoria ganha linha própria
    // para o quadro fechar com o total do mês.
    const uncategorized = paid[UNCATEGORIZED] || 0;
    if (uncategorized !== 0) {
      acc(rows, UNCATEGORIZED, "Sem categoria", "❔").spent += uncategorized;
    }

    const planned = leafPlannedTotal(monthBudgets);
    const actual = sumBudgetSpending(monthTx).paid;
    return {
      label: m.label,
      planned,
      actual,
      variancePct: planned > 0 ? Math.round(((actual - planned) / planned) * 100) : null,
    };
  });

  const totalPlanned = monthRows.reduce((s, m) => s + m.planned, 0);
  const totalActual = monthRows.reduce((s, m) => s + m.actual, 0);

  return {
    months: monthRows,
    totalPlanned,
    totalActual,
    pct: pct(totalActual, totalPlanned),
    diff: totalActual - totalPlanned,
    items: [...rows.values()]
      .filter((r) => r.planned !== 0 || Math.abs(r.spent) >= 0.005)
      .map(finish)
      .sort(byConsumption),
  };
}
