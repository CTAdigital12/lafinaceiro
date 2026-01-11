import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RawInvoiceItem {
  date: string;           // "DD/MM" from AI
  description: string;
  amount: number;
}

interface ProcessedInvoiceItem {
  purchase_date: string;       // Data da compra (YYYY-MM-DD) - imutável, do PDF
  posting_date: string;        // Data do upload (YYYY-MM-DD) - hoje
  due_date: string;            // Data de vencimento (YYYY-MM-DD) - do cabeçalho
  transaction_value: number;   // Valor da linha/parcela
  description: string;
  installment_current?: number;
  installment_total?: number;
  is_post_closing?: boolean;
}

interface InvoiceMetadata {
  due_date: string | null;     // "YYYY-MM-DD" extracted from header
  invoice_total: number | null; // Total desta fatura
}

// Detect installment pattern in description using regex
function detectInstallmentPattern(description: string): { current: number; total: number } | null {
  // Patterns to match:
  // "3/10", "03/10" at the end of description
  // "PARC 3/6", "PARC 03/06"
  // "(3/10)", "(03/10)"
  
  const patterns = [
    /(\d{1,2})\s*\/\s*(\d{1,2})\s*$/i,                           // "3/10" at end
    /(\d{1,2})\s+de\s+(\d{1,2})\s*$/i,                           // "3 de 10" at end
    /PARC(?:ELA)?\s*(\d{1,2})\s*\/\s*(\d{1,2})/i,               // "PARC 3/6" or "PARCELA 3/6"
    /\((\d{1,2})\s*\/\s*(\d{1,2})\)\s*$/i,                       // "(3/10)" at end
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match) {
      const current = parseInt(match[1], 10);
      const total = parseInt(match[2], 10);
      
      // Validate that it looks like installment info (not a date or other number)
      if (current > 0 && total > 0 && current <= total && total <= 48) {
        return { current, total };
      }
    }
  }
  
  return null;
}

// Infer the year of the purchase date based on invoice month/year
function inferPurchaseYear(
  purchaseDay: number,
  purchaseMonth: number,
  invoiceMonth: number,
  invoiceYear: number,
  closingDay: number
): { year: number; isPostClosing: boolean } {
  let year: number;
  let isPostClosing = false;

  // REGRA: Se o mês da transação for maior que o mês da fatura, 
  // a transação aconteceu no ano anterior
  // Exemplo: Fatura Jan/2026, transação em Dez -> transação é Dez/2025
  if (purchaseMonth > invoiceMonth) {
    year = invoiceYear - 1;
  } else if (purchaseMonth === invoiceMonth) {
    // Mesmo mês - verificar se é pós-fechamento
    year = invoiceYear;
    if (purchaseDay > closingDay) {
      isPostClosing = true;
    }
  } else {
    // Mês menor que o mês da fatura - mesmo ano
    year = invoiceYear;
    // Verificar se transação em meses anteriores mas após fechamento
    // Isso não deveria acontecer em fatura normal, mas manter lógica
  }

  return { year, isPostClosing };
}

// Generate future installment transactions with progressive due dates
function generateFutureInstallments(
  item: ProcessedInvoiceItem
): ProcessedInvoiceItem[] {
  if (!item.installment_current || !item.installment_total) {
    return [];
  }

  const remaining = item.installment_total - item.installment_current;
  if (remaining <= 0) {
    return [];
  }

  const futureItems: ProcessedInvoiceItem[] = [];
  
  // Parse base due date - this is critical for calculating future dates
  const baseDueDateParts = item.due_date.split('-');
  const baseDueYear = parseInt(baseDueDateParts[0], 10);
  const baseDueMonth = parseInt(baseDueDateParts[1], 10) - 1; // JS months are 0-indexed
  const baseDueDay = parseInt(baseDueDateParts[2], 10);
  
  // Clean description - remove current installment info
  const cleanDescription = item.description
    .replace(/\s*\d{1,2}\s*\/\s*\d{1,2}\s*$/g, '')
    .replace(/\s*\d{1,2}\s+de\s+\d{1,2}\s*$/gi, '')
    .replace(/\s*PARC(?:ELA)?\s*\d{1,2}\s*\/\s*\d{1,2}\s*/gi, '')
    .replace(/\s*\(\d{1,2}\s*\/\s*\d{1,2}\)\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  for (let i = 1; i <= remaining; i++) {
    // Calculate future due date by adding i months to the base due date
    // This correctly handles year transitions (e.g., Dec -> Jan next year)
    let futureMonth = baseDueMonth + i;
    let futureYear = baseDueYear;
    
    // Handle month overflow (year transition)
    while (futureMonth > 11) {
      futureMonth -= 12;
      futureYear += 1;
    }
    
    // Handle day adjustment for months with fewer days (e.g., day 31 in February)
    const maxDayInMonth = new Date(futureYear, futureMonth + 1, 0).getDate();
    const adjustedDay = Math.min(baseDueDay, maxDayInMonth);
    
    const futureDueDateStr = `${futureYear}-${String(futureMonth + 1).padStart(2, '0')}-${String(adjustedDay).padStart(2, '0')}`;
    
    const installmentNumber = item.installment_current + i;
    
    futureItems.push({
      purchase_date: item.purchase_date, // Mantém a data original da compra (imutável)
      posting_date: item.posting_date,
      due_date: futureDueDateStr, // Data de vencimento progressiva
      transaction_value: item.transaction_value,
      description: `${cleanDescription} ${installmentNumber}/${item.installment_total}`,
      installment_current: installmentNumber,
      installment_total: item.installment_total,
      is_post_closing: false,
    });
    
    console.log(`Future installment ${installmentNumber}/${item.installment_total}: due_date=${futureDueDateStr}`);
  }

  return futureItems;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GOOGLE_AI_API_KEY = Deno.env.get('GOOGLE_AI_API_KEY');
    if (!GOOGLE_AI_API_KEY) {
      throw new Error("GOOGLE_AI_API_KEY is not configured");
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const creditCardId = formData.get('credit_card_id') as string;
    const accountId = formData.get('account_id') as string;
    const mode = formData.get('mode') as string;
    const invoiceMonthStr = formData.get('invoice_month') as string;
    const invoiceYearStr = formData.get('invoice_year') as string;
    const closingDateStr = formData.get('closing_date') as string;

    if (!file) {
      throw new Error("No file provided");
    }

    const now = new Date();
    const postingDate = now.toISOString().split('T')[0]; // Data do upload
    const invoiceYear = invoiceYearStr ? parseInt(invoiceYearStr) : now.getFullYear();
    const invoiceMonth = invoiceMonthStr ? parseInt(invoiceMonthStr) : now.getMonth() + 1;
    const closingDay = closingDateStr ? parseInt(closingDateStr) : 10;
    
    const invoiceMonthName = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(
      new Date(invoiceYear, invoiceMonth - 1, 1)
    );

    console.log(`Processing file: ${file.name}, mode: ${mode || 'credit_card'}`);
    console.log(`Invoice period: ${invoiceMonthName}/${invoiceYear}, closing day: ${closingDay}`);
    console.log(`Posting date (today): ${postingDate}`);

    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    let binaryString = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, i + chunkSize);
      binaryString += String.fromCharCode.apply(null, Array.from(chunk));
    }
    const base64 = btoa(binaryString);
    const mimeType = file.type || 'application/pdf';

    const isAccountMode = mode === 'account';
    
    // Updated prompt for Itaú Personnalité invoices
    const systemPrompt = isAccountMode
      ? `Você é um assistente especializado em extrair dados de extratos bancários.

Extraia TODAS as transações encontradas no documento.

Para cada transação, retorne:
- date: Data no formato "DD/MM" (apenas dia e mês)
- description: Descrição da transação
- amount: Valor (positivo para entradas, negativo para saídas)

Retorne APENAS JSON válido no formato:
{
  "items": [
    {"date": "15/01", "description": "TED RECEBIDO", "amount": 5000.00},
    {"date": "16/01", "description": "PAGTO BOLETO", "amount": -150.50}
  ]
}`
      : `Você é um assistente especializado em extrair dados de faturas de cartão de crédito Itaú.

INSTRUÇÕES CRÍTICAS:

1. PRIMEIRO, extraia os metadados do cabeçalho:
   - "Vencimento: DD/MM/AAAA" -> due_date
   - "Total desta fatura R$ X.XXX,XX" -> invoice_total

2. PROCESSE APENAS a seção "Lançamentos: compras e saques":
   - Inicie a leitura quando encontrar "Lançamentos: compras e saques"
   - PARE a leitura quando encontrar "Total dos lançamentos atuais" ou "Compras parceladas - próximas faturas"

3. IGNORE COMPLETAMENTE:
   - A tabela "Compras parceladas - próximas faturas"
   - "Total para próximas faturas"
   - Qualquer coisa após "Total dos lançamentos atuais"
   - Taxas, juros, IOF, multas, pagamentos anteriores, créditos

4. Para cada linha de transação:
   - date: Data da coluna "DATA" no formato "DD/MM" (apenas dia e mês)
   - description: Nome do estabelecimento/compra (MANTENHA info de parcelas como "03/10")
   - amount: Valor EXATO da coluna (já é o valor da parcela, NÃO divida)

EXEMPLO: "ELECTROLUX electro03/10" com valor "56,99"
-> Grave: description="ELECTROLUX electro03/10", amount=56.99

Retorne APENAS JSON válido:
{
  "metadata": {
    "due_date": "15/01/2026",
    "invoice_total": 40733.78
  },
  "items": [
    {"date": "06/10", "description": "Porta3Acessorios 04/10", "amount": 151.30},
    {"date": "15/12", "description": "UBER *TRIP", "amount": 25.50}
  ]
}`;

    const userPrompt = isAccountMode
      ? `Extraia todas as movimentações deste extrato bancário. Retorne apenas o JSON com date no formato "DD/MM".`
      : `Extraia os dados desta fatura de cartão Itaú Personnalité seguindo as instruções. 
IMPORTANTE: 
- Extraia primeiro o vencimento e total da fatura do cabeçalho
- Processe APENAS "Lançamentos: compras e saques"
- IGNORE a tabela "Compras parceladas - próximas faturas"
- O valor de cada linha JÁ É o valor da parcela`;

    console.log("Sending to Google Gemini API...");

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GOOGLE_AI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { text: systemPrompt },
              { inline_data: { mime_type: mimeType, data: base64 } },
              { text: userPrompt }
            ]
          }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 65536,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns minutos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 403) {
        return new Response(
          JSON.stringify({ error: "API Key inválida ou sem permissão." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const aiResponse = await response.json();
    console.log("AI response received");
    
    if (aiResponse.promptFeedback?.blockReason) {
      console.error("Content blocked:", aiResponse.promptFeedback.blockReason);
      throw new Error(`Conteúdo bloqueado: ${aiResponse.promptFeedback.blockReason}`);
    }
    
    const content = aiResponse.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!content) {
      console.error("No content in response");
      throw new Error("Resposta vazia da IA");
    }

    // Parse JSON from AI response
    let rawItems: RawInvoiceItem[] = [];
    let metadata: InvoiceMetadata = { due_date: null, invoice_total: null };
    
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        rawItems = parsed.items || [];
        
        // Extract metadata if available
        if (parsed.metadata) {
          // Parse due_date from DD/MM/YYYY to YYYY-MM-DD
          if (parsed.metadata.due_date) {
            const dueDateParts = parsed.metadata.due_date.split('/');
            if (dueDateParts.length === 3) {
              metadata.due_date = `${dueDateParts[2]}-${dueDateParts[1].padStart(2, '0')}-${dueDateParts[0].padStart(2, '0')}`;
            }
          }
          metadata.invoice_total = parsed.metadata.invoice_total || null;
        }
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      throw new Error("Não foi possível processar o documento.");
    }

    console.log(`Extracted ${rawItems.length} raw items from AI`);
    console.log(`Metadata: due_date=${metadata.due_date}, invoice_total=${metadata.invoice_total}`);

    // Default due_date if not extracted (15th of invoice month)
    const defaultDueDate = `${invoiceYear}-${String(invoiceMonth).padStart(2, '0')}-15`;
    const dueDate = metadata.due_date || defaultDueDate;

    // Process items: infer year, detect installments, generate future installments
    const processedItems: ProcessedInvoiceItem[] = [];
    const futureInstallments: ProcessedInvoiceItem[] = [];
    let postClosingCount = 0;
    let calculatedTotal = 0;

    for (const rawItem of rawItems) {
      // Parse DD/MM from raw date
      const dateParts = rawItem.date.split('/');
      if (dateParts.length < 2) {
        console.warn(`Invalid date format: ${rawItem.date}, skipping`);
        continue;
      }
      
      const purchaseDay = parseInt(dateParts[0], 10);
      const purchaseMonth = parseInt(dateParts[1], 10);
      
      if (isNaN(purchaseDay) || isNaN(purchaseMonth)) {
        console.warn(`Invalid date values: ${rawItem.date}, skipping`);
        continue;
      }

      // Infer year based on invoice context
      const { year: purchaseYear, isPostClosing } = inferPurchaseYear(
        purchaseDay,
        purchaseMonth,
        invoiceMonth,
        invoiceYear,
        closingDay
      );

      const purchaseDate = `${purchaseYear}-${String(purchaseMonth).padStart(2, '0')}-${String(purchaseDay).padStart(2, '0')}`;

      // Detect installment pattern in description
      const installmentInfo = detectInstallmentPattern(rawItem.description);
      
      if (installmentInfo) {
        console.log(`Detected installment ${installmentInfo.current}/${installmentInfo.total} in: "${rawItem.description}"`);
      }

      const transactionValue = Math.abs(rawItem.amount);
      calculatedTotal += transactionValue;

      const processedItem: ProcessedInvoiceItem = {
        purchase_date: purchaseDate,
        posting_date: postingDate,
        due_date: dueDate,
        transaction_value: transactionValue,
        description: rawItem.description,
        installment_current: installmentInfo?.current,
        installment_total: installmentInfo?.total,
        is_post_closing: !isAccountMode && isPostClosing,
      };

      if (isPostClosing && !isAccountMode) {
        postClosingCount++;
        console.log(`Post-closing transaction detected: ${rawItem.description} on ${purchaseDate}`);
      }

      processedItems.push(processedItem);

      // Generate future installments for items with remaining installments
      if (!isAccountMode && installmentInfo && installmentInfo.current < installmentInfo.total) {
        const future = generateFutureInstallments(processedItem);
        futureInstallments.push(...future);
        console.log(`Generated ${future.length} future installments for: "${rawItem.description}"`);
      }
    }

    console.log(`Processed ${processedItems.length} items, ${futureInstallments.length} future installments`);
    console.log(`Calculated total: R$ ${calculatedTotal.toFixed(2)}`);
    
    // Validation: compare calculated total with invoice total
    let validationWarning: string | null = null;
    if (metadata.invoice_total) {
      const difference = Math.abs(calculatedTotal - metadata.invoice_total);
      console.log(`Invoice total from PDF: R$ ${metadata.invoice_total.toFixed(2)}, difference: R$ ${difference.toFixed(2)}`);
      
      if (difference > 1.00) {
        validationWarning = `Atenção: A soma dos itens (R$ ${calculatedTotal.toFixed(2)}) difere do total da fatura (R$ ${metadata.invoice_total.toFixed(2)}). Diferença: R$ ${difference.toFixed(2)}. Verifique se há encargos, IOF ou multas não listados.`;
        console.warn(validationWarning);
      }
    }

    if (postClosingCount > 0) {
      console.log(`${postClosingCount} transactions are after closing date (day ${closingDay})`);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        items: processedItems,
        future_installments: futureInstallments,
        post_closing_count: postClosingCount,
        credit_card_id: creditCardId,
        account_id: accountId,
        invoice_month: invoiceMonth,
        invoice_year: invoiceYear,
        closing_day: closingDay,
        due_date: dueDate,
        invoice_total: metadata.invoice_total,
        calculated_total: calculatedTotal,
        validation_warning: validationWarning,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error processing document:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Erro ao processar documento" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
