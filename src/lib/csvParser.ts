// CSV Parser utility for bank statement imports
export interface CSVTransaction {
  date: string;
  description: string;
  amount: number;
  type: "income" | "expense";
}

interface CSVParseOptions {
  delimiter?: string;
  dateColumn?: number;
  descriptionColumn?: number;
  amountColumn?: number;
  creditColumn?: number;
  debitColumn?: number;
  hasHeader?: boolean;
}

export function parseCSV(content: string, options?: CSVParseOptions): CSVTransaction[] {
  const transactions: CSVTransaction[] = [];
  const lines = content.split(/[\r\n]+/).filter(line => line.trim());
  
  if (lines.length === 0) return transactions;
  
  // Auto-detect delimiter
  const delimiter = options?.delimiter || detectDelimiter(lines[0]);
  
  // Parse header to detect columns
  const headerRow = lines[0].split(delimiter).map(col => col.trim().toLowerCase().replace(/["']/g, ""));
  
  // Try to auto-detect columns from header
  const columnMap = detectColumns(headerRow);
  
  const startRow = options?.hasHeader !== false && columnMap.hasHeader ? 1 : 0;
  
  for (let i = startRow; i < lines.length; i++) {
    const values = parseCSVLine(lines[i], delimiter);
    
    if (values.length < 2) continue;
    
    const dateVal = values[columnMap.dateColumn]?.replace(/["']/g, "").trim() || "";
    const descVal = values[columnMap.descriptionColumn]?.replace(/["']/g, "").trim() || "";
    
    let amount = 0;
    let type: "income" | "expense" = "expense";
    
    // Handle separate credit/debit columns
    if (columnMap.creditColumn !== undefined && columnMap.debitColumn !== undefined) {
      const creditVal = parseAmount(values[columnMap.creditColumn]);
      const debitVal = parseAmount(values[columnMap.debitColumn]);
      
      if (creditVal > 0) {
        amount = creditVal;
        type = "income";
      } else if (debitVal !== 0) {
        amount = Math.abs(debitVal);
        type = "expense";
      }
    } else {
      // Single amount column
      const amountVal = parseAmount(values[columnMap.amountColumn]);
      amount = Math.abs(amountVal);
      type = amountVal >= 0 ? "income" : "expense";
    }
    
    const parsedDate = parseDate(dateVal);
    
    if (parsedDate && amount > 0) {
      transactions.push({
        date: parsedDate,
        description: descVal,
        amount,
        type,
      });
    }
  }
  
  return transactions;
}

function detectDelimiter(line: string): string {
  const delimiters = [";", ",", "\t", "|"];
  let maxCount = 0;
  let bestDelimiter = ",";
  
  for (const d of delimiters) {
    const count = (line.match(new RegExp(`\\${d}`, "g")) || []).length;
    if (count > maxCount) {
      maxCount = count;
      bestDelimiter = d;
    }
  }
  
  return bestDelimiter;
}

interface ColumnMap {
  dateColumn: number;
  descriptionColumn: number;
  amountColumn: number;
  creditColumn?: number;
  debitColumn?: number;
  hasHeader: boolean;
}

function detectColumns(header: string[]): ColumnMap {
  const datePatterns = ["data", "date", "dt", "data lançamento", "data lancamento", "data transação", "data transacao"];
  const descPatterns = ["descrição", "descricao", "description", "desc", "histórico", "historico", "memo", "observação", "observacao", "lançamento", "lancamento"];
  const amountPatterns = ["valor", "amount", "value", "quantia"];
  const creditPatterns = ["crédito", "credito", "credit", "entrada", "depósito", "deposito"];
  const debitPatterns = ["débito", "debito", "debit", "saída", "saida", "saque"];
  
  let dateColumn = -1;
  let descriptionColumn = -1;
  let amountColumn = -1;
  let creditColumn: number | undefined;
  let debitColumn: number | undefined;
  let hasHeader = false;
  
  header.forEach((col, index) => {
    if (datePatterns.some(p => col.includes(p))) {
      dateColumn = index;
      hasHeader = true;
    }
    if (descPatterns.some(p => col.includes(p))) {
      descriptionColumn = index;
      hasHeader = true;
    }
    if (amountPatterns.some(p => col.includes(p))) {
      amountColumn = index;
      hasHeader = true;
    }
    if (creditPatterns.some(p => col.includes(p))) {
      creditColumn = index;
      hasHeader = true;
    }
    if (debitPatterns.some(p => col.includes(p))) {
      debitColumn = index;
      hasHeader = true;
    }
  });
  
  // Default column positions if not detected
  if (dateColumn === -1) dateColumn = 0;
  if (descriptionColumn === -1) descriptionColumn = header.length >= 3 ? 1 : 0;
  if (amountColumn === -1 && creditColumn === undefined) amountColumn = header.length >= 3 ? 2 : 1;
  
  return {
    dateColumn,
    descriptionColumn,
    amountColumn,
    creditColumn,
    debitColumn,
    hasHeader,
  };
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

function parseAmount(value: string | undefined): number {
  if (!value) return 0;
  
  const cleaned = value
    .replace(/["']/g, "")
    .replace(/R\$\s*/i, "")
    .replace(/\s/g, "")
    .trim();
  
  if (!cleaned) return 0;
  
  // Detect Brazilian format (1.234,56) vs US format (1,234.56)
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

function parseDate(value: string): string | null {
  if (!value) return null;
  
  const cleaned = value.replace(/["']/g, "").trim();
  
  // Try DD/MM/YYYY or DD-MM-YYYY
  const brMatch = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  
  // Try YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = cleaned.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  
  // Try MM/DD/YYYY
  const usMatch = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (usMatch) {
    // Assume DD/MM/YYYY for Brazilian context
    const [, part1, part2, year] = usMatch;
    const day = part1;
    const month = part2;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  
  return null;
}
