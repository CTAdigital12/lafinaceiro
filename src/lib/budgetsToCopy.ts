/**
 * Decide quais metas do mês anterior devem ser copiadas para o mês de destino.
 *
 * Bug (20/08/2026): `copyFromPreviousMonth` inseria o lote inteiro sem olhar o
 * destino. A tabela tem unique em (user_id, category_id, month, year), então
 * bastava UMA categoria já ter meta no mês para o Postgres rejeitar o INSERT
 * inteiro — "duplicate key value violates unique constraint
 * budgets_user_id_category_id_month_year_key". Resultado: nada era copiado e a
 * tela não mudava, dando a impressão de que a cópia tinha vindo vazia.
 *
 * Copiar só o que falta é também o comportamento esperado: quem já ajustou uma
 * meta no mês novo não quer que ela seja sobrescrita nem que a cópia falhe.
 */
export interface CopyableBudget {
  category_id: string | null;
  planned_amount: number;
}

export interface CopyPlan<T extends CopyableBudget> {
  /** Metas que serão inseridas no mês de destino. */
  toInsert: T[];
  /** Quantas foram puladas por já existirem no destino. */
  skipped: number;
}

export function planBudgetCopy<T extends CopyableBudget>(
  previousBudgets: T[],
  existingCategoryIds: Array<string | null>,
): CopyPlan<T> {
  const existing = new Set(existingCategoryIds.filter(Boolean) as string[]);

  // Conta única: o mês anterior pode ter DUAS metas na mesma categoria, uma de
  // cada login. As duas sairiam no nome de quem clicou, e a unique
  // (user_id, category_id, month, year) rejeitaria o lote inteiro. Copia a
  // primeira e conta a outra como pulada.
  const toInsert: T[] = [];
  for (const b of previousBudgets) {
    if (!b.category_id || existing.has(b.category_id)) continue;
    existing.add(b.category_id);
    toInsert.push(b);
  }

  return { toInsert, skipped: previousBudgets.length - toInsert.length };
}
