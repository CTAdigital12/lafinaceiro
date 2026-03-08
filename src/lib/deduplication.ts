/**
 * Funções utilitárias para normalização e detecção de duplicatas em importações.
 */

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

export interface ExistingTransaction {
  id: string;
  description: string;
  original_description: string | null;
  amount: number;
  date: string;
  installment_number: number | null;
  total_installments: number | null;
}

export interface ImportedItem {
  transaction_value: number;
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
 * 4. Parcela: se importado tem installment_current, exige match de installment_number + total_installments
 */
export function detectDuplicates(
  importedItems: ImportedItem[],
  existingTransactions: ExistingTransaction[]
): Map<number, ExistingTransaction> {
  const duplicateMap = new Map<number, ExistingTransaction>();
  const usedExistingIds = new Set<string>();
  const TOLERANCE = 0.05;

  importedItems.forEach((item, index) => {
    const isInstallment = !!(item.installment_current && item.installment_total);

    const match = existingTransactions.find((existing) => {
      if (usedExistingIds.has(existing.id)) return false;

      // Rule 2: Amount tolerance
      const amountMatch = Math.abs(Number(existing.amount) - item.transaction_value) <= TOLERANCE;
      if (!amountMatch) return false;

      if (isInstallment) {
        // Rule 4: Installment match
        return (
          existing.installment_number === item.installment_current &&
          existing.total_installments === item.installment_total
        );
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

    if (match) {
      duplicateMap.set(index, match);
      usedExistingIds.add(match.id);
    }
  });

  return duplicateMap;
}

/**
 * Detecta duplicatas para importação de extratos bancários (contas).
 * Similar a detectDuplicates mas com interface adaptada para AccountImportedItem.
 */
export function detectAccountDuplicates(
  importedItems: Array<{ date: string; description: string; amount: number }>,
  existingTransactions: Array<{ date: string; description: string; original_description: string | null; amount: number }>
): Set<number> {
  const duplicateIndices = new Set<number>();
  const usedExistingIndices = new Set<number>();
  const TOLERANCE = 0.05;

  importedItems.forEach((item, index) => {
    const match = existingTransactions.findIndex((existing, existIdx) => {
      if (usedExistingIndices.has(existIdx)) return false;

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

    if (match >= 0) {
      duplicateIndices.add(index);
      usedExistingIndices.add(match);
    }
  });

  return duplicateIndices;
}
