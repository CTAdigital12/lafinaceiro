/**
 * Quando um lançamento pode nascer "Concluída".
 *
 * A regra vivia espalhada: um `useEffect` no TransactionModal que olhava só o
 * campo OPCIONAL de vencimento manual, e um ternário inline na criação das
 * parcelas. A tela prometia "Se a data for futura, a transação será marcada
 * como pendente" — e nada implementava isso para o caminho normal, em que o
 * usuário deixa o vencimento em branco e escolhe apenas a data.
 *
 * O efeito era silencioso e tardio. A transação nascia "Concluída" e ficava
 * FORA do saldo enquanto a data era futura, porque `fetchRealizedNetByAccount`
 * corta em `date <= hoje`. No dia em que a data chegava, ela passava a pesar
 * sozinha — semanas depois, sem nada ter mudado na tela. Foi assim que uma
 * parcela de empréstimo nunca paga derrubou o saldo de uma conta em
 * R$ 1.500,00, e a causa levou horas para ser encontrada porque o lançamento
 * parecia correto olhando para ele.
 *
 * Comparação em `yyyy-MM-dd`, não `Date > Date`: a data do formulário é
 * meia-noite local e "agora" tem hora, então escolher HOJE parecia passado por
 * algumas horas do dia e futuro por nenhuma. A granularidade da regra é o dia.
 */

export type TransactionStatus = "completed" | "pending";

/** `true` quando a data cai depois de hoje. Ambos em `yyyy-MM-dd`. */
export function isFutureYmd(dateYmd: string, todayYmd: string): boolean {
  return dateYmd > todayYmd;
}

/**
 * Status efetivo de um lançamento avulso: futuro nunca nasce concluído.
 */
export function resolveStatus(
  chosen: TransactionStatus,
  dateYmd: string,
  todayYmd: string,
): TransactionStatus {
  return isFutureYmd(dateYmd, todayYmd) ? "pending" : chosen;
}

interface InstallmentStatusInput {
  /** É a parcela que o usuário está lançando (a primeira da série criada). */
  isFirst: boolean;
  /** Data desta parcela, `yyyy-MM-dd`. */
  dateYmd: string;
  /** Status escolhido no formulário. */
  chosen: TransactionStatus;
  todayYmd: string;
}

/**
 * Status de UMA parcela.
 *
 * Só a primeira herda o status escolhido — as seguintes são compromissos
 * futuros e nascem pendentes. E nem a primeira escapa da regra da data: dizer
 * que já foi paga uma parcela que ainda não venceu é o defeito que esta regra
 * fecha.
 */
export function installmentStatus({
  isFirst,
  dateYmd,
  chosen,
  todayYmd,
}: InstallmentStatusInput): TransactionStatus {
  if (!isFirst) return "pending";
  return resolveStatus(chosen, dateYmd, todayYmd);
}
