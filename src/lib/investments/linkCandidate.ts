/**
 * Helper puro para validar elegibilidade de uma `transactions` candidata a ser
 * vinculada (via `investment_transactions.linked_transaction_id`) a uma
 * operação de investimento: RECEITA para resgate, DESPESA para aplicação (o
 * débito que já veio do extrato, como a parcela mensal do título de
 * capitalização).
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
  /** Pagamento de fatura nunca é aplicação, mesmo saindo da mesma conta. */
  is_card_payment?: boolean | null;
}

/** O tipo de lançamento que cada operação aceita como vínculo. */
export type LinkKind = "income" | "expense";

const NOUN: Record<LinkKind, { the: string; a: string }> = {
  income: { the: "Receita", a: "uma receita" },
  expense: { the: "Despesa", a: "uma despesa" },
};

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
 * de uma operação do investimento.
 *
 * @param candidate dados da transactions (subset). `null` = não encontrada.
 * @param expectedUserId user_id do usuário autenticado
 * @param expectedAccountId account_id que o usuário escolheu na UI
 * @param kind "income" para resgate (padrão), "expense" para aplicação
 */
export function validateLinkCandidate(
  candidate: LinkCandidate | null | undefined,
  expectedUserId: string,
  expectedAccountId: string,
  kind: LinkKind = "income",
): ValidationResult {
  const noun = NOUN[kind];

  if (!candidate) {
    return {
      ok: false,
      reason: "missing",
      message: `${noun.the} não encontrada`,
    };
  }

  if (candidate.user_id !== expectedUserId) {
    return {
      ok: false,
      reason: "wrong_owner",
      message: `Esta ${noun.the.toLowerCase()} não pertence ao seu usuário`,
    };
  }

  if (candidate.type !== kind || (kind === "expense" && candidate.is_card_payment)) {
    return {
      ok: false,
      reason: "wrong_type",
      message: `A transação selecionada não é ${noun.a}`,
    };
  }

  if (candidate.account_id !== expectedAccountId) {
    return {
      ok: false,
      reason: "wrong_account",
      message: `A ${noun.the.toLowerCase()} não pertence à conta selecionada`,
    };
  }

  return { ok: true };
}
