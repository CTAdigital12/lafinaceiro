/**
 * Agregações do relatório de Parcelamentos: quanto de parcela cai em cada mês
 * (histórico) e quanto ainda vai cair (previsão).
 *
 * Modelo: cada parcela é uma transação própria, com `installment_number` /
 * `total_installments`. O `installment_group_id` amarra as parcelas de uma
 * mesma compra.
 *
 * ATENÇÃO — parcela dividida (rateio por categoria): a RPC `split_transaction`
 * NÃO copia `installment_group_id` para as partes secundárias (só
 * `installment_number` / `total_installments`), justamente para não duplicar
 * linhas dentro do grupo. Por isso o filtro de "o que é parcelado" é
 * `total_installments`, nunca `installment_group_id` — senão as partes
 * secundárias sumiriam e o mês ficaria subestimado. A parte secundária é
 * reamarrada ao grupo pelo `split_parent_id` (ver `buildGroupKeyResolver`).
 *
 * Somar TODAS as linhas está correto: a soma das partes de uma divisão é
 * exatamente o valor original (contrato da RPC), então não há dupla contagem.
 * Já a CONTAGEM de parcelas precisa deduplicar por (grupo, nº da parcela).
 */

import { addMonths, format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { round2 } from "./splitTransaction";

/** Subconjunto de `Transaction` usado pelo relatório. */
export interface InstallmentRow {
  id: string;
  description: string;
  amount: number;
  date: string;
  due_date: string | null;
  status: string;
  is_refund: boolean;
  is_card_payment: boolean | null;
  is_corporate_expense: boolean;
  is_reimbursable: boolean;
  installment_group_id: string | null;
  installment_number: number | null;
  total_installments: number | null;
  split_group_id: string | null;
  split_parent_id: string | null;
  credit_card_id: string | null;
  credit_cards?: { id: string; name: string; color: string | null } | null;
  categories?: { name: string; icon: string | null } | null;
}

export interface InstallmentMonthPoint {
  /** yyyy-MM */
  month: string;
  /** "jul/26" */
  label: string;
  /** Valor do mês quando ele já chegou (mês atual conta como realizado). */
  realizado: number;
  /** Valor do mês quando ele ainda está por vir. */
  previsto: number;
  total: number;
  /** Nº de parcelas distintas no mês (partes de um rateio contam como uma). */
  count: number;
  isFuture: boolean;
}

export interface InstallmentGroupSummary {
  key: string;
  /** Descrição sem o sufixo "3/10". */
  description: string;
  /** Nome do cartão, ou null quando o parcelamento é em conta/boleto. */
  cardName: string | null;
  cardColor: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  totalInstallments: number;
  /** Nº da última parcela já vencida (0 quando nenhuma venceu). */
  paidCount: number;
  remainingCount: number;
  /** Valor da próxima parcela a vencer (ou da última, se já acabou). */
  installmentAmount: number;
  /** Soma de todas as parcelas conhecidas do grupo. */
  totalAmount: number;
  /** Soma das parcelas que ainda vão vencer (mês > mês atual). */
  remainingAmount: number;
  /** yyyy-MM da próxima parcela a vencer, ou null se já terminou. */
  nextMonth: string | null;
  /** yyyy-MM da última parcela conhecida. */
  lastMonth: string;
  isActive: boolean;
}

/** yyyy-MM do mês de referência (data de vencimento no cartão, data na conta). */
export function installmentCompetenceMonth(row: InstallmentRow): string {
  const date = row.credit_card_id && row.due_date ? row.due_date : row.date;
  return date.substring(0, 7);
}

/** Estorno de parcela entra negativo, abatendo o mês. */
export function signedAmount(row: InstallmentRow): number {
  const amount = Number(row.amount) || 0;
  return row.is_refund ? -amount : amount;
}

/** Só despesa parcelada de verdade — pagamento de fatura e "à vista" ficam fora. */
export function isInstallmentRow(row: InstallmentRow): boolean {
  return !row.is_card_payment && (row.total_installments ?? 0) > 1;
}

/**
 * Devolve a função que diz a que compra (grupo) cada linha pertence.
 *
 * A parte primária de um rateio guarda o `installment_group_id`; as secundárias
 * só têm `split_parent_id` apontando para ela. Sem esse pulo, cada parte
 * secundária viraria um "parcelamento" solto na lista.
 */
export function buildGroupKeyResolver(
  rows: InstallmentRow[]
): (row: InstallmentRow) => string {
  const groupByRowId = new Map<string, string>();
  for (const row of rows) {
    if (row.installment_group_id) groupByRowId.set(row.id, row.installment_group_id);
  }

  return (row) => {
    if (row.installment_group_id) return row.installment_group_id;
    const fromParent = row.split_parent_id
      ? groupByRowId.get(row.split_parent_id)
      : undefined;
    // Sem grupo e sem primária no conjunto: trata como um parcelamento próprio.
    return fromParent ?? `avulso:${row.id}`;
  };
}

function monthLabel(month: string): string {
  return format(parse(month, "yyyy-MM", new Date()), "MMM/yy", { locale: ptBR });
}

/**
 * Série mês a mês: `monthsBack` meses de histórico (recortados no primeiro mês
 * com dado) até a última parcela conhecida. Meses sem parcela entram zerados,
 * para o gráfico não "pular" períodos.
 */
export function buildMonthlyInstallments(
  rows: InstallmentRow[],
  { currentMonth, monthsBack }: { currentMonth: string; monthsBack: number }
): InstallmentMonthPoint[] {
  const relevant = rows.filter(isInstallmentRow);
  if (relevant.length === 0) return [];

  const resolveGroup = buildGroupKeyResolver(relevant);
  const byMonth = new Map<string, { total: number; parcels: Set<string> }>();

  for (const row of relevant) {
    const month = installmentCompetenceMonth(row);
    const bucket = byMonth.get(month) ?? { total: 0, parcels: new Set<string>() };
    bucket.total = round2(bucket.total + signedAmount(row));
    bucket.parcels.add(`${resolveGroup(row)}#${row.installment_number ?? "?"}`);
    byMonth.set(month, bucket);
  }

  const months = Array.from(byMonth.keys()).sort();
  const earliest = months[0];
  const latest = months[months.length - 1];

  const windowStart = format(
    addMonths(parse(currentMonth, "yyyy-MM", new Date()), -monthsBack),
    "yyyy-MM"
  );
  const startMonth = earliest > windowStart ? earliest : windowStart;
  const endMonth = latest > currentMonth ? latest : currentMonth;

  const points: InstallmentMonthPoint[] = [];
  let cursor = parse(startMonth, "yyyy-MM", new Date());
  const end = parse(endMonth, "yyyy-MM", new Date());

  while (cursor <= end) {
    const month = format(cursor, "yyyy-MM");
    const bucket = byMonth.get(month);
    const total = round2(bucket?.total ?? 0);
    const isFuture = month > currentMonth;

    points.push({
      month,
      label: format(cursor, "MMM/yy", { locale: ptBR }),
      // O mês atual já é compromisso fechado, então conta como realizado.
      realizado: isFuture ? 0 : total,
      previsto: isFuture ? total : 0,
      total,
      count: bucket?.parcels.size ?? 0,
      isFuture,
    });

    cursor = addMonths(cursor, 1);
  }

  return points;
}

/** Tira o "3/10" da descrição, usando o total do próprio grupo. */
export function stripInstallmentSuffix(description: string, total: number): string {
  return description.replace(new RegExp(`\\s*\\d+\\s*/\\s*${total}\\b`), "").trim();
}

/** Uma linha por compra parcelada, com progresso e quanto ainda falta. */
export function buildInstallmentGroups(
  rows: InstallmentRow[],
  { currentMonth }: { currentMonth: string }
): InstallmentGroupSummary[] {
  const relevant = rows.filter(isInstallmentRow);
  if (relevant.length === 0) return [];

  const resolveGroup = buildGroupKeyResolver(relevant);
  const grouped = new Map<string, InstallmentRow[]>();

  for (const row of relevant) {
    const key = resolveGroup(row);
    const list = grouped.get(key);
    if (list) list.push(row);
    else grouped.set(key, [row]);
  }

  const summaries: InstallmentGroupSummary[] = [];

  for (const [key, groupRows] of grouped) {
    // Uma entrada por nº de parcela: as partes de um rateio somam entre si.
    const parcels = new Map<string, { number: number | null; month: string; amount: number }>();
    for (const row of groupRows) {
      const month = installmentCompetenceMonth(row);
      const parcelKey = row.installment_number != null ? `n${row.installment_number}` : `m${month}`;
      const parcel = parcels.get(parcelKey) ?? {
        number: row.installment_number,
        month,
        amount: 0,
      };
      parcel.amount = round2(parcel.amount + signedAmount(row));
      // Mês da parcela: o menor entre as partes (elas nascem com a mesma data).
      if (month < parcel.month) parcel.month = month;
      parcels.set(parcelKey, parcel);
    }

    const list = Array.from(parcels.values()).sort((a, b) => a.month.localeCompare(b.month));
    const future = list.filter((p) => p.month > currentMonth);
    const past = list.filter((p) => p.month <= currentMonth);

    // Preferimos a linha primária (a que carrega o grupo) para nome/cartão.
    const primary = groupRows.find((r) => r.installment_group_id) ?? groupRows[0];
    const totalInstallments = groupRows.reduce(
      (max, r) => Math.max(max, r.total_installments ?? 0),
      0
    );

    // Fatura importada pode não ter as parcelas antigas cadastradas: o nº da
    // parcela é mais fiel que a contagem de linhas para dizer quantas venceram.
    const highestPastNumber = past.reduce(
      (max, p) => (p.number != null && p.number > max ? p.number : max),
      0
    );
    const paidCount = highestPastNumber || past.length;

    const nextParcel = future[0];
    const lastParcel = list[list.length - 1];

    summaries.push({
      key,
      description: stripInstallmentSuffix(primary.description, totalInstallments),
      cardName: primary.credit_cards?.name ?? null,
      cardColor: primary.credit_cards?.color ?? null,
      categoryName: primary.categories?.name ?? null,
      categoryIcon: primary.categories?.icon ?? null,
      totalInstallments,
      paidCount,
      remainingCount: future.length,
      installmentAmount: nextParcel?.amount ?? lastParcel?.amount ?? 0,
      totalAmount: round2(list.reduce((sum, p) => sum + p.amount, 0)),
      remainingAmount: round2(future.reduce((sum, p) => sum + p.amount, 0)),
      nextMonth: nextParcel?.month ?? null,
      lastMonth: lastParcel?.month ?? currentMonth,
      isActive: future.length > 0,
    });
  }

  return summaries.sort((a, b) => b.remainingAmount - a.remainingAmount);
}

export interface InstallmentsOverview {
  currentMonthAmount: number;
  currentMonthCount: number;
  /** Tudo que ainda vai cair, do mês atual (inclusive) em diante. */
  openAmount: number;
  /** Média dos próximos meses (exclui o atual), para calibrar o compromisso. */
  nextMonthsAverage: number;
  nextMonthsWindow: number;
  activeGroups: number;
  /** Meses até a última parcela conhecida (0 = sem parcela futura). */
  monthsUntilFree: number;
  /** Maior mês da janela, para destacar o pico. */
  peak: InstallmentMonthPoint | null;
}

export function buildInstallmentsOverview(
  points: InstallmentMonthPoint[],
  groups: InstallmentGroupSummary[],
  { currentMonth, averageWindow = 6 }: { currentMonth: string; averageWindow?: number }
): InstallmentsOverview {
  const current = points.find((p) => p.month === currentMonth);
  const open = points.filter((p) => p.month >= currentMonth);
  const future = points.filter((p) => p.isFuture);
  const windowPoints = future.slice(0, averageWindow);

  const peak = open.reduce<InstallmentMonthPoint | null>(
    (best, p) => (best === null || p.total > best.total ? p : best),
    null
  );

  return {
    currentMonthAmount: current?.total ?? 0,
    currentMonthCount: current?.count ?? 0,
    openAmount: round2(open.reduce((sum, p) => sum + p.total, 0)),
    nextMonthsAverage: windowPoints.length
      ? round2(windowPoints.reduce((sum, p) => sum + p.total, 0) / windowPoints.length)
      : 0,
    nextMonthsWindow: windowPoints.length,
    activeGroups: groups.filter((g) => g.isActive).length,
    monthsUntilFree: future.length,
    peak,
  };
}

export { monthLabel };
