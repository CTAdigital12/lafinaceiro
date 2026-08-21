/**
 * Helper puro para validar elegibilidade de uma `transactions` candidata a ser
 * vinculada (via `investment_transactions.linked_transaction_id`) a um
 * resgate de investimento.
 *
 * Extraído de `useInvestments.createTransaction` para deixar a regra de
 * propriedade/elegibilidade testável e explícita.
 *
 * IMPORTANTE: este é defesa em profundidade. RLS de `transactions` permite
 * SELECT cross-tenant via `shared_access`, então confiar apenas em RLS
 * deixaria a porta aberta para "sequestrar" uma receita do dono pelo UNIQUE
 * índice em `linked_transaction_id`.
 */

export interface LinkCandidate {
  id: string;
  user_id: string;
  /**
   * `string`, não a união, de propósito: o valor chega cru de um `select` da
   * tabela `transactions`, onde a coluna é `text`. Estreitar aqui obrigaria um
   * cast no chamador, que é exatamente o que esta validação existe para evitar
   * — a função compara com "income" e rejeita todo o resto.
   */
  type: string;
  account_id: string | null;
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: ValidationReason; message: string };

export type ValidationReason =
  | "missing"
  | "wrong_owner"
  | "wrong_type"
  | "wrong_account";

/**
 * Valida se uma `transactions` carregada é elegível para virar `linked_transaction_id`
 * de uma venda do investimento.
 *
 * @param candidate dados da transactions (subset). `null` = não encontrada.
 * @param expectedUserId user_id do usuário autenticado
 * @param expectedAccountId account_id que o usuário escolheu na UI
 */
export function validateLinkCandidate(
  candidate: LinkCandidate | null | undefined,
  expectedUserId: string,
  expectedAccountId: string,
): ValidationResult {
  if (!candidate) {
    return {
      ok: false,
      reason: "missing",
      message: "Receita não encontrada",
    };
  }

  if (candidate.user_id !== expectedUserId) {
    return {
      ok: false,
      reason: "wrong_owner",
      message: "Esta receita não pertence ao seu usuário",
    };
  }

  if (candidate.type !== "income") {
    return {
      ok: false,
      reason: "wrong_type",
      message: "A transação selecionada não é uma receita",
    };
  }

  if (candidate.account_id !== expectedAccountId) {
    return {
      ok: false,
      reason: "wrong_account",
      message: "A receita não pertence à conta selecionada",
    };
  }

  return { ok: true };
}
