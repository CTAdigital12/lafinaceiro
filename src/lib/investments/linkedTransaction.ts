/**
 * Quem é dono do lançamento da conta vinculado a uma operação de investimento.
 *
 * Uma operação pode CRIAR o lançamento (aplicação "Investimento: TICKER",
 * resgate "Resgate: TICKER") ou VINCULAR um que já existia — a receita do
 * resgate lançada à mão, ou o débito da aplicação que veio do extrato (a
 * parcela do título de capitalização). Ao editar ou excluir a operação, só o
 * que ela criou pode ser apagado: apagar o vinculado some com um débito real
 * da conta e o saldo passa a mentir.
 *
 * Antes, toda aplicação era tratada como criada pelo app e o vínculo era
 * apagado sem olhar. Era inofensivo enquanto a aplicação não sabia vincular;
 * deixou de ser no momento em que passou a saber.
 *
 * O critério é o prefixo da descrição, o mesmo que o resgate já usava. Um
 * lançamento que o usuário tenha descrito com o mesmo prefixo seria tratado
 * como do app — aceito: o prefixo é o texto que o próprio app grava.
 */
export const AUTO_CREATED_PREFIX = {
  buy: "Investimento:",
  sell: "Resgate:",
} as const;

export function isAutoCreatedLinkedTransaction(
  operationType: "buy" | "sell" | "dividend",
  description: string | null | undefined,
): boolean {
  if (operationType === "dividend") return false;
  return (description ?? "").startsWith(AUTO_CREATED_PREFIX[operationType]);
}
