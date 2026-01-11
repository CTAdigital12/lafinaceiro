import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RawInvoiceItem {
  date: string;           // Can be "DD/MM", "DD-MM-YYYY", or "YYYY-MM-DD"
  description: string;
  amount: number;
  installment_current?: number;
  installment_total?: number;
}

interface ProcessedInvoiceItem {
  date: string;           // Always "YYYY-MM-DD"
  description: string;
  amount: number;
  installment_current?: number;
  installment_total?: number;
  is_post_closing?: boolean;  // Flag for items that fall into next billing cycle
}

// Detect installment pattern in description using regex
function detectInstallmentPattern(description: string): { current: number; total: number } | null {
  // Patterns to match:
  // "3/10", "03/10", "3 de 10", "03 de 10"
  // "PARC 3/6", "PARC 03/06"
  // "(3/10)", "(03/10)"
  // "Parcela 3/10", "Parcela 03 de 10"
  
  const patterns = [
    /(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*-?\s*Parcela)?/i,         // "3/10" or "03/10"
    /(\d{1,2})\s+de\s+(\d{1,2})/i,                              // "3 de 10"
    /PARC(?:ELA)?\s*(\d{1,2})\s*\/\s*(\d{1,2})/i,              // "PARC 3/6" or "PARCELA 3/6"
    /\((\d{1,2})\s*\/\s*(\d{1,2})\)/i,                          // "(3/10)"
    /Parcela\s+(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})/i,            // "Parcela 3/10" or "Parcela 3 de 10"
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

// Parse date from various formats and infer year based on invoice context
function inferFullDate(
  rawDate: string, 
  invoiceMonth: number, 
  invoiceYear: number,
  closingDay: number
): { date: string; isPostClosing: boolean } {
  let day: number;
  let month: number;
  let year: number;
  let isPostClosing = false;

  // Try to parse different date formats
  if (rawDate.includes('-') && rawDate.split('-')[0].length === 4) {
    // Already in YYYY-MM-DD format
    const parts = rawDate.split('-');
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    day = parseInt(parts[2], 10);
  } else if (rawDate.includes('/')) {
    // DD/MM or DD/MM/YYYY format
    const parts = rawDate.split('/');
    day = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    year = parts[2] ? parseInt(parts[2], 10) : 0; // Will be inferred if not present
  } else {
    // Try DD-MM or DD-MM-YYYY
    const parts = rawDate.split('-');
    day = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    year = parts[2] ? parseInt(parts[2], 10) : 0;
  }

  // If year is missing or seems wrong (2-digit or clearly wrong), infer it
  if (!year || year < 100 || year < 2020 || year > 2030) {
    // Apply year inference algorithm:
    // If transaction month > invoice month, the transaction happened in the previous year
    // Example: Invoice is January 2026, transaction month is December -> transaction is December 2025
    if (month > invoiceMonth) {
      year = invoiceYear - 1;
    } else {
      year = invoiceYear;
    }
  }

  // Check if transaction is after closing date (belongs to next billing cycle)
  // This only applies to transactions in the current invoice month
  if (month === invoiceMonth && day > closingDay) {
    isPostClosing = true;
  }

  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  
  return { date: dateStr, isPostClosing };
}

// Generate future installment transactions
function generateFutureInstallments(
  item: ProcessedInvoiceItem,
  closingDay: number
): ProcessedInvoiceItem[] {
  if (!item.installment_current || !item.installment_total) {
    return [];
  }

  const remaining = item.installment_total - item.installment_current;
  if (remaining <= 0) {
    return [];
  }

  const futureItems: ProcessedInvoiceItem[] = [];
  const baseDate = new Date(item.date + 'T12:00:00Z');
  
  // Clean description - remove current installment info
  const cleanDescription = item.description
    .replace(/\s*\d{1,2}\s*\/\s*\d{1,2}\s*/g, ' ')
    .replace(/\s*\d{1,2}\s+de\s+\d{1,2}\s*/gi, ' ')
    .replace(/\s*PARC(?:ELA)?\s*\d{1,2}\s*\/\s*\d{1,2}\s*/gi, ' ')
    .replace(/\s*\(\d{1,2}\s*\/\s*\d{1,2}\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (let i = 1; i <= remaining; i++) {
    const futureDate = new Date(baseDate);
    futureDate.setMonth(futureDate.getMonth() + i);
    
    const installmentNumber = item.installment_current + i;
    
    futureItems.push({
      date: futureDate.toISOString().split('T')[0],
      description: `${cleanDescription} ${installmentNumber}/${item.installment_total}`,
      amount: item.amount,
      installment_current: installmentNumber,
      installment_total: item.installment_total,
      is_post_closing: false, // Future installments are planned, not post-closing
    });
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
    const invoiceYear = invoiceYearStr ? parseInt(invoiceYearStr) : now.getFullYear();
    const invoiceMonth = invoiceMonthStr ? parseInt(invoiceMonthStr) : now.getMonth() + 1;
    const closingDay = closingDateStr ? parseInt(closingDateStr) : 10;
    
    const invoiceMonthName = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(
      new Date(invoiceYear, invoiceMonth - 1, 1)
    );
    
    // Calculate billing cycle dates
    const cycleStartMonth = invoiceMonth === 1 ? 12 : invoiceMonth - 1;
    const cycleStartYear = invoiceMonth === 1 ? invoiceYear - 1 : invoiceYear;
    const cycleStartDay = closingDay + 1;
    const cycleEndDay = closingDay;
    
    const cycleStartMonthName = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(
      new Date(cycleStartYear, cycleStartMonth - 1, 1)
    );

    console.log(`Processing file: ${file.name}, mode: ${mode || 'credit_card'}`);
    console.log(`Invoice period: ${invoiceMonthName}/${invoiceYear}, closing day: ${closingDay}`);
    console.log(`Billing cycle: ${cycleStartDay}/${cycleStartMonthName}/${cycleStartYear} to ${cycleEndDay}/${invoiceMonthName}/${invoiceYear}`);

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
    
    // Simplified prompt - ask AI to extract only day/month, we handle year logic
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
      : `Você é um assistente especializado em extrair dados de faturas de cartão de crédito.

IMPORTANTE: Extraia APENAS o DIA e MÊS de cada transação. NÃO tente determinar o ano.

Para cada compra/transação:
- date: Data no formato "DD/MM" (APENAS dia e mês, sem ano)
- description: Nome do estabelecimento/compra (mantenha info de parcelas como "3/10")
- amount: Valor EXATO em reais (positivo, sem R$)

IGNORE: taxas, juros, pagamentos, créditos, saldo anterior, total da fatura

Retorne APENAS JSON válido:
{
  "items": [
    {"date": "15/12", "description": "UBER *TRIP", "amount": 25.50},
    {"date": "28/12", "description": "MAGAZINELUIZA 3/10", "amount": 299.90}
  ]
}`;

    const userPrompt = isAccountMode
      ? `Extraia todas as movimentações deste extrato bancário. Retorne apenas o JSON com date no formato "DD/MM".`
      : `Extraia todas as compras desta fatura de cartão de crédito. Retorne apenas o JSON com date no formato "DD/MM" e mantenha informações de parcelas na descrição.`;

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
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        rawItems = parsed.items || [];
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      throw new Error("Não foi possível processar o documento.");
    }

    console.log(`Extracted ${rawItems.length} raw items from AI`);

    // Process items: infer year, detect installments, generate future installments
    const processedItems: ProcessedInvoiceItem[] = [];
    const futureInstallments: ProcessedInvoiceItem[] = [];
    let postClosingCount = 0;

    for (const rawItem of rawItems) {
      // Infer full date with year
      const { date, isPostClosing } = inferFullDate(
        rawItem.date,
        invoiceMonth,
        invoiceYear,
        closingDay
      );

      // Detect installment pattern in description if not already provided
      let installmentCurrent = rawItem.installment_current;
      let installmentTotal = rawItem.installment_total;
      
      if (!installmentCurrent || !installmentTotal) {
        const detected = detectInstallmentPattern(rawItem.description);
        if (detected) {
          installmentCurrent = detected.current;
          installmentTotal = detected.total;
          console.log(`Detected installment ${detected.current}/${detected.total} in: "${rawItem.description}"`);
        }
      }

      const processedItem: ProcessedInvoiceItem = {
        date,
        description: rawItem.description,
        amount: Math.abs(rawItem.amount), // Ensure positive for expenses
        installment_current: installmentCurrent,
        installment_total: installmentTotal,
        is_post_closing: !isAccountMode && isPostClosing,
      };

      if (isPostClosing && !isAccountMode) {
        postClosingCount++;
        console.log(`Post-closing transaction detected: ${rawItem.description} on ${date}`);
      }

      processedItems.push(processedItem);

      // Generate future installments for items with remaining installments
      if (!isAccountMode && installmentCurrent && installmentTotal && installmentCurrent < installmentTotal) {
        const future = generateFutureInstallments(processedItem, closingDay);
        futureInstallments.push(...future);
        console.log(`Generated ${future.length} future installments for: "${rawItem.description}"`);
      }
    }

    console.log(`Processed ${processedItems.length} items, ${futureInstallments.length} future installments`);
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
