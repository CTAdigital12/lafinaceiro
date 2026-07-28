import { normalizeString, normalizeDate } from "./deduplication";
import { collapseSplitGroups, type CollapsedRow } from "./splitTransaction";
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
  is_provisional?: boolean;
  recurring_rule_id?: string | null;
  /** Divisão por categoria: as partes são colapsadas antes do matching. */
  split_group_id?: string | null;
  split_parent_id?: string | null;
}

/** Linha do sistema já com as partes de uma divisão somadas numa só. */
export type SystemRow = CollapsedRow<SystemTransaction>;

export interface ReconciliationResult {
  matched: Array<{ spreadsheet: SpreadsheetItem; transaction: SystemRow }>;
  valueDiscrepancies: Array<{ spreadsheet: SpreadsheetItem; transaction: SystemRow; difference: number }>;
  onlyInSpreadsheet: SpreadsheetItem[];
  onlyInSystem: SystemRow[];
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
 * Normalise and compute Jaccard similarity between two description strings.
 */
function descriptionSimilarity(a: string, b: string): number {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const wordsA = new Set(norm(a).split(" ").filter(Boolean));
  const wordsB = new Set(norm(b).split(" ").filter(Boolean));
  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) if (wordsB.has(w)) intersection++;
  return intersection / (wordsA.size + wordsB.size - intersection);
}

/**
 * Compare spreadsheet items against system transactions using 2-pass matching.
 */
export function reconcileSpreadsheet(
  spreadsheetItems: SpreadsheetItem[],
  systemTransactions: SystemTransaction[]
): ReconciliationResult {
  // Uma transação dividida vira uma linha só, com o valor somado — é assim que
  // ela aparece na planilha/fatura do banco.
  const systemRows = collapseSplitGroups(systemTransactions);

  const usedSpreadsheetIndices = new Set<number>();
  const usedSystemIds = new Set<string>();

  const matched: ReconciliationResult["matched"] = [];
  const valueDiscrepancies: ReconciliationResult["valueDiscrepancies"] = [];

  // Pass 1: Exact match (date + amount) with description similarity tiebreaker
  for (let si = 0; si < spreadsheetItems.length; si++) {
    const item = spreadsheetItems[si];
    const normalizedItemDate = normalizeDate(item.date);

    // Collect all candidates with matching date + amount
    const candidates: SystemRow[] = [];
    for (const tx of systemRows) {
      if (usedSystemIds.has(tx.id)) continue;
      const normalizedTxDate = normalizeDate(tx.date);
      if (normalizedItemDate === normalizedTxDate && Math.abs(item.amount - Number(tx.amount)) <= TOLERANCE) {
        candidates.push(tx);
      }
    }

    if (candidates.length === 1) {
      matched.push({ spreadsheet: item, transaction: candidates[0] });
      usedSpreadsheetIndices.add(si);
      usedSystemIds.add(candidates[0].id);
    } else if (candidates.length > 1) {
      // Pick the candidate with the highest score: provisional gets a bonus
      let best = candidates[0];
      let bestScore = -1;
      for (const tx of candidates) {
        const txDesc = tx.original_description || tx.description;
        let score = descriptionSimilarity(item.description, txDesc);
        // Provisional transactions get a bonus so they are "consumed" first
        if (tx.is_provisional) score += 0.3;
        if (score > bestScore) {
          bestScore = score;
          best = tx;
        }
      }
      matched.push({ spreadsheet: item, transaction: best });
      usedSpreadsheetIndices.add(si);
      usedSystemIds.add(best.id);
    }
  }

  // Pass 2: Date-only match (different amount → discrepancy)
  for (let si = 0; si < spreadsheetItems.length; si++) {
    if (usedSpreadsheetIndices.has(si)) continue;
    const item = spreadsheetItems[si];
    const normalizedItemDate = normalizeDate(item.date);

    for (const tx of systemRows) {
      if (usedSystemIds.has(tx.id)) continue;

      const normalizedTxDate = normalizeDate(tx.date);

      if (normalizedItemDate === normalizedTxDate) {
        const diff = item.amount - Number(tx.amount);
        valueDiscrepancies.push({ spreadsheet: item, transaction: tx, difference: diff });
        usedSpreadsheetIndices.add(si);
        usedSystemIds.add(tx.id);
        break;
      }
    }
  }

  const onlyInSpreadsheet = spreadsheetItems.filter((_, i) => !usedSpreadsheetIndices.has(i));
  const onlyInSystem = systemRows.filter((tx) => !usedSystemIds.has(tx.id));

  return {
    matched,
    valueDiscrepancies,
    onlyInSpreadsheet,
    onlyInSystem,
    summary: {
      total: spreadsheetItems.length + systemRows.length,
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

// ── CSV helpers ──────────────────────────────────────────────────────

function detectDelimiter(line: string): string {
  const delimiters = [";", ",", "\t", "|"];
  let maxCount = 0;
  let best = ",";
  for (const d of delimiters) {
    const count = (line.match(new RegExp(d === "|" ? "\\|" : d === "\t" ? "\t" : d, "g")) || []).length;
    if (count > maxCount) {
      maxCount = count;
      best = d;
    }
  }
  return best;
}

function parseCSVLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && !inQuotes) {
      inQuotes = true;
    } else if (char === '"' && inQuotes) {
      if (line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = false;
      }
    } else if (char === delimiter && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function detectColumns(header: string[]) {
  const datePatterns = ["data", "date", "dt", "data compra", "data transação", "data transacao"];
  const descPatterns = ["descrição", "descricao", "description", "desc", "estabelecimento", "lançamento", "lancamento"];
  const amountPatterns = ["valor", "amount", "value", "vlr", "total"];

  let dateCol = -1, descCol = -1, amountCol = -1;
  header.forEach((h, i) => {
    const low = h.toLowerCase().trim().replace(/["']/g, "");
    if (dateCol === -1 && datePatterns.some((p) => low.includes(p))) dateCol = i;
    if (descCol === -1 && descPatterns.some((p) => low.includes(p))) descCol = i;
    if (amountCol === -1 && amountPatterns.some((p) => low.includes(p))) amountCol = i;
  });

  if (dateCol === -1) dateCol = 0;
  if (descCol === -1) descCol = 1;
  if (amountCol === -1) amountCol = 2;

  return { dateCol, descCol, amountCol };
}

function rowsToItems(rows: string[][], startRow: number, cols: { dateCol: number; descCol: number; amountCol: number }): SpreadsheetItem[] {
  const items: SpreadsheetItem[] = [];
  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    const date = parseDate(row[cols.dateCol]);
    const description = String(row[cols.descCol] || "").trim();
    const amount = parseAmount(row[cols.amountCol]);
    if (!date || !description || amount === 0) continue;
    items.push({ date, description, amount: Math.abs(amount), rowIndex: i });
  }
  return items;
}

/**
 * Parse a CSV or XLSX file into SpreadsheetItem[].
 */
export async function parseSpreadsheetFile(file: File): Promise<SpreadsheetItem[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "csv" || ext === "tsv" || ext === "txt") {
    // Manual CSV parsing with encoding fallback
    let text: string;
    try {
      text = await file.text(); // UTF-8
      // If we detect replacement characters, try Latin-1
      if (text.includes("\uFFFD")) {
        const buffer = await file.arrayBuffer();
        text = new TextDecoder("iso-8859-1").decode(buffer);
      }
    } catch {
      const buffer = await file.arrayBuffer();
      text = new TextDecoder("iso-8859-1").decode(buffer);
    }

    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];

    const delimiter = detectDelimiter(lines[0]);
    const headerRow = parseCSVLine(lines[0], delimiter);
    const cols = detectColumns(headerRow);

    const allRows = lines.map((l) => parseCSVLine(l, delimiter));
    return rowsToItems(allRows, 1, cols);
  }

  // XLSX / XLS
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  if (rows.length < 2) return [];

  const header = rows[0].map((c: any) => String(c));
  const cols = detectColumns(header);

  const stringRows = rows.map((r) => r.map((c: any) => String(c)));
  return rowsToItems(stringRows, 1, cols);
}
