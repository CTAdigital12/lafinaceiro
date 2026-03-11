import { normalizeString, normalizeDate } from "./deduplication";
import * as XLSX from "xlsx";

export interface SpreadsheetItem {
  date: string; // YYYY-MM-DD
  description: string;
  amount: number;
  rowIndex: number;
}

export interface SystemTransaction {
  id: string;
  date: string;
  due_date: string | null;
  description: string;
  original_description: string | null;
  amount: number;
  is_refund: boolean;
  is_corporate_expense: boolean;
  category_id: string | null;
  status: string;
}

export interface ReconciliationResult {
  matched: Array<{ spreadsheet: SpreadsheetItem; transaction: SystemTransaction }>;
  valueDiscrepancies: Array<{ spreadsheet: SpreadsheetItem; transaction: SystemTransaction; difference: number }>;
  onlyInSpreadsheet: SpreadsheetItem[];
  onlyInSystem: SystemTransaction[];
  summary: {
    total: number;
    matched: number;
    discrepancies: number;
    missing: number;
    extra: number;
  };
}

const TOLERANCE = 0.05;

/**
 * Compare spreadsheet items against system transactions using 2-pass matching.
 */
export function reconcileSpreadsheet(
  spreadsheetItems: SpreadsheetItem[],
  systemTransactions: SystemTransaction[]
): ReconciliationResult {
  const usedSpreadsheetIndices = new Set<number>();
  const usedSystemIds = new Set<string>();

  const matched: ReconciliationResult["matched"] = [];
  const valueDiscrepancies: ReconciliationResult["valueDiscrepancies"] = [];

  // Pass 1: Exact match (description + date + amount)
  for (let si = 0; si < spreadsheetItems.length; si++) {
    const item = spreadsheetItems[si];
    const normalizedItemDesc = normalizeString(item.description);
    const normalizedItemDate = normalizeDate(item.date);

    for (const tx of systemTransactions) {
      if (usedSystemIds.has(tx.id)) continue;

      const normalizedTxDesc = normalizeString(tx.original_description || tx.description);
      const normalizedTxDate = normalizeDate(tx.date);

      if (normalizedItemDesc === normalizedTxDesc && normalizedItemDate === normalizedTxDate) {
        if (Math.abs(item.amount - Number(tx.amount)) <= TOLERANCE) {
          matched.push({ spreadsheet: item, transaction: tx });
          usedSpreadsheetIndices.add(si);
          usedSystemIds.add(tx.id);
          break;
        }
      }
    }
  }

  // Pass 2: Partial match (description + date, different amount) for unmatched items
  for (let si = 0; si < spreadsheetItems.length; si++) {
    if (usedSpreadsheetIndices.has(si)) continue;
    const item = spreadsheetItems[si];
    const normalizedItemDesc = normalizeString(item.description);
    const normalizedItemDate = normalizeDate(item.date);

    for (const tx of systemTransactions) {
      if (usedSystemIds.has(tx.id)) continue;

      const normalizedTxDesc = normalizeString(tx.original_description || tx.description);
      const normalizedTxDate = normalizeDate(tx.date);

      if (normalizedItemDesc === normalizedTxDesc && normalizedItemDate === normalizedTxDate) {
        const diff = item.amount - Number(tx.amount);
        valueDiscrepancies.push({ spreadsheet: item, transaction: tx, difference: diff });
        usedSpreadsheetIndices.add(si);
        usedSystemIds.add(tx.id);
        break;
      }
    }
  }

  const onlyInSpreadsheet = spreadsheetItems.filter((_, i) => !usedSpreadsheetIndices.has(i));
  const onlyInSystem = systemTransactions.filter((tx) => !usedSystemIds.has(tx.id));

  return {
    matched,
    valueDiscrepancies,
    onlyInSpreadsheet,
    onlyInSystem,
    summary: {
      total: spreadsheetItems.length + systemTransactions.length,
      matched: matched.length,
      discrepancies: valueDiscrepancies.length,
      missing: onlyInSpreadsheet.length,
      extra: onlyInSystem.length,
    },
  };
}

// ── Parsing ──────────────────────────────────────────────────────────

function parseAmount(value: string | number | undefined): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === "number") return value;
  const cleaned = value.replace(/R\$\s*/i, "").replace(/\s/g, "").trim();
  if (!cleaned) return 0;
  const hasBrazilianFormat = /\d+\.\d{3}/.test(cleaned) || /\d+,\d{2}$/.test(cleaned);
  let normalized: string;
  if (hasBrazilianFormat) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = cleaned.replace(/,/g, "");
  }
  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? 0 : parsed;
}

function parseDate(value: string | number | undefined): string | null {
  if (!value) return null;
  const str = String(value).trim();

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10);

  // DD/MM/YYYY or DD-MM-YYYY
  const match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (match) {
    const day = match[1].padStart(2, "0");
    const month = match[2].padStart(2, "0");
    let year = match[3];
    if (year.length === 2) year = "20" + year;
    return `${year}-${month}-${day}`;
  }

  // Excel serial date number
  if (/^\d{5}$/.test(str)) {
    const date = XLSX.SSF.parse_date_code(parseInt(str));
    if (date) {
      return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
    }
  }

  return null;
}

/**
 * Parse a CSV or XLSX file into SpreadsheetItem[].
 */
export async function parseSpreadsheetFile(file: File): Promise<SpreadsheetItem[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  if (rows.length < 2) return [];

  // Detect columns from header
  const header = rows[0].map((c: any) => String(c).toLowerCase().trim());
  const datePatterns = ["data", "date", "dt", "data compra", "data transação", "data transacao"];
  const descPatterns = ["descrição", "descricao", "description", "desc", "estabelecimento", "lançamento", "lancamento"];
  const amountPatterns = ["valor", "amount", "value", "vlr", "total"];

  let dateCol = -1, descCol = -1, amountCol = -1;
  header.forEach((h, i) => {
    if (dateCol === -1 && datePatterns.some((p) => h.includes(p))) dateCol = i;
    if (descCol === -1 && descPatterns.some((p) => h.includes(p))) descCol = i;
    if (amountCol === -1 && amountPatterns.some((p) => h.includes(p))) amountCol = i;
  });

  if (dateCol === -1) dateCol = 0;
  if (descCol === -1) descCol = 1;
  if (amountCol === -1) amountCol = 2;

  const items: SpreadsheetItem[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const date = parseDate(row[dateCol]);
    const description = String(row[descCol] || "").trim();
    const amount = parseAmount(row[amountCol]);

    if (!date || !description || amount === 0) continue;

    items.push({ date, description, amount: Math.abs(amount), rowIndex: i });
  }

  return items;
}
