import { describe, it, expect } from "vitest";
import { planBudgetCopy } from "@/lib/budgetsToCopy";

const b = (category_id: string | null, planned_amount = 100) => ({
  id: `b-${category_id}`,
  category_id,
  planned_amount,
});

describe("planBudgetCopy", () => {
  it("copia tudo quando o mês de destino está vazio", () => {
    const { toInsert, skipped } = planBudgetCopy([b("food"), b("pet")], []);

    expect(toInsert.map((x) => x.category_id)).toEqual(["food", "pet"]);
    expect(skipped).toBe(0);
  });

  // O bug: a unique (user_id, category_id, month, year) rejeitava o INSERT
  // inteiro quando UMA categoria já existia, e nada era copiado.
  it("pula só as categorias que já têm meta no destino", () => {
    const { toInsert, skipped } = planBudgetCopy(
      [b("food"), b("pet"), b("moradia")],
      ["pet"],
    );

    expect(toInsert.map((x) => x.category_id)).toEqual(["food", "moradia"]);
    expect(skipped).toBe(1);
  });

  it("não devolve nada quando todas já existem", () => {
    const { toInsert, skipped } = planBudgetCopy(
      [b("food"), b("pet")],
      ["food", "pet"],
    );

    expect(toInsert).toEqual([]);
    expect(skipped).toBe(2);
  });

  it("preserva o valor planejado da meta de origem", () => {
    const { toInsert } = planBudgetCopy([b("food", 350.5)], []);

    expect(toInsert[0].planned_amount).toBe(350.5);
  });

  it("ignora meta sem categoria (não dá para casar com o destino)", () => {
    const { toInsert, skipped } = planBudgetCopy([b(null), b("food")], []);

    expect(toInsert.map((x) => x.category_id)).toEqual(["food"]);
    expect(skipped).toBe(1);
  });

  it("ignora nulos vindos do mês de destino", () => {
    const { toInsert } = planBudgetCopy([b("food")], [null, null]);

    expect(toInsert.map((x) => x.category_id)).toEqual(["food"]);
  });

  it("não altera o array de entrada", () => {
    const entrada = [b("food"), b("pet")];
    planBudgetCopy(entrada, ["pet"]);

    expect(entrada).toHaveLength(2);
  });
});
