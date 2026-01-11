import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InvoiceItem {
  date: string;
  description: string;
  amount: number;
  installment_current?: number;  // Current installment number (e.g., 2 in "2/12")
  installment_total?: number;    // Total installments (e.g., 12 in "2/12")
}

serve(async (req) => {
  // Handle CORS preflight requests
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
    const mode = formData.get('mode') as string; // 'account' or 'credit_card' (default)
    const invoiceMonth = formData.get('invoice_month') as string;
    const invoiceYear = formData.get('invoice_year') as string;
    const closingDateStr = formData.get('closing_date') as string;

    if (!file) {
      throw new Error("No file provided");
    }

    // Determine the year and month to use for date interpretation
    const now = new Date();
    const targetYear = invoiceYear ? parseInt(invoiceYear) : now.getFullYear();
    const targetMonth = invoiceMonth ? parseInt(invoiceMonth) : now.getMonth() + 1;
    const closingDate = closingDateStr ? parseInt(closingDateStr) : 10; // default to day 10
    const targetMonthName = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date(targetYear, targetMonth - 1, 1));
    
    // Calculate previous month and year for billing cycle logic
    const prevMonth = targetMonth === 1 ? 12 : targetMonth - 1;
    const prevYear = targetMonth === 1 ? targetYear - 1 : targetYear;
    const prevMonthName = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date(prevYear, prevMonth - 1, 1));

    console.log(`Processing file: ${file.name}, type: ${file.type}, size: ${file.size}, mode: ${mode || 'credit_card'}, period: ${targetMonth}/${targetYear}, closingDate: ${closingDate}`);

    // Convert file to base64 (using chunks to avoid stack overflow)
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

    // Prepare prompt based on mode with correct year context
    const isAccountMode = mode === 'account';
    
    const systemPrompt = isAccountMode
      ? `Você é um assistente especializado em extrair dados de extratos bancários.
    
Analise o documento fornecido e extraia TODAS as transações/movimentações encontradas.

CONTEXTO TEMPORAL IMPORTANTE:
- Este é um extrato de ${targetMonthName} de ${targetYear}
- Use o ano ${targetYear} para TODAS as datas encontradas
- Se uma data aparecer como "15/01" ou "15 JAN", interprete como ${targetYear}-01-15

Para cada transação, extraia:
- date: Data da transação no formato YYYY-MM-DD (use o ano ${targetYear})
- description: Descrição da transação
- amount: Valor em reais (número, positivo para entradas/depósitos, negativo para saídas/pagamentos)

IMPORTANTE:
- Valores positivos = Entradas (depósitos, salários, transferências recebidas, etc.)
- Valores negativos = Saídas (pagamentos, saques, transferências enviadas, etc.)
- Retorne APENAS um JSON válido, sem texto adicional

Formato de resposta esperado:
{
  "items": [
    {"date": "${targetYear}-01-15", "description": "TED RECEBIDO - SALARIO", "amount": 5000.00},
    {"date": "${targetYear}-01-16", "description": "PAGTO BOLETO - LUZ", "amount": -150.50}
  ]
}`
      : `Você é um assistente de OCR altamente preciso, especializado em extrair dados de faturas de cartão de crédito.

TAREFA: Extraia TODAS as transações/compras da fatura com PRECISÃO ABSOLUTA nos valores e datas.

REGRAS CRÍTICAS DE PRECISÃO:
1. LEIA CADA VALOR EXATAMENTE COMO APARECE - não arredonde, não troque dígitos
2. Cada linha da fatura contém: DATA | DESCRIÇÃO | VALOR
3. O valor de cada transação está SEMPRE na mesma linha que sua descrição
4. NÃO associe valores de uma linha com descrições de outra linha
5. Confira duas vezes cada valor antes de incluir no resultado

CICLO DA FATURA - ENTENDA BEM:
- Esta é a fatura de referência: ${targetMonthName.toUpperCase()} de ${targetYear}
- O cartão FECHA no dia ${closingDate} de cada mês
- PERÍODO COBRADO: dia ${closingDate + 1} de ${prevMonthName}/${prevYear} ATÉ dia ${closingDate} de ${targetMonthName}/${targetYear}

REGRA CRÍTICA PARA DETERMINAR A DATA CORRETA:
- Se a data do documento mostra dia > ${closingDate} (ex: dia 15, 20, 25, 29...):
  → Essa compra é do MÊS ANTERIOR: ${prevMonthName.toUpperCase()} de ${prevYear}
  → Exemplo: "29/01" ou "29 JAN" → deve ser ${prevYear}-${String(prevMonth).padStart(2, '0')}-29

- Se a data do documento mostra dia <= ${closingDate} (ex: dia 1, 2, 3... até ${closingDate}):
  → Essa compra é do MÊS DA FATURA: ${targetMonthName.toUpperCase()} de ${targetYear}
  → Exemplo: "05/01" ou "05 JAN" → deve ser ${targetYear}-${String(targetMonth).padStart(2, '0')}-05

EXEMPLOS CONCRETOS (fatura ${targetMonthName}/${targetYear}, fechamento dia ${closingDate}):
| No documento | Data correta    | Porque                                |
|--------------|-----------------|---------------------------------------|
| 09/${String(prevMonth).padStart(2, '0')}       | ${prevYear}-${String(prevMonth).padStart(2, '0')}-09 | Dia 9 <= ${closingDate}? Não, é > ${closingDate}, então ${prevMonthName}/${prevYear} |
| 25/${String(prevMonth).padStart(2, '0')}       | ${prevYear}-${String(prevMonth).padStart(2, '0')}-25 | Dia 25 > ${closingDate}, então ${prevMonthName}/${prevYear}            |
| 29/01        | ${prevYear}-${String(prevMonth).padStart(2, '0')}-29 | Dia 29 > ${closingDate}, então ${prevMonthName}/${prevYear} (NÃO janeiro!) |
| 05/01        | ${targetYear}-${String(targetMonth).padStart(2, '0')}-05 | Dia 5 <= ${closingDate}, então ${targetMonthName}/${targetYear}         |
| 08/01        | ${targetYear}-${String(targetMonth).padStart(2, '0')}-08 | Dia 8 <= ${closingDate}, então ${targetMonthName}/${targetYear}         |

Para cada transação, extraia:
- date: Data da compra (YYYY-MM-DD) - SIGA A REGRA ACIMA!
- description: Nome do estabelecimento (sem cidade, sem categoria)
- amount: Valor EXATO em reais (número positivo, sem R$). LEIA COM CUIDADO!
- installment_current: Número da parcela atual (se parcelada)
- installment_total: Total de parcelas (se parcelada)

IGNORE: taxas, juros, pagamentos, créditos, saldo anterior, total da fatura

IDENTIFICAR PARCELAS: Padrões como "2/12", "PARC 3/6", "03 DE 10", "(5/12)"

Formato JSON:
{
  "items": [
    {"date": "${prevYear}-${String(prevMonth).padStart(2, '0')}-15", "description": "UBER *TRIP", "amount": 25.50},
    {"date": "${prevYear}-${String(prevMonth).padStart(2, '0')}-28", "description": "MAGAZINELUIZA", "amount": 299.90, "installment_current": 3, "installment_total": 10}
  ]
}`;

    const userPrompt = isAccountMode
      ? `Extraia todas as movimentações deste extrato bancário de ${targetMonthName}/${targetYear}. Use o ano ${targetYear} para todas as datas. Retorne apenas o JSON.`
      : `Extraia todas as transações/compras desta fatura de cartão de crédito de ${targetMonthName}/${targetYear}. 

ATENÇÃO CRÍTICA NAS DATAS:
- Fechamento: dia ${closingDate}
- Se dia > ${closingDate} → usar ${prevMonthName}/${prevYear}
- Se dia <= ${closingDate} → usar ${targetMonthName}/${targetYear}
- Data "29/01" com fechamento dia ${closingDate} = ${prevYear}-${String(prevMonth).padStart(2, '0')}-29 (NÃO ${targetYear}-01-29!)

Retorne apenas o JSON.`;

    console.log("Sending to Google Gemini API for processing...");

    // Call Google Gemini API directly
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GOOGLE_AI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: systemPrompt },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64
                }
              },
              { text: userPrompt }
            ]
          }
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 65536,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Google Gemini API error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns minutos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 403) {
        return new Response(JSON.stringify({ error: "API Key inválida ou sem permissão. Verifique sua chave do Google AI." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`Google Gemini API error: ${response.status}`);
    }

    const aiResponse = await response.json();
    console.log("Full AI response:", JSON.stringify(aiResponse, null, 2));
    
    // Check for blocked content or other issues
    if (aiResponse.promptFeedback?.blockReason) {
      console.error("Content blocked:", aiResponse.promptFeedback.blockReason);
      throw new Error(`Conteúdo bloqueado: ${aiResponse.promptFeedback.blockReason}`);
    }
    
    const content = aiResponse.candidates?.[0]?.content?.parts?.[0]?.text;
    
    console.log("AI response content:", content);

    if (!content) {
      // Log more details about the response structure
      console.error("No content found. Candidates:", JSON.stringify(aiResponse.candidates));
      throw new Error("No content in AI response");
    }

    // Parse the JSON response from AI
    let items: InvoiceItem[] = [];
    try {
      // Try to extract JSON from the response (AI might wrap it in markdown code blocks)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        items = parsed.items || [];
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      throw new Error("Não foi possível processar o documento. Tente novamente ou use outro formato.");
    }

    // For credit card invoices, we should NOT correct future dates since they represent 
    // future installments that are legitimate. Only correct if date is way off (more than 1 year in future).
    // For account statements, we can be stricter since they are historical.
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const oneYearFromNow = new Date(today);
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
    
    items = items.map(item => {
      const itemDate = new Date(item.date + 'T12:00:00Z');
      
      if (isAccountMode) {
        // For account mode, dates should not be in the future at all
        if (itemDate > today) {
          const correctedDate = new Date(itemDate);
          correctedDate.setFullYear(correctedDate.getFullYear() - 1);
          const correctedDateStr = correctedDate.toISOString().split('T')[0];
          console.log(`Corrected future date (account mode): ${item.date} -> ${correctedDateStr} for "${item.description}"`);
          return { ...item, date: correctedDateStr };
        }
      } else {
        // For credit card mode, only correct if date is more than 1 year in the future (clearly wrong)
        if (itemDate > oneYearFromNow) {
          const correctedDate = new Date(itemDate);
          correctedDate.setFullYear(correctedDate.getFullYear() - 1);
          const correctedDateStr = correctedDate.toISOString().split('T')[0];
          console.log(`Corrected far future date (credit card mode): ${item.date} -> ${correctedDateStr} for "${item.description}"`);
          return { ...item, date: correctedDateStr };
        }
      }
      return item;
    });

    console.log(`Extracted ${items.length} items from document`);

    return new Response(JSON.stringify({ 
      success: true, 
      items,
      creditCardId,
      accountId
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error processing document:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Erro ao processar documento" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
