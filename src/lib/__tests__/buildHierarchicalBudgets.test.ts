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
});
