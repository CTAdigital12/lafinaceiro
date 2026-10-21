/**
 * Funções utilitárias para normalização e detecção de duplicatas em importações.
 */

import { collapseSplitGroups, type CollapsedRow, type SplitAwareRow } from "./splitTransaction";
import { stripInstallmentMarkers } from "./installmentDescription";

/**
 * Normaliza uma string para comparação resiliente:
 * - lowercase
 * - remove acentos/diacríticos
 * - colapsa múltiplos espaços em um único
 * - trim
 */
export function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normaliza uma data para string YYYY-MM-DD, ignorando horas/timezone.
 * Aceita strings no formato YYYY-MM-DD ou objetos Date-like.
 */
export function normalizeDate(date: string | Date | null | undefined): string {
  if (!date) return "";
  if (typeof date === "string") {
    // Already YYYY-MM-DD? Return first 10 chars
    if (/^\d{4}-\d{2}-\d{2}/.test(date)) {
      return date.substring(0, 10);
    }
    return date;
  }
  // Date object: extract YYYY-MM-DD without timezone issues
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * "MM-DD" da data, ou "" quando não há data utilizável.
 *
 * O ano fica de fora de propósito no caminho das parcelas: ele NÃO vem do
 * arquivo, é inferido pelo parser (mês da compra > mês da fatura -> ano-1,
 * senão ano da fatura, em csvInvoiceParser.parseDate e no inferPurchaseYear da
 * edge function). A inferência erra por um ano na última parcela de todo plano
 * de 12+ meses — compra de out/2025 em 12x tem a parcela 12/12 na fatura de
 * out/2026, mês igual, ano inferido 2026, enquanto a linha gravada tem 2025.
 * Comparar a data cheia transformaria essa parcela em falso "novo" (duplicata
 * gravada em silêncio); o mês-dia é estável nas 12.
 */
function monthDay(date: string | Date | null | undefined): string {
  const ymd = normalizeDate(date);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd.slice(5) : "";
}

/** Descrição sem marcador de parcela, normalizada para comparação. */
function baseDescription(text: string | null | undefined): string {
  return normalizeString(stripInstallmentMarkers(text || ""));
}

export interface ExistingTransaction {
  id: string;
  description: string;
  original_description: string | null;
  amount: number;
  date: string;
  /** Estorno já gravado. Só casa com linha de crédito da fatura. */
  is_refund?: boolean | null;
  installment_number: number | null;
  total_installments: number | null;
  /** Divisão por categoria: as partes são colapsadas antes da comparação. */
  split_group_id?: string | null;
  split_parent_id?: string | null;
}

export interface ImportedItem {
  transaction_value: number;
  /** Linha de crédito da fatura (valor negativo no arquivo). */
  is_credit?: boolean;
  installment_current?: number | null;
  installment_total?: number | null;
  purchase_date?: string;
  description?: string;
}

/**
 * Detecta duplicatas comparando itens importados com transações existentes.
 * 
 * Regras:
 * 1. Data: comparação de strings YYYY-MM-DD
 * 2. Valor: tolerância Math.abs(a - b) <= 0.05
 * 3. String: compara importado normalizado com original_description (fallback description)
 * 4. Parcela: se importado tem installment_current, exige match de
 *    installment_number + total_installments e, quando o lado existente veio de
 *    importação (tem original_description), também da descrição-base.
 * 5. Divisão: as partes de uma transação dividida contam como UMA linha, com o
 *    valor somado — é assim que o gasto aparece na fatura importada. A linha
 *    devolvida é a COLAPSADA: `id` é o da primária e `splitMemberIds` traz
 *    todas. Quem age sobre a duplicata (ex.: confirmar a parcela prevista) usa
 *    `splitMemberIds` — agir só pelo `id` deixava a irmã pendente, fora da
 *    fatura.
 * 6. Sinal: crédito só casa com estorno e compra só casa com compra. Sem isso,
 *    um estorno de R$ 0,16 seria dado como duplicata da compra de R$ 0,16 no
 *    mesmo dia (a tolerância de valor compara módulos) e nunca seria importado.
 * 7. Empate: entre candidatos igualmente válidos, ganha o de mesmo mês-dia.
 */
export function detectDuplicates(
  importedItems: ImportedItem[],
  existingTransactions: ExistingTransaction[]
): Map<number, CollapsedRow<ExistingTransaction>> {
  const duplicateMap = new Map<number, CollapsedRow<ExistingTransaction>>();
  const usedExistingIds = new Set<string>();
  const TOLERANCE = 0.05;

  const collapsed = collapseSplitGroups(existingTransactions);

  importedItems.forEach((item, index) => {
    const isInstallment = !!(item.installment_current && item.installment_total);

    // `filter` e não `find`: com mais de um candidato válido é preciso escolher
    // o certo (regra 7), e o primeiro da lista não é necessariamente ele.
    const candidates = collapsed.filter((existing) => {
      if (usedExistingIds.has(existing.id)) return false;

      // Rule 6: Sinal (crédito x compra)
      if (!!existing.is_refund !== !!item.is_credit) return false;

      // Rule 2: Amount tolerance
      const amountMatch = Math.abs(Number(existing.amount) - item.transaction_value) <= TOLERANCE;
      if (!amountMatch) return false;

      if (isInstallment) {
        // Rule 4: Installment match
        if (existing.installment_number !== item.installment_current) return false;
        if (existing.total_installments !== item.installment_total) return false;

        // Valor + índice de parcela NÃO identificam uma compra. Duas compras de
        // R$ 89,90 em 12x na mesma fatura casavam cruzado: a linha de B consumia
        // a transação de A, B saía como "duplicata" (some) e a linha de A, sem
        // par, entrava como nova (duplica A). Mesma soma, duas linhas erradas.
        //
        // A descrição só entra como rejeição quando o lado existente TEM
        // original_description: aí os dois lados vieram do parser e a comparação
        // é entre iguais. Parcela criada à mão tem descrição digitada pelo
        // usuário ("Netflix") e nunca bateria com a da fatura
        // ("NETFLIX.COM*ASSINATURA") — exigir descrição ali trocaria este bug
        // por duplicata garantida em todo parcelamento manual.
        if (!existing.original_description) return true;
        return baseDescription(existing.original_description) === baseDescription(item.description);
      } else {
        // Rule 1: Date match (normalized)
        const dateMatch = normalizeDate(existing.date) === normalizeDate(item.purchase_date);
        if (!dateMatch) return false;

        // Rule 3: String match (original_description fallback to description)
        const existingStr = normalizeString(existing.original_description || existing.description);
        const importedStr = normalizeString(item.description || "");
        return existingStr === importedStr;
      }
    });

    // Rule 7: duas compras iguais na MESMA loja (mesmo valor, mesmo índice de
    // parcela) só se distinguem pela data da compra. Sem candidato de mesmo
    // mês-dia, fica o primeiro — o comportamento de antes.
    const target = isInstallment && candidates.length > 1 ? monthDay(item.purchase_date) : "";
    const match = target
      ? candidates.find((c) => monthDay(c.date) === target) ?? candidates[0]
      : candidates[0];

    if (match) {
      duplicateMap.set(index, match);
      // Consome TODAS as partes do grupo: nenhuma delas pode casar de novo.
      match.splitMemberIds.forEach((id) => usedExistingIds.add(id));
    }
  });

  return duplicateMap;
}

interface ExistingAccountTransaction {
  id?: string;
  date: string;
  description: string;
  original_description: string | null;
  amount: number;
  split_group_id?: string | null;
  split_parent_id?: string | null;
}

/**
 * Detecta duplicatas para importação de extratos bancários (contas).
 * Similar a detectDuplicates mas com interface adaptada para AccountImportedItem.
 *
 * Assim como na fatura, as partes de uma transação dividida contam como UMA
 * linha com o valor somado — o extrato traz o PIX cheio (R$ 1.611,00) e o
 * sistema tem R$ 110,92 + R$ 1.500,08.
 */
export function detectAccountDuplicates(
  importedItems: Array<{ date: string; description: string; amount: number }>,
  existingTransactions: ExistingAccountTransaction[],
): Set<number> {
  return new Set(findAccountDuplicates(importedItems, existingTransactions).keys());
}

/**
 * Mesma regra de `detectAccountDuplicates`, devolvendo também a linha casada.
 * Quem precisa saber QUAIS lançamentos o extrato já consumiu (para não
 * casá-los de novo em `matchManualEntries`) usa esta.
 */
export function findAccountDuplicates<T extends ExistingAccountTransaction>(
  importedItems: Array<{ date: string; description: string; amount: number }>,
  existingTransactions: T[],
): Map<number, CollapsedRow<T & { id: string }>> {
  const duplicates = new Map<number, CollapsedRow<T & { id: string }>>();
  const usedExistingIds = new Set<string>();
  const TOLERANCE = 0.05;

  // `id` é opcional nesta assinatura (chamadores antigos não o passavam); o
  // índice serve de chave estável quando ele não vem.
  const collapsed = collapseSplitGroups(
    existingTransactions.map((tx, i) => ({ ...tx, id: tx.id ?? `row-${i}` })),
  );

  importedItems.forEach((item, index) => {
    const match = collapsed.find((existing) => {
      if (usedExistingIds.has(existing.id)) return false;

      // Date match
      const dateMatch = normalizeDate(existing.date) === normalizeDate(item.date);
      if (!dateMatch) return false;

      // Amount match
      const amountMatch = Math.abs(Number(existing.amount) - item.amount) <= TOLERANCE;
      if (!amountMatch) return false;

      // String match (original_description fallback to description)
      const existingStr = normalizeString(existing.original_description || existing.description);
      const importedStr = normalizeString(item.description);
      return existingStr === importedStr;
    });

    if (match) {
      duplicates.set(index, match);
      match.splitMemberIds.forEach((id) => usedExistingIds.add(id));
    }
  });

  return duplicates;
}

/**
 * Quantos dias a data digitada num lançamento manual pode distar da data do
 * extrato. Cobre o fim de semana entre o PIX e o lançamento no banco, e quem
 * lança no dia em que lembra; não chega ao mês seguinte, onde mora a próxima
 * ocorrência de um PIX recorrente de mesmo valor.
 */
export const MANUAL_MATCH_WINDOW_DAYS = 3;

export interface ManualCandidate extends SplitAwareRow {
  date: string;
  description: string;
  original_description: string | null;
  type: string;
}

/** Dias desde a época, para medir distância entre datas YYYY-MM-DD sem fuso. */
function dayNumber(date: string): number {
  const [y, m, d] = normalizeDate(date).split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

/**
 * Lançamento feito à mão que o extrato confirma.
 *
 * `findAccountDuplicates` só reconhece o que veio de importação: compara o
 * texto do extrato com `original_description`, que lançamento manual não tem
 * (a descrição é a digitada). Em 13/10/2026 a PIX do Rulhan de R$ 425,24 foi
 * lançada à mão como "Airbnb - Rulhan", já vinculada ao reembolso da parcela;
 * o OFX trouxe "PIX TRANSF Rulhan 13 10", a revisão mostrou como nova e ela
 * entrou de novo — saldo da conta R$ 425,24 acima do banco.
 *
 * Sem descrição para comparar, sobra direção + valor + data próxima. Isso é
 * suposição, não prova: quem chama mostra o par na revisão e deixa
 * "Importar mesmo assim".
 *
 * - Só é candidato quem NÃO tem `original_description`. Um importado já tem a
 *   sua linha de extrato; casar outra linha com ele esconderia um lançamento
 *   real (dois PIX de mesmo valor em dias seguidos).
 * - `skip.items`: linhas já resolvidas (duplicata exata, previsto casado).
 * - `skip.existingIds`: lançamentos que a regra exata já consumiu.
 * - Empate: ganha o de data mais próxima.
 * - Divisão conta como uma linha com o valor somado, como nas outras regras.
 */
export function matchManualEntries<T extends ManualCandidate>(
  importedItems: Array<{ date: string; amount: number; type: string }>,
  existingTransactions: T[],
  skip: { items: ReadonlySet<number>; existingIds: ReadonlySet<string> },
): Map<number, CollapsedRow<T>> {
  const matches = new Map<number, CollapsedRow<T>>();
  const usedExistingIds = new Set(skip.existingIds);
  const TOLERANCE = 0.05;

  const manualRows = collapseSplitGroups(existingTransactions).filter((row) => !row.original_description);

  importedItems.forEach((item, index) => {
    if (skip.items.has(index)) return;
    const itemDay = dayNumber(item.date);

    let best: CollapsedRow<T> | null = null;
    let bestDistance = Infinity;
    for (const row of manualRows) {
      if (row.splitMemberIds.some((id) => usedExistingIds.has(id))) continue;
      if (row.type !== item.type) continue;
      if (Math.abs(Number(row.amount) - item.amount) > TOLERANCE) continue;

      const distance = Math.abs(dayNumber(row.date) - itemDay);
      // `!(<=)` e não `>`: data ilegível dá NaN, e NaN nunca casa.
      if (!(distance <= MANUAL_MATCH_WINDOW_DAYS)) continue;
      if (distance < bestDistance) {
        best = row;
        bestDistance = distance;
      }
    }

    if (best) {
      matches.set(index, best);
      best.splitMemberIds.forEach((id) => usedExistingIds.add(id));
    }
  });

  return matches;
}

/**
 * Intervalo de datas que a revisão do extrato precisa ler do banco.
 *
 * Toda regra que casa uma linha do extrato com um lançamento existente é presa
 * à data: `findAccountDuplicates` e o casamento com previsto exigem o MESMO
 * dia, e `matchManualEntries` aceita até `MANUAL_MATCH_WINDOW_DAYS` de
 * distância. Lançamento fora deste intervalo não casa com linha nenhuma, então
 * não precisa vir — e ler a conta inteira esbarrava no teto de linhas do
 * PostgREST. **Se uma regra ganhar janela maior, este intervalo acompanha.**
 *
 * @returns `null` quando nenhuma data do extrato é legível.
 */
export function accountLookupRange(
  importedItems: Array<{ date: string }>,
): { from: string; to: string } | null {
  const days = importedItems.map((item) => dayNumber(item.date)).filter(Number.isFinite);
  if (days.length === 0) return null;

  // UTC nas duas pontas (dayNumber também é UTC), então não há fuso no meio.
  const toYmd = (day: number) => new Date(day * 86_400_000).toISOString().slice(0, 10);
  return {
    from: toYmd(Math.min(...days) - MANUAL_MATCH_WINDOW_DAYS),
    to: toYmd(Math.max(...days) + MANUAL_MATCH_WINDOW_DAYS),
  };
}
