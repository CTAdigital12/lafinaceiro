import type { Budget } from "@/hooks/useBudgets";
import type { Category } from "@/hooks/useCategories";

export interface HierarchicalBudget extends Budget {
  children: HierarchicalBudget[];
  totalPlanned: number;
  totalSpent: number;
  isParent: boolean;
  /** Linha sintética: a categoria tem gasto no mês mas nenhuma meta cadastrada. */
  isUnbudgeted: boolean;
  /**
   * Subcategoria sem meta própria cujo gasto já é medido contra a meta do pai.
   * Distingue "não tem meta própria" (ok) de "gasto fora do orçamento" (alerta).
   */
  isCoveredByParentBudget: boolean;
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
 *
 * Bug fix history (2026-08-18): a categoria com gasto no mês e sem meta nenhuma
 * não gerava linha, porque a árvore saía de `budgets` e não das transações. O
 * valor continuava somando no card "Total Gasto" e o usuário via a diferença sem
 * conseguir localizar de onde vinha — R$ 10.800,09 em 104 lançamentos ao longo de
 * jan–ago/2026. Agora toda categoria com gasto vira linha (`isUnbudgeted`), com
 * meta zerada, para o total das linhas sempre fechar com o card.
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

  // Linhas sintéticas herdam período/dono de uma meta real quando existe alguma;
  // nenhum campo do banco é usado para escrita, só para preencher o tipo Budget.
  const seed = budgets[0];
  const synthesize = (category: Category): HierarchicalBudget => ({
    id: `unbudgeted-${category.id}`,
    user_id: seed?.user_id ?? "",
    category_id: category.id,
    month: seed?.month ?? 0,
    year: seed?.year ?? 0,
    planned_amount: 0,
    created_at: seed?.created_at ?? "",
    categories: {
      id: category.id,
      name: category.name,
      icon: category.icon ?? "",
      color: category.color ?? "",
      parent_id: category.parent_id,
    },
    children: [],
    totalPlanned: 0,
    totalSpent: spentByCategory[category.id] || 0,
    isParent: !category.parent_id,
    isUnbudgeted: true,
    isCoveredByParentBudget: false,
    unbudgetedSubcategorySpent: 0,
    subcategoriesWithoutBudget: [],
  });

  budgets.forEach((budget) => {
    const parentId = budget.categories?.parent_id;
    const spent = spentByCategory[budget.category_id || ""] || 0;

    const hierarchicalBudget: HierarchicalBudget = {
      ...budget,
      children: [],
      totalPlanned: Number(budget.planned_amount),
      totalSpent: spent,
      isParent: false,
      isUnbudgeted: false,
      isCoveredByParentBudget: false,
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
      ...synthesize(parentCategory),
      user_id: firstChild.user_id,
      month: firstChild.month,
      year: firstChild.year,
      created_at: firstChild.created_at,
      id: `virtual-${parentId}`,
      // A meta do pai virtual é a soma dos filhos orçados, não "sem meta".
      isUnbudgeted: false,
      totalSpent: 0,
    };
    parentBudgets.push(virtualParent);
    existingParentCategoryIds.add(parentId);
  });

  // Categoria de topo com gasto no mês e sem meta em lugar nenhum do ramo:
  // ganha linha própria para o gasto não sumir da tabela.
  categories.forEach((category) => {
    if (category.parent_id) return;
    if (existingParentCategoryIds.has(category.id)) return;
    if ((spentByCategory[category.id] || 0) === 0) return;

    parentBudgets.push(synthesize(category));
    existingParentCategoryIds.add(category.id);
  });

  // Subcategoria com gasto e sem meta: vira linha-filha sob o pai já renderizado,
  // em vez de aparecer só como texto agregado na linha do pai.
  parentBudgets.forEach((parent) => {
    const parentCategoryId = parent.categories?.id;
    if (!parentCategoryId) return;

    categories.forEach((category) => {
      if (category.parent_id !== parentCategoryId) return;
      if (budgetedCategoryIds.has(category.id)) return;
      if ((spentByCategory[category.id] || 0) === 0) return;

      if (!childBudgetsMap[parentCategoryId]) {
        childBudgetsMap[parentCategoryId] = [];
      }
      childBudgetsMap[parentCategoryId].push(synthesize(category));
    });
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

      // Só os filhos com meta real definem a meta do pai; as linhas sintéticas
      // têm planned_amount 0 e zerariam a meta de um pai que tem meta própria.
      const budgetedChildren = parent.children.filter((c) => !c.isUnbudgeted);
      const childrenPlanned = budgetedChildren.reduce(
        (sum, child) => sum + child.totalPlanned,
        0,
      );

      // Sum of children when present; otherwise parent's own planned amount.
      parent.totalPlanned =
        budgetedChildren.length > 0
          ? childrenPlanned
          : Number(parent.planned_amount);

      // Filho sem meta própria sob um pai que TEM meta não está fora do
      // orçamento: o gasto dele já entra na barra de progresso do pai.
      parent.children.forEach((child) => {
        if (child.isUnbudgeted) {
          child.isCoveredByParentBudget = parent.totalPlanned > 0;
        }
      });
    }

    parent.totalSpent = spentByCategory[categoryId] || 0;
  });

  return parentBudgets.sort((a, b) =>
    (a.categories?.name || "").localeCompare(b.categories?.name || ""),
  );
}
