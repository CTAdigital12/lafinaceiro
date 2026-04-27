import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";
import { buildCorsHeaders } from "../_shared/cors.ts";

// ----------------------------------------------------------------------------
// Zod schemas for validating the JSON returned by Gemini (R23).
// ----------------------------------------------------------------------------
// The Gemini prompts ask for two different shapes depending on `mode`:
//   - account     -> { items: [{ date, description, amount }] }
//   - credit_card -> { metadata: { due_date, invoice_total }, items: [...] }
// We validate strictly: unknown fields are rejected so a hostile/malformed
// model answer cannot smuggle extra columns into our DB inserts.

const RawInvoiceItemSchema = z
  .object({
    // Gemini is told to return "DD/MM"; we accept "D/M" through "DD/MM" too.
    date: z.string().min(3).max(5).regex(/^\d{1,2}\/\d{1,2}$/),
    description: z.string().min(1).max(500),
    amount: z.number().finite(),
  })
  .strict();

const InvoiceMetadataSchema = z
  .object({
    // "DD/MM/YYYY" — kept loose enough for the existing split('/') parser.
    due_date: z
      .string()
      .regex(/^\d{1,2}\/\d{1,2}\/\d{4}$/)
      .nullable()
      .optional(),
    invoice_total: z.number().finite().nullable().optional(),
  })
  .strict();

const ParsedInvoiceSchema = z
  .object({
    metadata: InvoiceMetadataSchema.optional(),
    items: z.array(RawInvoiceItemSchema).max(2000),
  })
  .strict();

interface RawInvoiceItem {
  date: string;
  description: string;
  amount: number;
}

interface ProcessedInvoiceItem {
  purchase_date: string;
  posting_date: string;
  due_date: string;
  transaction_value: number;
  description: string;
  installment_current?: number;
  installment_total?: number;
  is_post_closing?: boolean;
  installment_group_id?: string;
}

interface InvoiceMetadata {
  due_date: string | null;
  invoice_total: number | null;
}

// Detect installment pattern in description using regex
function detectInstallmentPattern(description: string): { current: number; total: number } | null {
  const patterns = [
    /(\d{1,2})\s*\/\s*(\d{1,2})\s*$/i,
    /(\d{1,2})\s+de\s+(\d{1,2})\s*$/i,
    /PARC(?:ELA)?\s*(\d{1,2})\s*\/\s*(\d{1,2})/i,
    /\((\d{1,2})\s*\/\s*(\d{1,2})\)\s*$/i,
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match) {
      const current = parseInt(match[1], 10);
      const total = parseInt(match[2], 10);
      
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

  if (purchaseMonth > invoiceMonth) {
    year = invoiceYear - 1;
  } else if (purchaseMonth === invoiceMonth) {
    year = invoiceYear;
    if (purchaseDay > closingDay) {
      isPostClosing = true;
    }
  } else {
    year = invoiceYear;
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
  
  const baseDueDateParts = item.due_date.split('-');
  const baseDueYear = parseInt(baseDueDateParts[0], 10);
  const baseDueMonth = parseInt(baseDueDateParts[1], 10) - 1;
  const baseDueDay = parseInt(baseDueDateParts[2], 10);
  
  const cleanDescription = item.description
    .replace(/\s*\d{1,2}\s*\/\s*\d{1,2}\s*$/g, '')
    .replace(/\s*\d{1,2}\s+de\s+\d{1,2}\s*$/gi, '')
    .replace(/\s*PARC(?:ELA)?\s*\d{1,2}\s*\/\s*\d{1,2}\s*/gi, '')
    .replace(/\s*\(\d{1,2}\s*\/\s*\d{1,2}\)\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  for (let i = 1; i <= remaining; i++) {
    let futureMonth = baseDueMonth + i;
    let futureYear = baseDueYear;
    
    while (futureMonth > 11) {
      futureMonth -= 12;
      futureYear += 1;
    }
    
    const maxDayInMonth = new Date(futureYear, futureMonth + 1, 0).getDate();
    const adjustedDay = Math.min(baseDueDay, maxDayInMonth);
    
    const futureDueDateStr = `${futureYear}-${String(futureMonth + 1).padStart(2, '0')}-${String(adjustedDay).padStart(2, '0')}`;
    
    const installmentNumber = item.installment_current + i;
    
    futureItems.push({
      purchase_date: item.purchase_date,
      posting_date: item.posting_date,
      due_date: futureDueDateStr,
      transaction_value: item.transaction_value,
      description: `${cleanDescription} ${installmentNumber}/${item.installment_total}`,
      installment_current: installmentNumber,
      installment_total: item.installment_total,
      is_post_closing: false,
      installment_group_id: item.installment_group_id, // Share the same group ID
    });
  }

  return futureItems;
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get('origin'));
  const requestId = crypto.randomUUID();

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // ================================================================
  // SECURITY (R24): AI kill-switch. Toggled in <1min via Supabase
  // secrets without redeploy. Convention: explicitly === "true";
  // anything else (missing, "false", "yes", "1") means OFF.
  // ================================================================
  if (Deno.env.get('AI_PARSE_INVOICE_ENABLED') !== 'true') {
    console.warn(`[parse-invoice] ${requestId} kill-switch off — request rejected`);
    return new Response(
      JSON.stringify({
        error: 'feature_disabled',
        message: 'Parse de fatura por IA está temporariamente desabilitado.',
      }),
      { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // ================================================================
    // SECURITY: Authentication Validation (Zero Trust)
    // ================================================================
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('Security: Missing or invalid Authorization header');
      return new Response(
        JSON.stringify({ error: 'Acesso não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate the JWT token
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      console.error('Security: Invalid JWT token', claimsError?.message);
      return new Response(
        JSON.stringify({ error: 'Sessão inválida ou expirada' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.claims.sub;
    console.log(`Authenticated user: ${userId}`);
    // ================================================================

    const GOOGLE_AI_API_KEY = Deno.env.get('GOOGLE_AI_API_KEY');
    if (!GOOGLE_AI_API_KEY) {
      console.error('Configuration error: GOOGLE_AI_API_KEY not set');
      return new Response(
        JSON.stringify({ error: 'Erro de configuração do servidor' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
      return new Response(
        JSON.stringify({ error: 'Nenhum arquivo enviado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const now = new Date();
    const postingDate = now.toISOString().split('T')[0];
    const invoiceYear = invoiceYearStr ? parseInt(invoiceYearStr) : now.getFullYear();
    const invoiceMonth = invoiceMonthStr ? parseInt(invoiceMonthStr) : now.getMonth() + 1;
    const closingDay = closingDateStr ? parseInt(closingDateStr) : 10;
    
    const invoiceMonthName = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(
      new Date(invoiceYear, invoiceMonth - 1, 1)
    );

    console.log(`Processing file: ${file.name}, mode: ${mode || 'credit_card'}, user: ${userId}`);
    console.log(`Invoice period: ${invoiceMonthName}/${invoiceYear}, closing day: ${closingDay}`);

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
      console.error("Gemini API error:", response.status);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns minutos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 403) {
        return new Response(
          JSON.stringify({ error: "Erro de configuração do servidor" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: "Erro ao processar documento" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResponse = await response.json();
    console.log("AI response received");
    
    if (aiResponse.promptFeedback?.blockReason) {
      console.error("Content blocked:", aiResponse.promptFeedback.blockReason);
      return new Response(
        JSON.stringify({ error: "Conteúdo do documento não pôde ser processado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const content = aiResponse.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!content) {
      console.error("No content in response");
      return new Response(
        JSON.stringify({ error: "Não foi possível extrair dados do documento" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ================================================================
    // SECURITY (R23): Strictly validate Gemini's JSON output before any
    // database access. Unknown fields are rejected; malformed shapes
    // return 422 with a request_id for log correlation (we never echo
    // the PDF content).
    // ================================================================
    let rawItems: RawInvoiceItem[] = [];
    const metadata: InvoiceMetadata = { due_date: null, invoice_total: null };

    let parsedJson: unknown;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("no_json_block");
      }
      parsedJson = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error(`[parse-invoice] ${requestId} JSON.parse failed`);
      return new Response(
        JSON.stringify({ error: "invalid_ai_output", request_id: requestId }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validation = ParsedInvoiceSchema.safeParse(parsedJson);
    if (!validation.success) {
      console.error(
        `[parse-invoice] ${requestId} Zod validation failed:`,
        JSON.stringify(validation.error.issues)
      );
      return new Response(
        JSON.stringify({
          error: "invalid_ai_output",
          request_id: requestId,
          issues: validation.error.issues,
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    rawItems = validation.data.items;

    if (validation.data.metadata) {
      const meta = validation.data.metadata;
      if (meta.due_date) {
        const dueDateParts = meta.due_date.split('/');
        if (dueDateParts.length === 3) {
          metadata.due_date = `${dueDateParts[2]}-${dueDateParts[1].padStart(2, '0')}-${dueDateParts[0].padStart(2, '0')}`;
        }
      }
      metadata.invoice_total = meta.invoice_total ?? null;
    }

    console.log(`[parse-invoice] ${requestId} Extracted ${rawItems.length} raw items from AI`);

    const defaultDueDate = `${invoiceYear}-${String(invoiceMonth).padStart(2, '0')}-15`;
    const dueDate = metadata.due_date || defaultDueDate;

    const processedItems: ProcessedInvoiceItem[] = [];
    const futureInstallments: ProcessedInvoiceItem[] = [];
    let postClosingCount = 0;
    let calculatedTotal = 0;

    for (const rawItem of rawItems) {
      const dateParts = rawItem.date.split('/');
      if (dateParts.length < 2) {
        continue;
      }
      
      const purchaseDay = parseInt(dateParts[0], 10);
      const purchaseMonth = parseInt(dateParts[1], 10);
      
      if (isNaN(purchaseDay) || isNaN(purchaseMonth)) {
        continue;
      }

      const { year: purchaseYear, isPostClosing } = inferPurchaseYear(
        purchaseDay,
        purchaseMonth,
        invoiceMonth,
        invoiceYear,
        closingDay
      );

      const purchaseDate = `${purchaseYear}-${String(purchaseMonth).padStart(2, '0')}-${String(purchaseDay).padStart(2, '0')}`;

      const installmentInfo = detectInstallmentPattern(rawItem.description);

      const transactionValue = Math.abs(rawItem.amount);
      calculatedTotal += transactionValue;

      // Generate installment_group_id for installments
      const hasInstallments = installmentInfo && installmentInfo.total > 1;
      const installmentGroupId = hasInstallments ? crypto.randomUUID() : undefined;

      const processedItem: ProcessedInvoiceItem = {
        purchase_date: purchaseDate,
        posting_date: postingDate,
        due_date: dueDate,
        transaction_value: transactionValue,
        description: rawItem.description,
        installment_current: installmentInfo?.current,
        installment_total: installmentInfo?.total,
        is_post_closing: !isAccountMode && isPostClosing,
        installment_group_id: installmentGroupId,
      };

      if (isPostClosing && !isAccountMode) {
        postClosingCount++;
      }

      processedItems.push(processedItem);

      if (!isAccountMode && installmentInfo && installmentInfo.current < installmentInfo.total) {
        const future = generateFutureInstallments(processedItem);
        futureInstallments.push(...future);
      }
    }

    console.log(`Processed ${processedItems.length} items for user ${userId}`);

    let validationWarning: string | null = null;
    if (metadata.invoice_total) {
      const difference = Math.abs(calculatedTotal - metadata.invoice_total);
      
      if (difference > 1.00) {
        validationWarning = `Atenção: A soma dos itens (R$ ${calculatedTotal.toFixed(2)}) difere do total da fatura (R$ ${metadata.invoice_total.toFixed(2)}). Diferença: R$ ${difference.toFixed(2)}. Verifique se há encargos, IOF ou multas não listados.`;
      }
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
        due_date: dueDate,
        invoice_total: metadata.invoice_total,
        calculated_total: calculatedTotal,
        validation_warning: validationWarning,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    // SECURITY: Never expose internal error details
    console.error("Edge function error:", error);
    return new Response(
      JSON.stringify({ error: "Erro ao processar solicitação" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
