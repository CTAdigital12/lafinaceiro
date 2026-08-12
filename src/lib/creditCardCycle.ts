/**
 * Regra de ciclo de fatura do cartão: em qual vencimento uma compra cai.
 *
 * A regra vivia inline dentro de `TransactionModal.calculateDueDate` e valia
 * só para compra avulsa. O parcelamento usava "data da compra + N meses" e
 * ignorava fechamento e vencimento do cartão — então a mesma compra, no mesmo
 * dia, caía em faturas diferentes conforme fosse parcelada ou não.
 *
 * Aqui ela é única, pura e testável.
 */

export type CardCycle = {
  /** Dia do mês em que a fatura fecha (1–31). */
  closing_date: number;
  /** Dia do mês em que a fatura vence (1–31). */
  due_date: number;
};

/**
 * Prende o dia ao último dia do mês, para o vencimento não transbordar.
 *
 * `new Date(2026, 1, 31)` — 31 de fevereiro — devolve 3 de março: o JS
 * normaliza o excedente em vez de recusar. Um cartão que vence dia 31 jogava
 * a fatura de fevereiro para março, e a de abril para maio.
 */
function clampDayToMonth(year: number, monthIndex: number, day: number): number {
  // Dia 0 do mês seguinte = último dia deste mês.
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return Math.min(day, lastDay);
}

/** Normaliza um índice de mês que estourou (12 -> janeiro do ano seguinte). */
function normalizeMonth(year: number, monthIndex: number) {
  return {
    year: year + Math.floor(monthIndex / 12),
    month: ((monthIndex % 12) + 12) % 12,
  };
}

/**
 * Vencimento da fatura em que a compra cai.
 *
 * `monthsAhead` desloca N faturas para a frente — é assim que as parcelas são
 * calculadas: parcela 1 é `monthsAhead: 0`, parcela 2 é `1`, e assim por
 * diante. Cada parcela é calculada a partir do mês-alvo, nunca encadeando a
 * partir do vencimento anterior: encadear propagaria o clamp (um vencimento
 * dia 31 preso em 28 de fevereiro arrastaria 28 para todos os meses seguintes).
 *
 * Nota: para cartões em que o dia de vencimento é MENOR que o de fechamento
 * (fecha dia 25, vence dia 5 do mês seguinte), esta função devolve o
 * vencimento no mesmo mês do fechamento — possivelmente anterior à própria
 * compra. É o comportamento que já existia; está sinalizado no relatório de
 * auditoria como decisão pendente, e mudá-lo altera lançamentos já gravados.
 */
export function calculateCardDueDate(
  purchaseDate: Date,
  card: CardCycle,
  monthsAhead = 0,
): Date {
  // Compra depois do fechamento entra na fatura seguinte.
  const closedThisMonth = purchaseDate.getDate() > card.closing_date;

  const { year, month } = normalizeMonth(
    purchaseDate.getFullYear(),
    purchaseDate.getMonth() + (closedThisMonth ? 1 : 0) + monthsAhead,
  );

  return new Date(year, month, clampDayToMonth(year, month, card.due_date));
}
