/**
 * Datas do banco são `date` puro, serializado como "YYYY-MM-DD" — sem hora e
 * sem fuso. O JavaScript trata essa string como **meia-noite UTC**, mas
 * `getDate()`, `getMonth()` e `getFullYear()` leem em horário **local**. Em
 * qualquer fuso a oeste de Greenwich (Brasil inteiro) isso volta um dia:
 *
 *   new Date("2026-03-01").getMonth()   // 1 (fevereiro!) em UTC-3
 *   format(new Date("2026-03-05"), "dd/MM")  // "04/03"
 *
 * As funções abaixo existem para que ninguém precise lembrar disso. A regra é:
 * **nunca** passe uma string "YYYY-MM-DD" direto para `new Date()`.
 */

import { format } from "date-fns";

export interface YmdParts {
  year: number;
  month: number; // 1-12, como o usuário lê (NÃO o índice 0-11 do JS)
  day: number;
}

/**
 * Quebra "YYYY-MM-DD" (ou um ISO completo) nas partes, sem passar por Date.
 * Retorna `null` quando a string não tem o formato esperado, para o chamador
 * decidir o fallback em vez de receber um `NaN` silencioso.
 */
export function parseYmd(dateString: string | null | undefined): YmdParts | null {
  if (!dateString) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateString);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return { year, month, day };
}

/**
 * Converte "YYYY-MM-DD" num `Date` local ancorado ao MEIO-DIA.
 *
 * Meio-dia (e não meia-noite) porque assim a data sobrevive a qualquer fuso
 * entre UTC-11 e UTC+12 e ao horário de verão: mesmo deslocando 11 horas para
 * qualquer lado, continua no mesmo dia do calendário. É o que já era feito à
 * mão em vários pontos do app com `new Date(t.date + "T12:00:00")`.
 *
 * Use para exibir (`format`), ordenar e comparar com datas de date-picker.
 */
export function ymdToLocalDate(dateString: string | null | undefined): Date | null {
  const parts = parseYmd(dateString);
  if (!parts) return null;
  return new Date(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0);
}

/**
 * "YYYY-MM-DD" -> "DD/MM/YYYY". Devolve "-" para nulo/!inválido, que é o que
 * as tabelas do app já exibiam.
 */
export function formatDateBR(dateString: string | null | undefined): string {
  const parts = parseYmd(dateString);
  if (!parts) return "-";
  const dd = String(parts.day).padStart(2, "0");
  const mm = String(parts.month).padStart(2, "0");
  return `${dd}/${mm}/${parts.year}`;
}

/**
 * `format` do date-fns aplicado a uma data "YYYY-MM-DD", sem o desvio de fuso.
 *
 * Use quando o formato não for "dd/MM/yyyy" — "dd/MM", "dd MMM yyyy", com
 * locale etc. Para o formato padrão, `formatDateBR` resolve sem passar por
 * `Date`. Devolve "-" para nulo/inválido, como as tabelas do app já exibiam.
 */
export function formatYmd(
  dateString: string | null | undefined,
  pattern: string,
  options?: Parameters<typeof format>[2],
): string {
  const date = ymdToLocalDate(dateString);
  if (!date) return "-";
  return format(date, pattern, options);
}

/**
 * Ciclo de fatura (mês/ano) a que uma `due_date` pertence.
 *
 * Era aqui que doía mais: com `new Date(dueDate).getMonth()`, um cartão que
 * vence no dia 1 resolvia para o mês ANTERIOR, e a trava de fatura fechada
 * passava a olhar o ciclo errado.
 */
export function invoicePeriodFromDueDate(
  dueDate: string | null | undefined,
): { month: number; year: number } | null {
  const parts = parseYmd(dueDate);
  if (!parts) return null;
  return { month: parts.month, year: parts.year };
}

/**
 * Data de "hoje" como "YYYY-MM-DD" no fuso LOCAL.
 *
 * `new Date().toISOString().split("T")[0]` devolve o dia em UTC — no Brasil,
 * depois das 21h ele já virou o dia seguinte, e lançamentos de amanhã entravam
 * indevidamente no saldo realizado.
 */
export function todayYmd(): string {
  return dateToYmd(new Date());
}

/**
 * `Date` -> "YYYY-MM-DD" pelo calendário LOCAL.
 *
 * Use para levar uma data escolhida num date-picker até uma consulta ao banco:
 * comparar strings "YYYY-MM-DD" é cronológico e não passa por fuso, enquanto
 * `toISOString()` converteria para UTC e deslocaria o dia.
 */
export function dateToYmd(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Último dia do mês como "YYYY-MM-DD", no fuso local.
 * `month` é 1-12.
 *
 * Substitui `new Date(year, month, 0).toISOString().split("T")[0]`, que em
 * fusos a leste de Greenwich devolvia o penúltimo dia.
 */
export function endOfMonthYmd(year: number, month: number): string {
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

/** Primeiro dia do mês como "YYYY-MM-DD". `month` é 1-12. */
export function startOfMonthYmd(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}
