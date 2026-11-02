import { describe, it, expect } from "vitest";
import {
  groupIncomeByCategory,
  UNCATEGORIZED_INCOME_ID,
  UNCATEGORIZED_INCOME_NAME,
} from "@/lib/incomeByCategory";
import { isMonthlyIncome } from "@/lib/transactionFilters";

const categories = [
  { id: "lucros", name: "Antecipação de Lucros", color: "pink" },
  { id: "salario", name: "Salário", color: "green" },
];

let seq = 0;
const tx = (amount: number, category_id: string | null, extra: Record<string, unknown> = {}) => ({
  id: `t${++seq}`,
  type: "income",
  amount,
  category_id,
  status: "completed",
  ...extra,
});

const total = (slices: { value: number }[]) => slices.reduce((s, x) => s + x.value, 0);

describe("groupIncomeByCategory", () => {
  it("soma por categoria de receita, da maior para a menor", () => {
    const slices = groupIncomeByCategory(
      [tx(1000, "salario"), tx(5000, "lucros"), tx(500, "salario")],
      categories,
    );

    expect(slices.map((s) => [s.name, s.value])).toEqual([
      ["Antecipação de Lucros", 5000],
      ["Salário", 1500],
    ]);
  });

  // O bug de out/2026: receita sem categoria contava no card e sumia do
  // gráfico, que só percorria a lista de categorias de receita.
  it("receita sem categoria vira a fatia 'Sem categoria'", () => {
    const slices = groupIncomeByCategory([tx(1000, "salario"), tx(300, null)], categories);

    const sem = slices.find((s) => s.id === UNCATEGORIZED_INCOME_ID);
    expect(sem?.name).toBe(UNCATEGORIZED_INCOME_NAME);
    expect(sem?.value).toBe(300);
    expect(sem?.transactions).toHaveLength(1);
  });

  it("receita com categoria que não é de receita também cai em 'Sem categoria'", () => {
    const slices = groupIncomeByCategory([tx(200, "moradia")], categories);

    expect(slices).toHaveLength(1);
    expect(slices[0].id).toBe(UNCATEGORIZED_INCOME_ID);
    expect(slices[0].value).toBe(200);
  });

  // O outro lado da divergência: o gráfico contava o que o card exclui.
  it.each([
    ["da empresa", { is_corporate_expense: true }],
    ["pendente", { status: "pending" }],
    ["provisória", { is_provisional: true }],
    ["pagamento de fatura", { is_card_payment: true }],
    ["estorno", { is_refund: true }],
    ["reembolso", { is_reimbursement: true }],
  ])("não conta receita %s", (_label, extra) => {
    expect(groupIncomeByCategory([tx(999, "salario", extra)], categories)).toEqual([]);
  });

  it("não conta despesa", () => {
    expect(groupIncomeByCategory([tx(100, "salario", { type: "expense" })], categories)).toEqual([]);
  });

  it("a soma das fatias é o total do card, seja qual for a mistura", () => {
    const transactions = [
      tx(5000, "lucros"),
      tx(1000, "salario"),
      tx(300, null),
      tx(200, "moradia"),
      tx(700, "salario", { is_corporate_expense: true }),
      tx(400, "lucros", { status: "pending" }),
      tx(150, null, { is_provisional: true }),
      tx(80, "salario", { is_reimbursement: true }),
      tx("12.34" as unknown as number, "salario"),
    ];
    const card = transactions.filter(isMonthlyIncome).reduce((s, t) => s + Number(t.amount), 0);

    expect(total(groupIncomeByCategory(transactions, categories))).toBeCloseTo(card, 2);
  });

  it("não cria fatia vazia", () => {
    expect(groupIncomeByCategory([], categories)).toEqual([]);
  });

  it("usa o nome completo da subcategoria", () => {
    const slices = groupIncomeByCategory(
      [tx(100, "rend")],
      [{ id: "rend", name: "Rendimentos", fullName: "Investimentos > Rendimentos" }],
    );

    expect(slices[0].name).toBe("Investimentos > Rendimentos");
  });
});
