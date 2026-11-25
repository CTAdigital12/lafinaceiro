import { describe, it, expect } from "vitest";
import { buildBudgetPeriodReport, type MonthKey } from "@/lib/budgetPeriodReport";
import { buildCategorySpending, UNCATEGORIZED } from "@/lib/categorySpending";
import { leafPlannedTotal } from "@/lib/buildHierarchicalBudgets";
import type { Budget } from "@/hooks/useBudgets";
import type { Category } from "@/hooks/useCategories";
import type { Transaction } from "@/hooks/useTransactions";

/**
 * "Orçamento vs Realizado" por período nos Relatórios. Antes o quadro era do mês
 * corrente e tinha regra própria: não abatia estorno, deixava gasto sem
 * categoria de fora (o total não fechava com o gráfico) e a "Variação %" media
 * o realizado contra o MÊS ANTERIOR, não contra o orçado.
 */
const cat = (id: string, name: string, parent_id: string | null = null): Category => ({
  id,
  user_id: "u",
  name,
  icon: "🏷️",
  color: null,
  type: "expense",
  parent_id,
  is_reimbursable: false,
  created_at: "2026-01-01T00:00:00Z",
});

const CATS = [
  cat("casa", "Moradia"),
  cat("luz", "Luz", "casa"),
  cat("agua", "Água", "casa"),
  cat("mercado", "Supermercado"),
  cat("pet", "Pet"),
  cat("racao", "Ração", "pet"),
  cat("lazer", "Lazer"),
];

const byId = new Map(CATS.map((c) => [c.id, c]));
const budget = (category_id: string, month: number, planned_amount: number): Budget => {
  const c = byId.get(category_id)!;
  return {
    id: `${category_id}-${month}`,
    user_id: "u",
    category_id,
    month,
    year: 2026,
    planned_amount,
    created_at: "",
    categories: { id: c.id, name: c.name, icon: c.icon ?? "", color: "", parent_id: c.parent_id },
  };
};

const tx = (over: Partial<Transaction>): Transaction =>
  ({
    id: Math.random().toString(36).slice(2),
    date: "2026-10-10",
    due_date: null,
    credit_card_id: null,
    category_id: null,
    amount: 100,
    type: "expense",
    status: "completed",
    is_provisional: false,
    is_refund: false,
    is_card_payment: false,
    is_corporate_expense: false,
    is_reimbursable: false,
    is_reimbursement: false,
    is_investment_contribution: false,
    ...over,
  }) as Transaction;

const MESES: MonthKey[] = [
  { key: "2026-10", month: 10, year: 2026, label: "out/26" },
  { key: "2026-11", month: 11, year: 2026, label: "nov/26" },
];

const BUDGETS = [
  // Moradia: o pai tem meta própria (500) e os filhos também -> vale a soma dos filhos.
  budget("casa", 10, 500), budget("luz", 10, 200), budget("agua", 10, 100),
  budget("casa", 11, 500), budget("luz", 11, 200), budget("agua", 11, 100),
  // Supermercado só tem meta em outubro.
  budget("mercado", 10, 1000),
  // Pet: meta no pai, filha sem meta -> o gasto da filha conta na meta do pai.
  budget("pet", 10, 300), budget("pet", 11, 300),
  // Lazer: meta gravada como zero.
  budget("lazer", 11, 0),
];

const TXS = [
  tx({ category_id: "luz", amount: 250, date: "2026-10-05" }),
  tx({ category_id: "agua", amount: 90, date: "2026-11-05" }),
  tx({ category_id: "mercado", amount: 800, date: "2026-10-12" }),
  tx({ category_id: "mercado", amount: 600, date: "2026-11-12" }), // mês sem meta
  tx({ category_id: "racao", amount: 350, date: "2026-11-20" }),
  // Estorno de cartão gravado como receita: abate a despesa do mesmo mês.
  tx({ category_id: "mercado", amount: 50, type: "income", is_refund: true, credit_card_id: "c", due_date: "2026-10-15", date: "2026-10-01" }),
  tx({ category_id: null, amount: 40, date: "2026-11-02" }), // sem categoria
  tx({ category_id: "lazer", amount: 70, date: "2026-11-03" }),
  // Fora do período e fora da despesa pessoal: não entram.
  tx({ category_id: "mercado", amount: 999, date: "2026-09-30" }),
  tx({ category_id: "mercado", amount: 999, is_corporate_expense: true }),
  tx({ category_id: "mercado", amount: 999, status: "pending", date: "2026-11-25" }),
];

describe("buildBudgetPeriodReport", () => {
  const r = buildBudgetPeriodReport(BUDGETS, TXS, CATS, MESES);

  it("orçado do mês soma só metas-folha (o pai com filhos orçados fica de fora)", () => {
    // out: luz 200 + água 100 + mercado 1000 + pet 300
    expect(r.months[0].planned).toBe(1600);
    // nov: luz 200 + água 100 + pet 300 + lazer 0
    expect(r.months[1].planned).toBe(600);
  });

  it("realizado é a despesa paga com estorno abatido", () => {
    // out: 250 + 800 − 50
    expect(r.months[0].actual).toBe(1000);
    // nov: 90 + 600 + 350 + 40 + 70
    expect(r.months[1].actual).toBe(1150);
  });

  it("a variação é contra o ORÇADO do mês, não contra o mês anterior", () => {
    expect(r.months[0].variancePct).toBe(-37); // (1000 − 1600) / 1600 = −37,5
    expect(r.months[1].variancePct).toBe(92); // (1150 − 600) / 600 = 91,7
  });

  it("o quadro soma os meses e fecha com o total realizado", () => {
    const soma = r.items.reduce((s, i) => s + i.spent, 0);
    expect(soma).toBe(r.totalActual);
    expect(r.totalPlanned).toBe(2200);
    expect(r.totalActual).toBe(2150);
  });

  it("cada linha usa a meta do mês em que ela existe", () => {
    const linha = (id: string) => r.items.find((i) => i.id === id)!;

    const moradia = linha("casa");
    expect(moradia.planned).toBe(600); // filhos, nos dois meses; os 500 do pai não contam
    expect(moradia.spent).toBe(340);
    expect(moradia.children.map((c) => [c.id, c.planned, c.spent])).toEqual(
      expect.arrayContaining([["luz", 400, 250], ["agua", 200, 90]]),
    );

    const mercado = linha("mercado");
    expect(mercado.planned).toBe(1000); // só outubro tinha meta
    expect(mercado.spent).toBe(1350); // 800 − 50 + 600
    expect(mercado.overBudget).toBe(true);

    const pet = linha("pet");
    expect(pet.planned).toBe(600);
    expect(pet.spent).toBe(350); // a filha sem meta conta no pai
  });

  it("gasto sem meta aparece marcado, inclusive sem categoria e meta zero", () => {
    const semCategoria = r.items.find((i) => i.id === UNCATEGORIZED)!;
    expect(semCategoria.spent).toBe(40);
    expect(semCategoria.unbudgeted).toBe(true);

    const lazer = r.items.find((i) => i.id === "lazer")!;
    expect(lazer.unbudgeted).toBe(true);
    expect(lazer.pct).toBe(0);

    // Linhas sem meta vão para o fim.
    const ultimos = r.items.slice(-2).map((i) => i.id).sort();
    expect(ultimos).toEqual(["lazer", UNCATEGORIZED].sort());
  });
});

describe("leafPlannedTotal", () => {
  it("ignora a meta do pai quando um filho tem meta no mesmo mês", () => {
    expect(leafPlannedTotal(BUDGETS.filter((b) => b.month === 10))).toBe(1600);
  });
});

describe("buildCategorySpending", () => {
  it("soma a filha nela e no pai, e abate estorno", () => {
    const { paid } = buildCategorySpending(
      [
        tx({ category_id: "luz", amount: 100 }),
        tx({ category_id: "luz", amount: 30, type: "income", is_refund: true, credit_card_id: "c" }),
        tx({ category_id: null, amount: 5 }),
      ],
      CATS,
    );
    expect(paid.luz).toBe(70);
    expect(paid.casa).toBe(70);
    expect(paid[UNCATEGORIZED]).toBe(5);
  });
});
