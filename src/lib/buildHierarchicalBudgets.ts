import type { Budget } from "@/hooks/useBudgets";
import type { Category } from "@/hooks/useCategories";

export interface HierarchicalBudget extends Budget {
  children: HierarchicalBudget[];
  totalPlanned: number;
  totalSpent: number;
  isParent: boolean;
  unbudgetedSubcategorySpent: number;
  subcategoriesWithoutBudget: string[];
}

/**
 * Build a hierarchical budget tree from a flat budget list.
 *
 * Bug fix history (2026-05-03): when a child budget exists but its parent
 * category has no budget of its own, the child was being orphaned and never
 * rendered. Now we synthesize a virtual parent (planned_amount = 0) from the
 * `categories` lookup so the child is always visible in the UI.
 */
export function buildHierarchicalBudgets(
  budgets: Budget[],
  spentByCategory: Record<string, number>,
  categories: Category[],
): HierarchicalBudget[] {
  const parentBudgets: HierarchicalBudget[] = [];
  const childBudgetsMap: Record<string, HierarchicalBudget[]> = {};
  const budgetedCategoryIds = new Set(
    budgets.map((b) => b.category_id).filter(Boolean) as string[],
  );

  budgets.forEach((budget) => {
    const parentId = budget.categories?.parent_id;
    const spent = spentByCategory[budget.category_id || ""] || 0;

    const hierarchicalBudget: HierarchicalBudget = {
      ...budget,
      children: [],
      totalPlanned: Number(budget.planned_amount),
      totalSpent: spent,
      isParent: false,
      unbudgetedSubcategorySpent: 0,
      subcategoriesWithoutBudget: [],
    };

    if (parentId) {
      if (!childBudgetsMap[parentId]) {
        childBudgetsMap[parentId] = [];
      }
      childBudgetsMap[parentId].push(hierarchicalBudget);
    } else {
      hierarchicalBudget.isParent = true;
      parentBudgets.push(hierarchicalBudget);
    }
  });

  // Synthesize virtual parents for orphan child budgets so they don't
  // disappear from the UI when the parent category has no budget of its own.
  const existingParentCategoryIds = new Set(
    parentBudgets.map((p) => p.categories?.id).filter(Boolean) as string[],
  );

  Object.keys(childBudgetsMap).forEach((parentId) => {
    if (existingParentCategoryIds.has(parentId)) return;

    const parentCategory = categories.find((c) => c.id === parentId);
    if (!parentCategory) return;

    const firstChild = childBudgetsMap[parentId][0];
    const virtualParent: HierarchicalBudget = {
      id: `virtual-${parentId}`,
      user_id: firstChild.user_id,
      category_id: parentId,
      month: firstChild.month,
      year: firstChild.year,
      planned_amount: 0,
      created_at: firstChild.created_at,
      categories: {
        id: parentCategory.id,
        name: parentCategory.name,
        icon: parentCategory.icon ?? "",
        color: parentCategory.color ?? "",
        parent_id: null,
      },
      children: [],
      totalPlanned: 0,
      totalSpent: 0,
      isParent: true,
      unbudgetedSubcategorySpent: 0,
      subcategoriesWithoutBudget: [],
    };
    parentBudgets.push(virtualParent);
  });

  parentBudgets.forEach((parent) => {
    const categoryId = parent.categories?.id;
    if (!categoryId) return;

    const allSubcategories = categories.filter(
      (c) => c.parent_id === categoryId,
    );

    const subcatsWithoutBudget = allSubcategories.filter(
      (sub) =>
        !budgetedCategoryIds.has(sub.id) &&
        (spentByCategory[sub.id] || 0) > 0,
    );

    const unbudgetedSpent = subcatsWithoutBudget.reduce(
      (sum, sub) => sum + (spentByCategory[sub.id] || 0),
      0,
    );

    parent.unbudgetedSubcategorySpent = unbudgetedSpent;
    parent.subcategoriesWithoutBudget = subcatsWithoutBudget.map((s) => s.name);

    if (childBudgetsMap[categoryId]) {
      parent.children = [...childBudgetsMap[categoryId]].sort((a, b) =>
        (a.categories?.name || "").localeCompare(b.categories?.name || ""),
      );

      const childrenPlanned = parent.children.reduce(
        (sum, child) => sum + child.totalPlanned,
        0,
      );

      // Sum of children when present; otherwise parent's own planned amount.
      parent.totalPlanned =
        parent.children.length > 0
          ? childrenPlanned
          : Number(parent.planned_amount);
    }

    parent.totalSpent = spentByCategory[categoryId] || 0;
  });

  return parentBudgets.sort((a, b) =>
    (a.categories?.name || "").localeCompare(b.categories?.name || ""),
  );
}
