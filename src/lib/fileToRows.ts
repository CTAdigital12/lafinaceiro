// Lê um arquivo de planilha (CSV/TSV/TXT ou XLS/XLSX) para uma matriz de
// células (string[][]), preservando o alinhamento de colunas vazias.
//
// Compartilhado entre os fluxos de importação (fatura de cartão e reconciliação
// de extrato) para evitar duplicar a lógica de leitura/encoding/datas-serial.
import * as XLSX from "xlsx";

// Detecta delimitador contando ocorrências na primeira linha.
function detectDelimiter(line: string): string {
  const delimiters = [";", ",", "\t", "|"];
  let maxCount = 0;
  let best = ",";
  for (const d of delimiters) {
    const escaped = d === "|" ? "\\|" : d === "\t" ? "\t" : d;
    const count = (line.match(new RegExp(escaped, "g")) || []).length;
    if (count > maxCount) {
      maxCount = count;
      best = d;
    }
  }
  return best;
}

// Faz o parse de uma linha CSV respeitando aspas.
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

// Converte uma célula em string. Datas (Date, via cellDates) viram dd/mm/yyyy
// para que o parseDate do parser de fatura as reconheça.
function cellToString(cell: unknown): string {
  if (cell instanceof Date && !isNaN(cell.getTime())) {
    const day = String(cell.getDate()).padStart(2, "0");
    const month = String(cell.getMonth() + 1).padStart(2, "0");
    const year = cell.getFullYear();
    return `${day}/${month}/${year}`;
  }
  return String(cell ?? "");
}

/**
 * Lê um arquivo de planilha para string[][]. Suporta CSV/TSV/TXT (com fallback
 * de encoding Latin-1) e XLS/XLSX (datas serial convertidas para dd/mm/yyyy).
 */
export async function fileToRows(file: File): Promise<string[][]> {
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "csv" || ext === "tsv" || ext === "txt") {
    let text: string;
    try {
      text = await file.text(); // UTF-8
      // Caracteres de substituição indicam encoding errado → tenta Latin-1.
      if (text.includes("�")) {
        const buffer = await file.arrayBuffer();
        text = new TextDecoder("iso-8859-1").decode(buffer);
      }
    } catch {
      const buffer = await file.arrayBuffer();
      text = new TextDecoder("iso-8859-1").decode(buffer);
    }

    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length === 0) return [];

    const delimiter = detectDelimiter(lines[0]);
    return lines.map((l) => parseCSVLine(l, delimiter));
  }

  // XLS / XLSX
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
  });

  return rows.map((r) => r.map(cellToString));
}
