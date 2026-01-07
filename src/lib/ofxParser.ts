// OFX Parser utility for bank statement imports
export interface OFXTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: "income" | "expense";
}

export function parseOFX(content: string): OFXTransaction[] {
  const transactions: OFXTransaction[] = [];
  
  // Find all STMTTRN blocks
  const stmttrnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let match;
  
  while ((match = stmttrnRegex.exec(content)) !== null) {
    const block = match[1];
    
    // Extract transaction data
    const fitid = extractTag(block, "FITID") || `txn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const dtposted = extractTag(block, "DTPOSTED");
    const trnamt = extractTag(block, "TRNAMT");
    const memo = extractTag(block, "MEMO") || extractTag(block, "NAME") || "";
    
    if (dtposted && trnamt) {
      const amount = parseFloat(trnamt);
      const date = parseOFXDate(dtposted);
      
      transactions.push({
        id: fitid,
        date,
        description: memo.trim(),
        amount: Math.abs(amount),
        type: amount >= 0 ? "income" : "expense",
      });
    }
  }
  
  // If no STMTTRN found, try alternative OFX format
  if (transactions.length === 0) {
    // Try simple tag format without closing tags
    const lines = content.split(/[\r\n]+/);
    let currentTxn: Partial<OFXTransaction> = {};
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith("<FITID>")) {
        currentTxn.id = trimmed.replace("<FITID>", "").trim();
      } else if (trimmed.startsWith("<DTPOSTED>")) {
        currentTxn.date = parseOFXDate(trimmed.replace("<DTPOSTED>", "").trim());
      } else if (trimmed.startsWith("<TRNAMT>")) {
        const amount = parseFloat(trimmed.replace("<TRNAMT>", "").trim());
        currentTxn.amount = Math.abs(amount);
        currentTxn.type = amount >= 0 ? "income" : "expense";
      } else if (trimmed.startsWith("<MEMO>")) {
        currentTxn.description = trimmed.replace("<MEMO>", "").trim();
      } else if (trimmed.startsWith("<NAME>") && !currentTxn.description) {
        currentTxn.description = trimmed.replace("<NAME>", "").trim();
      } else if (trimmed === "</STMTTRN>" || (trimmed.startsWith("<STMTTRN>") && currentTxn.date)) {
        if (currentTxn.date && currentTxn.amount !== undefined) {
          transactions.push({
            id: currentTxn.id || `txn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            date: currentTxn.date,
            description: currentTxn.description || "",
            amount: currentTxn.amount,
            type: currentTxn.type || "expense",
          });
        }
        currentTxn = {};
      }
    }
    
    // Handle last transaction if not closed
    if (currentTxn.date && currentTxn.amount !== undefined) {
      transactions.push({
        id: currentTxn.id || `txn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        date: currentTxn.date,
        description: currentTxn.description || "",
        amount: currentTxn.amount,
        type: currentTxn.type || "expense",
      });
    }
  }
  
  return transactions;
}

function extractTag(block: string, tagName: string): string | null {
  // Match both <TAG>value</TAG> and <TAG>value (without closing tag)
  const regex = new RegExp(`<${tagName}>([^<\\r\\n]+)`, "i");
  const match = block.match(regex);
  return match ? match[1].trim() : null;
}

function parseOFXDate(dateStr: string): string {
  // OFX date format: YYYYMMDDHHMMSS or YYYYMMDD
  const cleaned = dateStr.replace(/\[.*\]$/, "").trim(); // Remove timezone info
  
  if (cleaned.length >= 8) {
    const year = cleaned.substring(0, 4);
    const month = cleaned.substring(4, 6);
    const day = cleaned.substring(6, 8);
    return `${year}-${month}-${day}`;
  }
  
  return new Date().toISOString().split("T")[0];
}
