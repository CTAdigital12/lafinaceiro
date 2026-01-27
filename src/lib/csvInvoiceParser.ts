// CSV Invoice Parser for credit card invoices
// Separate from csvParser.ts which handles account statements

export interface CSVInvoiceTransaction {
  date: string; // YYYY-MM-DD
  description: string;
  amount: number;
  installment_current?: number;
  installment_total?: number;
}

interface CSVInvoiceParseOptions {
  invoiceMonth: number;
  invoiceYear: number;
  closingDay: number;
}

// Detect delimiter by counting occurrences
function detectDelimiter(line: string): string {
  const delimiters = [";", ",", "\t", "|"];
  let maxCount = 0;
  let bestDelimiter = ";";
  
  for (const d of delimiters) {
    const count = (line.match(new RegExp(`\\${d}`, "g")) || []).length;
    if (count > maxCount) {
      maxCount = count;
      bestDelimiter = d;
    }
  }
  
  return bestDelimiter;
}

// Parse a single CSV line respecting quotes
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

// Parse amount in Brazilian format (1.234,56) or US format (1,234.56)
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
  return isNaN(parsed) ? 0 : Math.abs(parsed);
}

// Detect installments from description
function detectInstallments(description: string): { current: number; total: number } | null {
  // Match patterns like: "3/10", "03/10", "PARC 3/10", "(3/10)", "3 DE 10", "PARCELA 3 DE 10"
  const patterns = [
    /\b(\d{1,2})\s*\/\s*(\d{1,2})\b/,         // 3/10 or 03/10
    /\bPARC(?:ELA)?\s*(\d{1,2})\s*\/\s*(\d{1,2})\b/i, // PARC 3/10 or PARCELA 3/10
    /\((\d{1,2})\s*\/\s*(\d{1,2})\)/,          // (3/10)
    /\b(\d{1,2})\s*DE\s*(\d{1,2})\b/i,         // 3 DE 10
  ];
  
  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match) {
      const current = parseInt(match[1], 10);
      const total = parseInt(match[2], 10);
      // Validate: current <= total, both > 0, total <= 99
      if (current > 0 && total > 0 && current <= total && total <= 99) {
        return { current, total };
      }
    }
  }
  
  return null;
}

// Parse date and infer year based on invoice context
function parseDate(value: string, options: CSVInvoiceParseOptions): string | null {
  if (!value) return null;
  
  const cleaned = value.replace(/["']/g, "").trim();
  
  // Try DD/MM or DD/MM/YY or DD/MM/YYYY
  const match = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    let year: number;
    
    if (match[3]) {
      // Year provided
      year = parseInt(match[3], 10);
      if (year < 100) {
        year += 2000; // Convert 2-digit to 4-digit
      }
    } else {
      // Infer year based on invoice month/year
      // If purchase month > invoice month, purchase was in previous year
      if (month > options.invoiceMonth) {
        year = options.invoiceYear - 1;
      } else {
        year = options.invoiceYear;
      }
    }
    
    // Validate day/month
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  
  // Try YYYY-MM-DD
  const isoMatch = cleaned.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  
  return null;
}

// Detect column mapping from headers
interface ColumnMap {
  dateColumn: number;
  descriptionColumn: number;
  amountColumn: number;
  hasHeader: boolean;
}

function detectColumns(header: string[]): ColumnMap {
  const datePatterns = ["data", "date", "dt", "data compra", "data transação", "data transacao", "data da compra"];
  const descPatterns = ["descrição", "descricao", "description", "desc", "estabelecimento", "lançamento", "lancamento", "merchant", "local", "nome"];
  const amountPatterns = ["valor", "amount", "value", "quantia", "vlr", "total"];
  
  let dateColumn = -1;
  let descriptionColumn = -1;
  let amountColumn = -1;
  let hasHeader = false;
  
  header.forEach((col, index) => {
    const normalized = col.toLowerCase().replace(/["']/g, "").trim();
    
    if (datePatterns.some(p => normalized.includes(p))) {
      dateColumn = index;
      hasHeader = true;
    }
    if (descPatterns.some(p => normalized.includes(p))) {
      descriptionColumn = index;
      hasHeader = true;
    }
    if (amountPatterns.some(p => normalized.includes(p))) {
      amountColumn = index;
      hasHeader = true;
    }
  });
  
  // Defaults if not detected: assume date, description, amount order
  if (dateColumn === -1) dateColumn = 0;
  if (descriptionColumn === -1) descriptionColumn = 1;
  if (amountColumn === -1) amountColumn = 2;
  
  return { dateColumn, descriptionColumn, amountColumn, hasHeader };
}

export function parseCSVInvoice(content: string, options: CSVInvoiceParseOptions): CSVInvoiceTransaction[] {
  const transactions: CSVInvoiceTransaction[] = [];
  const lines = content.split(/[\r\n]+/).filter(line => line.trim());
  
  if (lines.length === 0) return transactions;
  
  // Auto-detect delimiter
  const delimiter = detectDelimiter(lines[0]);
  
  // Parse first line to detect columns
  const firstRow = parseCSVLine(lines[0], delimiter);
  const columnMap = detectColumns(firstRow);
  
  const startRow = columnMap.hasHeader ? 1 : 0;
  
  for (let i = startRow; i < lines.length; i++) {
    const values = parseCSVLine(lines[i], delimiter);
    
    if (values.length < 3) continue;
    
    const dateVal = values[columnMap.dateColumn] || "";
    const descVal = values[columnMap.descriptionColumn]?.replace(/["']/g, "").trim() || "";
    const amountVal = values[columnMap.amountColumn] || "";
    
    const parsedDate = parseDate(dateVal, options);
    const amount = parseAmount(amountVal);
    
    // Skip rows without valid date or amount
    if (!parsedDate || amount <= 0 || !descVal) continue;
    
    // Detect installments
    const installments = detectInstallments(descVal);
    
    transactions.push({
      date: parsedDate,
      description: descVal,
      amount,
      ...(installments && {
        installment_current: installments.current,
        installment_total: installments.total,
      }),
    });
  }
  
  return transactions;
}

// Convert parsed CSV data to ImportedItem format for InvoiceReviewModal
export function convertToImportedItems(
  transactions: CSVInvoiceTransaction[],
  invoiceMonth: number,
  invoiceYear: number,
  closingDay: number
): {
  items: Array<{
    purchase_date: string;
    posting_date: string;
    due_date: string;
    transaction_value: number;
    description: string;
    installment_current?: number;
    installment_total?: number;
    is_post_closing?: boolean;
  }>;
  post_closing_count: number;
} {
  const today = new Date().toISOString().split("T")[0];
  
  // Calculate due date (15th of invoice month by default)
  const dueDate = `${invoiceYear}-${String(invoiceMonth).padStart(2, "0")}-15`;
  
  // Calculate closing date for this invoice
  const closingDate = new Date(invoiceYear, invoiceMonth - 1, closingDay);
  
  let postClosingCount = 0;
  
  const items = transactions.map(tx => {
    const purchaseDate = new Date(tx.date);
    const isPostClosing = purchaseDate > closingDate;
    
    if (isPostClosing) postClosingCount++;
    
    return {
      purchase_date: tx.date,
      posting_date: today,
      due_date: dueDate,
      transaction_value: tx.amount,
      description: tx.description,
      ...(tx.installment_current && { installment_current: tx.installment_current }),
      ...(tx.installment_total && { installment_total: tx.installment_total }),
      is_post_closing: isPostClosing,
    };
  });
  
  return { items, post_closing_count: postClosingCount };
}
