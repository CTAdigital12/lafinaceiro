import { describe, it, expect } from "vitest";
import { buildHierarchicalBudgets } from "@/lib/buildHierarchicalBudgets";
import type { Budget } from "@/hooks/useBudgets";
import type { Category } from "@/hooks/useCategories";

const cat = (overrides: Partial<Category>): Category => ({
  id: "cat-id",
  user_id: "user-1",
  name: "Cat",
  icon: "🏷️",
  color: "#000000",
  type: "expense",
  parent_id: null,
  created_at: "2026-05-01T00:00:00Z",
  ...overrides,
});

const budget = (overrides: Partial<Budget>): Budget => ({
  id: "budget-id",
  user_id: "user-1",
  category_id: "cat-id",
  month: 5,
  year: 2026,
  planned_amount: 100,
  created_at: "2026-05-01T00:00:00Z",
  categories: { id: "cat-id", name: "Cat", icon: "🏷️", color: "#000000", parent_id: null },
  ...overrides,
});

describe("buildHierarchicalBudgets", () => {
  it("returns standalone budget (no parent)", () => {
    const categories = [cat({ id: "food", name: "Alimentação" })];
    const budgets = [
      budget({
        id: "b1",
        category_id: "food",
        planned_amount: 500,
        categories: { id: "food", name: "Alimentação", icon: "🍔", color: "#f00", parent_id: null },
      }),
    ];

    const result = buildHierarchicalBudgets(budgets, {}, categories);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("b1");
    expect(result[0].isParent).toBe(true);
    expect(result[0].children).toEqual([]);
    expect(result[0].totalPlanned).toBe(500);
  });

  it("nests child budget under parent budget when both exist", () => {
    const categories = [
      cat({ id: "pet", name: "Pet" }),
      cat({ id: "phoibe", name: "Phoibe", parent_id: "pet" }),
    ];
    const budgets = [
      budget({
        id: "b-pet",
        category_id: "pet",
        planned_amount: 200,
        categories: { id: "pet", name: "Pet", icon: "🐾", color: "#0f0", parent_id: null },
      }),
      budget({
        id: "b-phoibe",
        category_id: "phoibe",
        planned_amount: 97,
        categories: { id: "phoibe", name: "Phoibe", icon: "🦴", color: "#0ff", parent_id: "pet" },
      }),
    ];

    const result = buildHierarchicalBudgets(budgets, {}, categories);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("b-pet");
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].id).toBe("b-phoibe");
    // sum of children overrides parent's own planned
    expect(result[0].totalPlanned).toBe(97);
  });

  // Bug 4 (regression): child budget whose parent has no budget was being
  // dropped from the UI because the parent never made it into parentBudgets,
  // so childBudgetsMap[parentId] was never consumed.
  it("renders orphan child budget under a synthesized virtual parent", () => {
    const categories = [
      cat({ id: "pet", name: "Pet", icon: "🐾", color: "#0f0" }),
      cat({ id: "phoibe", name: "Phoibe", parent_id: "pet" }),
    ];
    const budgets = [
      budget({
        id: "b-phoibe",
        category_id: "phoibe",
        planned_amount: 97,
        categories: { id: "phoibe", name: "Phoibe", icon: "🦴", color: "#0ff", parent_id: "pet" },
      }),
    ];

    const result = buildHierarchicalBudgets(budgets, {}, categories);

    expect(result).toHaveLength(1);
    const virtualParent = result[0];
    expect(virtualParent.id).toBe("virtual-pet");
    expect(virtualParent.isParent).toBe(true);
    expect(virtualParent.categories?.id).toBe("pet");
    expect(virtualParent.categories?.name).toBe("Pet");
    expect(virtualParent.categories?.icon).toBe("🐾");
    expect(virtualParent.children).toHaveLength(1);
    expect(virtualParent.children[0].id).toBe("b-phoibe");
    // Child's planned amount drives the virtual parent total.
    expect(virtualParent.totalPlanned).toBe(97);
  });

  it("does not synthesize a virtual parent when the parent category is unknown", () => {
    const categories = [cat({ id: "phoibe", name: "Phoibe", parent_id: "missing-parent" })];
    const budgets = [
      budget({
        id: "b-phoibe",
        category_id: "phoibe",
        planned_amount: 97,
        categories: {
          id: "phoibe",
          name: "Phoibe",
          icon: "🦴",
          color: "#0ff",
          parent_id: "missing-parent",
        },
      }),
    ];

    const result = buildHierarchicalBudgets(budgets, {}, categories);

    // Stale parent_id with no matching category — the orphan is silently
    // dropped (matches pre-existing behavior; alternative would be to treat
    // it as a top-level budget, but that risks merging unrelated categories).
    expect(result).toHaveLength(0);
  });

  it("aggregates totalSpent from spentByCategory at the parent level", () => {
    const categories = [
      cat({ id: "pet", name: "Pet" }),
      cat({ id: "phoibe", name: "Phoibe", parent_id: "pet" }),
    ];
    const budgets = [
      budget({
        id: "b-pet",
        category_id: "pet",
        planned_amount: 200,
        categories: { id: "pet", name: "Pet", icon: "🐾", color: "#0f0", parent_id: null },
      }),
    ];
    const spentByCategory = { pet: 150, phoibe: 50 };

    const result = buildHierarchicalBudgets(budgets, spentByCategory, categories);

    expect(result[0].totalSpent).toBe(150);
  });

  it("flags subcategories without budget but with spending", () => {
    const categories = [
      cat({ id: "pet", name: "Pet" }),
      cat({ id: "phoibe", name: "Phoibe", parent_id: "pet" }),
      cat({ id: "luna", name: "Luna", parent_id: "pet" }),
    ];
    const budgets = [
      budget({
        id: "b-pet",
        category_id: "pet",
        planned_amount: 200,
        categories: { id: "pet", name: "Pet", icon: "🐾", color: "#0f0", parent_id: null },
      }),
    ];
    const spentByCategory = { phoibe: 30, luna: 0 };

    const result = buildHierarchicalBudgets(budgets, spentByCategory, categories);

    expect(result[0].subcategoriesWithoutBudget).toEqual(["Phoibe"]);
    expect(result[0].unbudgetedSubcategorySpent).toBe(30);
  });

  it("sorts parent budgets and children alphabetically by category name", () => {
    const categories = [
      cat({ id: "z-cat", name: "Zebra" }),
      cat({ id: "a-cat", name: "Alfa" }),
    ];
    const budgets = [
      budget({
        id: "b1",
        category_id: "z-cat",
        categories: { id: "z-cat", name: "Zebra", icon: "🦓", color: "#000", parent_id: null },
      }),
      budget({
        id: "b2",
        category_id: "a-cat",
        categories: { id: "a-cat", name: "Alfa", icon: "🅰️", color: "#000", parent_id: null },
      }),
    ];

    const result = buildHierarchicalBudgets(budgets, {}, categories);

    expect(result.map((b) => b.categories?.name)).toEqual(["Alfa", "Zebra"]);
  });

  // Bug (2026-08-18): categoria com gasto e sem meta nenhuma no mês não gerava
  // linha, mas continuava somando no card "Total Gasto" — o usuário via a
  // diferença sem conseguir achar a origem.
  describe("categorias sem meta mas com gasto", () => {
    it("cria linha para categoria de topo com gasto e sem meta", () => {
      const categories = [
        cat({ id: "food", name: "Alimentação" }),
        cat({ id: "ipva", name: "IPVA", icon: "🚗", color: "#f00" }),
      ];
      const budgets = [
        budget({
          id: "b-food",
          category_id: "food",
          planned_amount: 500,
          categories: { id: "food", name: "Alimentação", icon: "🍔", color: "#f00", parent_id: null },
        }),
      ];

      const result = buildHierarchicalBudgets(budgets, { food: 400, ipva: 405.71 }, categories);

      expect(result).toHaveLength(2);
      const ipva = result.find((b) => b.categories?.id === "ipva")!;
      expect(ipva.id).toBe("unbudgeted-ipva");
      expect(ipva.isUnbudgeted).toBe(true);
      expect(ipva.isParent).toBe(true);
      expect(ipva.totalPlanned).toBe(0);
      expect(ipva.totalSpent).toBe(405.71);
      expect(ipva.categories?.icon).toBe("🚗");
    });

    it("cria linha-filha para subcategoria com gasto e sem meta", () => {
      const categories = [
        cat({ id: "pet", name: "Pet" }),
        cat({ id: "phoibe", name: "Phoibe", parent_id: "pet" }),
      ];
      const budgets = [
        budget({
          id: "b-pet",
          category_id: "pet",
          planned_amount: 200,
          categories: { id: "pet", name: "Pet", icon: "🐾", color: "#0f0", parent_id: null },
        }),
      ];

      const result = buildHierarchicalBudgets(budgets, { pet: 130, phoibe: 130 }, categories);

      expect(result).toHaveLength(1);
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].id).toBe("unbudgeted-phoibe");
      expect(result[0].children[0].isUnbudgeted).toBe(true);
    });

    // Regressão: filho sintético tem planned_amount 0 e não pode zerar a meta
    // própria do pai (a regra "soma dos filhos" só vale para filhos orçados).
    it("mantém a meta do pai quando o único filho é sintético", () => {
      const categories = [
        cat({ id: "pet", name: "Pet" }),
        cat({ id: "phoibe", name: "Phoibe", parent_id: "pet" }),
      ];
      const budgets = [
        budget({
          id: "b-pet",
          category_id: "pet",
          planned_amount: 200,
          categories: { id: "pet", name: "Pet", icon: "🐾", color: "#0f0", parent_id: null },
        }),
      ];

      const result = buildHierarchicalBudgets(budgets, { pet: 130, phoibe: 130 }, categories);

      expect(result[0].totalPlanned).toBe(200);
    });

    it("filho orçado continua definindo a meta do pai mesmo com irmão sintético", () => {
      const categories = [
        cat({ id: "pet", name: "Pet" }),
        cat({ id: "phoibe", name: "Phoibe", parent_id: "pet" }),
        cat({ id: "luna", name: "Luna", parent_id: "pet" }),
      ];
      const budgets = [
        budget({
          id: "b-pet",
          category_id: "pet",
          planned_amount: 200,
          categories: { id: "pet", name: "Pet", icon: "🐾", color: "#0f0", parent_id: null },
        }),
        budget({
          id: "b-luna",
          category_id: "luna",
          planned_amount: 97,
          categories: { id: "luna", name: "Luna", icon: "🐈", color: "#0ff", parent_id: "pet" },
        }),
      ];

      const result = buildHierarchicalBudgets(budgets, { pet: 130, phoibe: 130 }, categories);

      expect(result[0].children.map((c) => c.id)).toEqual(["b-luna", "unbudgeted-phoibe"]);
      expect(result[0].totalPlanned).toBe(97);
    });

    it("cria linha para gasto que ficou negativo (categoria só com estorno)", () => {
      const categories = [cat({ id: "juros", name: "Juros" })];

      const result = buildHierarchicalBudgets([], { juros: -3.47 }, categories);

      expect(result).toHaveLength(1);
      expect(result[0].totalSpent).toBe(-3.47);
    });

    it("não cria linha para categoria sem gasto e sem meta", () => {
      const categories = [
        cat({ id: "food", name: "Alimentação" }),
        cat({ id: "ipva", name: "IPVA" }),
      ];
      const budgets = [
        budget({
          id: "b-food",
          category_id: "food",
          categories: { id: "food", name: "Alimentação", icon: "🍔", color: "#f00", parent_id: null },
        }),
      ];

      const result = buildHierarchicalBudgets(budgets, { food: 400 }, categories);

      expect(result).toHaveLength(1);
      expect(result[0].categories?.id).toBe("food");
    });

    it("marca metas reais como isUnbudgeted false", () => {
      const categories = [cat({ id: "food", name: "Alimentação" })];
      const budgets = [
        budget({
          id: "b-food",
          category_id: "food",
          categories: { id: "food", name: "Alimentação", icon: "🍔", color: "#f00", parent_id: null },
        }),
      ];

      const result = buildHierarchicalBudgets(budgets, { food: 400 }, categories);

      expect(result[0].isUnbudgeted).toBe(false);
    });

    // A promessa do conserto: a soma das linhas de topo tem que fechar com o
    // total gasto do mês (descontado o que não tem categoria, que vai para a
    // seção própria). Era exatamente essa diferença que o usuário via.
    it("soma das linhas de topo fecha com o total gasto do mês", () => {
      const categories = [
        cat({ id: "food", name: "Alimentação" }),
        cat({ id: "pet", name: "Pet" }),
        cat({ id: "phoibe", name: "Phoibe", parent_id: "pet" }),
        cat({ id: "ipva", name: "IPVA" }),
        cat({ id: "estetica", name: "Estética", parent_id: "vest" }),
        cat({ id: "vest", name: "Vestuário/Estética" }),
      ];
      const budgets = [
        budget({
          id: "b-food",
          category_id: "food",
          planned_amount: 500,
          categories: { id: "food", name: "Alimentação", icon: "🍔", color: "#f00", parent_id: null },
        }),
        budget({
          id: "b-pet",
          category_id: "pet",
          planned_amount: 200,
          categories: { id: "pet", name: "Pet", icon: "🐾", color: "#0f0", parent_id: null },
        }),
      ];

      // Réplica do spentByCategory do Planning: o gasto do filho sobe para o pai.
      const lancamentos: Array<[string, number]> = [
        ["food", 400],
        ["phoibe", 130],
        ["ipva", 405.71],
        ["estetica", 94.9],
      ];
      const spentByCategory: Record<string, number> = {};
      let totalGasto = 0;
      for (const [catId, valor] of lancamentos) {
        totalGasto += valor;
        spentByCategory[catId] = (spentByCategory[catId] || 0) + valor;
        const parentId = categories.find((c) => c.id === catId)?.parent_id;
        if (parentId) spentByCategory[parentId] = (spentByCategory[parentId] || 0) + valor;
      }

      const result = buildHierarchicalBudgets(budgets, spentByCategory, categories);
      const somaDasLinhas = result.reduce((sum, row) => sum + row.totalSpent, 0);

      expect(somaDasLinhas).toBeCloseTo(totalGasto, 2);
      expect(result.map((r) => r.categories?.name).sort()).toEqual([
        "Alimentação",
        "IPVA",
        "Pet",
        "Vestuário/Estética",
      ]);
    });

    // Reportado em 18/08/2026: a linha "Estética" (sub sem meta) sob
    // "Vestuário/ Estética" (pai COM meta de R$ 100) dizia "Gasto fora do
    // orçamento", mas os R$ 94,90 já estavam na barra do pai — a linha do pai
    // mostrava "Restam R$ 5,10". Só é "fora do orçamento" quando nenhuma meta
    // do ramo mede aquele gasto.
    it("marca subcategoria sem meta como coberta quando o pai tem meta", () => {
      const categories = [
        cat({ id: "vest", name: "Vestuário/ Estética" }),
        cat({ id: "estetica", name: "Estética", parent_id: "vest" }),
      ];
      const budgets = [
        budget({
          id: "b-vest",
          category_id: "vest",
          planned_amount: 100,
          categories: { id: "vest", name: "Vestuário/ Estética", icon: "👕", color: "#f0f", parent_id: null },
        }),
      ];

      const result = buildHierarchicalBudgets(budgets, { vest: 94.9, estetica: 94.9 }, categories);

      const estetica = result[0].children[0];
      expect(estetica.isUnbudgeted).toBe(true);
      expect(estetica.isCoveredByParentBudget).toBe(true);
    });

    it("não marca como coberta quando nem o pai tem meta", () => {
      const categories = [
        cat({ id: "vest", name: "Vestuário/ Estética" }),
        cat({ id: "estetica", name: "Estética", parent_id: "vest" }),
      ];

      const result = buildHierarchicalBudgets([], { vest: 94.9, estetica: 94.9 }, categories);

      const estetica = result[0].children[0];
      expect(estetica.isUnbudgeted).toBe(true);
      expect(estetica.isCoveredByParentBudget).toBe(false);
    });
  });
});
