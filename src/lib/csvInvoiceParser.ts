// CSV Invoice Parser for credit card invoices
// Separate from csvParser.ts which handles account statements

import { todayYmd } from "@/lib/dateUtils";

export interface CSVInvoiceTransaction {
  date: string; // YYYY-MM-DD
  description: string;
  amount: number;
  installment_current?: number;
  installment_total?: number;
  card_last_digits?: string; // 4 dígitos, capturados da fatura quando disponível
  /**
   * Linha de CRÉDITO: veio negativa no arquivo (estorno, devolução, ajuste de
   * arredondamento de parcelamento). `amount` é sempre POSITIVO; o sinal fica
   * aqui e vira `is_refund` na hora de gravar.
   */
  is_credit?: boolean;
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
  return isNaN(parsed) ? 0 : parsed;
}

// Detect installments from description
function detectInstallments(description: string): { current: number; total: number } | null {
  const patterns = [
    /(\d{1,2})\s*\/\s*(\d{1,2})\s*$/,                        // 04/10 no final da string
    /(\d{1,2})\s*\/\s*(\d{1,2})(?=\s|\)|$)/,                  // 04/10 seguido de espaço, ) ou fim
    /(?:^|[^\/\d])(\d{1,2})\s*\/\s*(\d{1,2})(?:[^\/\d]|$)/,   // DD/DD não precedido/seguido por / ou dígito
    /\bPARC(?:ELA)?\s*(\d{1,2})\s*\/\s*(\d{1,2})\b/i,         // PARC 3/10 or PARCELA 3/10
    /\((\d{1,2})\s*\/\s*(\d{1,2})\)/,                         // (3/10)
    /\b(\d{1,2})\s*DE\s*(\d{1,2})\b/i,                        // 3 DE 10
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match) {
      const groups = match.filter((_, i) => i > 0 && match[i] !== undefined);
      const current = parseInt(groups[0], 10);
      const total = parseInt(groups[1], 10);
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

// Extrai os 4 dígitos do cartão da célula. Aceita formatos comuns:
// "1234", "•••• 1234", "XXXX 1234", "Final 1234", "**** 1234".
// Retorna undefined se nada plausível for encontrado.
function parseCardLastDigits(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/["']/g, "").trim();
  if (!cleaned) return undefined;

  // Match: 4 dígitos consecutivos no fim da string (cobre "•••• 1234",
  // "XXXX XXXX XXXX 1234", "Final 1234", "1234" direto).
  const match = cleaned.match(/(\d{4})\s*$/);
  if (!match) return undefined;

  return match[1];
}

// Detecta uma célula que parece um valor monetário. Aceita tanto o formato
// brasileiro em texto ("R$ 1.234,56", "285,12") quanto o numérico que o Excel
// devolve ("299.99", "93.9", "50"). Rejeita datas (16/07/2025) e marcadores de
// parcela (11/12), que contêm "/".
function looksLikeAmount(value: string): boolean {
  const cleaned = value
    .replace(/["']/g, "")
    .replace(/R\$/i, "")
    .replace(/\s/g, "")
    .trim();
  if (!cleaned || !/\d/.test(cleaned)) return false;
  if (cleaned.includes("/")) return false;
  return (
    /^-?\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(cleaned) || // BR com milhar: 1.234,56
    /^-?\d+,\d{1,2}$/.test(cleaned) ||                  // BR decimal: 285,12
    /^-?\d+(\.\d{1,2})?$/.test(cleaned)                 // numérico (Excel): 299.99 / 93.9 / 50
  );
}

// Detecta o cabeçalho de uma seção de cartão e retorna os 4 dígitos.
// Ex.: "ANDRE EDUARDO SANTOS DOMIN - final 5391 (titular)" -> "5391".
function detectSectionCardDigits(row: string[]): string | undefined {
  const text = row.join(" ");
  const match = text.match(/final\s+(\d{4})\b/i);
  return match ? match[1] : undefined;
}

// Tenta interpretar uma linha como transação, detectando as colunas pelo
// CONTEÚDO das células (robusto a posições variáveis e à coluna "valor"
// afastada à direita). Retorna null se não for uma transação válida.
function tryParseTransaction(
  row: string[],
  options: CSVInvoiceParseOptions
): CSVInvoiceTransaction | null {
  // Âncora de data: primeira célula (esq -> dir) que parseia como data.
  let dateIdx = -1;
  let parsedDate: string | null = null;
  for (let i = 0; i < row.length; i++) {
    const d = parseDate(row[i], options);
    if (d) {
      dateIdx = i;
      parsedDate = d;
      break;
    }
  }
  if (dateIdx === -1 || !parsedDate) return null;

  // Âncora de valor: primeira célula monetária varrendo da DIREITA p/ esquerda.
  let amountIdx = -1;
  let amount = 0;
  for (let i = row.length - 1; i >= 0; i--) {
    if (i === dateIdx) continue;
    if (looksLikeAmount(row[i])) {
      const a = parseAmount(row[i]);
      if (a !== 0) {
        amountIdx = i;
        amount = a;
        break;
      }
    }
  }
  if (amountIdx === -1) return null;

  // Descrição: células entre as duas âncoras (ignora vazias usadas p/ espaçamento).
  const lo = Math.min(dateIdx, amountIdx);
  const hi = Math.max(dateIdx, amountIdx);
  const description = row
    .slice(lo + 1, hi)
    .map(c => c.replace(/["']/g, "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!description) return null;

  // Cartão explícito em coluna própria (CSV "...;valor;cartão"): procura nas
  // células após o valor. Tem precedência sobre o cartão herdado da seção.
  let explicitCard: string | undefined;
  for (let i = hi + 1; i < row.length; i++) {
    const c = parseCardLastDigits(row[i]);
    if (c) {
      explicitCard = c;
      break;
    }
  }

  const installments = detectInstallments(description);

  // Valor negativo = crédito na fatura. O sinal não pode chegar ao banco: o
  // resto do app assume `amount` positivo (`Math.abs` no conciliador, somas por
  // tipo, exibição). Guardamos a informação em `is_credit` e normalizamos o
  // valor; quem grava traduz para `type='income' + is_refund=true`, que é a
  // forma canônica de estorno (ver invoiceTotal.ts).
  const isCredit = amount < 0;

  return {
    date: parsedDate,
    description,
    amount: Math.abs(amount),
    ...(isCredit && { is_credit: true }),
    ...(installments && {
      installment_current: installments.current,
      installment_total: installments.total,
    }),
    ...(explicitCard && { card_last_digits: explicitCard }),
  };
}

// Parser section-aware baseado em linhas (matriz de células). É o núcleo
// compartilhado entre o caminho CSV (parseCSVInvoice) e o caminho XLS/XLSX.
export function parseInvoiceRows(
  rows: string[][],
  options: CSVInvoiceParseOptions
): CSVInvoiceTransaction[] {
  const transactions: CSVInvoiceTransaction[] = [];
  let currentCardDigits: string | undefined;

  for (const row of rows) {
    if (!row || row.join("").trim() === "") continue;

    // 1) Transação? (testado ANTES do cabeçalho para não confundir uma
    // descrição que contenha "final 1234" com cabeçalho de seção).
    const tx = tryParseTransaction(row, options);
    if (tx) {
      if (!tx.card_last_digits && currentCardDigits) {
        tx.card_last_digits = currentCardDigits;
      }
      transactions.push(tx);
      continue;
    }

    // 2) Cabeçalho de seção? Atualiza o cartão vigente.
    const sectionCard = detectSectionCardDigits(row);
    if (sectionCard) {
      currentCardDigits = sectionCard;
      continue;
    }

    // 3) Sub-header repetido ("data"/"lançamento"/"valor"), total, rodapé,
    // linha em branco -> ignorado.
  }

  return transactions;
}

export function parseCSVInvoice(content: string, options: CSVInvoiceParseOptions): CSVInvoiceTransaction[] {
  const lines = content.split(/[\r\n]+/).filter(line => line.trim());
  if (lines.length === 0) return [];

  const delimiter = detectDelimiter(lines[0]);
  const rows = lines.map(line => parseCSVLine(line, delimiter));

  return parseInvoiceRows(rows, options);
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
    card_last_digits?: string;
    is_credit?: boolean;
  }>;
  post_closing_count: number;
} {
  // todayYmd() e não `new Date().toISOString()`: o segundo devolve o dia em
  // UTC, então a partir das 21h no Brasil a importação carimbava a data de
  // lançamento como sendo a de amanhã.
  const today = todayYmd();

  // Calculate due date (15th of invoice month by default)
  const dueDate = `${invoiceYear}-${String(invoiceMonth).padStart(2, "0")}-15`;

  // Calculate closing date for this invoice
  const closingYmd = `${invoiceYear}-${String(invoiceMonth).padStart(2, "0")}-${String(closingDay).padStart(2, "0")}`;

  let postClosingCount = 0;

  const items = transactions.map(tx => {
    // Comparação lexicográfica de "YYYY-MM-DD" é cronológica e não passa por
    // fuso nenhum. A versão anterior comparava `new Date(tx.date)` (meia-noite
    // UTC) com um Date local: funcionava no Brasil por coincidência — os -3h
    // caem dentro do mesmo dia —, mas classificava errado a leste de
    // Greenwich. Compra NO dia do fechamento não é pós-fechamento.
    const isPostClosing = tx.date > closingYmd;
    
    if (isPostClosing) postClosingCount++;
    
    return {
      purchase_date: tx.date,
      posting_date: today,
      due_date: dueDate,
      transaction_value: tx.amount,
      description: tx.description,
      ...(tx.installment_current && { installment_current: tx.installment_current }),
      ...(tx.installment_total && { installment_total: tx.installment_total }),
      ...(tx.card_last_digits && { card_last_digits: tx.card_last_digits }),
      ...(tx.is_credit && { is_credit: true }),
      is_post_closing: isPostClosing,
    };
  });
  
  return { items, post_closing_count: postClosingCount };
}
