/**
 * Funções utilitárias para normalização e detecção de duplicatas em importações.
 */

import { collapseSplitGroups } from "./splitTransaction";
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
 *    valor somado — é assim que o gasto aparece na fatura importada.
 * 6. Sinal: crédito só casa com estorno e compra só casa com compra. Sem isso,
 *    um estorno de R$ 0,16 seria dado como duplicata da compra de R$ 0,16 no
 *    mesmo dia (a tolerância de valor compara módulos) e nunca seria importado.
 * 7. Empate: entre candidatos igualmente válidos, ganha o de mesmo mês-dia.
 */
export function detectDuplicates(
  importedItems: ImportedItem[],
  existingTransactions: ExistingTransaction[]
): Map<number, ExistingTransaction> {
  const duplicateMap = new Map<number, ExistingTransaction>();
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
  existingTransactions: Array<{
    id?: string;
    date: string;
    description: string;
    original_description: string | null;
    amount: number;
    split_group_id?: string | null;
    split_parent_id?: string | null;
  }>
): Set<number> {
  const duplicateIndices = new Set<number>();
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
      duplicateIndices.add(index);
      match.splitMemberIds.forEach((id) => usedExistingIds.add(id));
    }
  });

  return duplicateIndices;
}
