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
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
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

TAREFA: Extraia TODAS as transações/compras da fatura com PRECISÃO ABSOLUTA nos valores.

REGRAS CRÍTICAS DE PRECISÃO:
1. LEIA CADA VALOR EXATAMENTE COMO APARECE - não arredonde, não troque dígitos
2. Cada linha da fatura contém: DATA | DESCRIÇÃO | VALOR
3. O valor de cada transação está SEMPRE na mesma linha que sua descrição
4. NÃO associe valores de uma linha com descrições de outra linha
5. Confira duas vezes cada valor antes de incluir no resultado

CONTEXTO TEMPORAL E CICLO DE FATURA:
- Esta é a fatura de ${targetMonthName} de ${targetYear}
- O cartão fecha no dia ${closingDate} de cada mês
- Período: ${closingDate + 1}/${prevMonthName}/${prevYear} até ${closingDate}/${targetMonthName}/${targetYear}

REGRA PARA DETERMINAR O ANO/MÊS DE CADA COMPRA:
1. Dia > ${closingDate}: mês anterior (${prevMonthName}/${prevYear})
2. Dia <= ${closingDate}: mês atual (${targetMonthName}/${targetYear})

Para cada transação, extraia:
- date: Data da compra (YYYY-MM-DD)
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
LEMBRE-SE: O cartão fecha dia ${closingDate}. Compras com dia > ${closingDate} são de ${prevMonthName}/${prevYear}. Compras com dia <= ${closingDate} são de ${targetMonthName}/${targetYear}. 
Retorne apenas o JSON.`;

    console.log("Sending to Lovable AI for processing...");

    // Call Lovable AI Gateway
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0,
        messages: [
          { role: "system", content: systemPrompt },
          { 
            role: "user", 
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64}`
                }
              },
              {
                type: "text",
                text: userPrompt
              }
            ]
          }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns minutos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes. Adicione créditos na sua conta Lovable." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;
    
    console.log("AI response received:", content);

    if (!content) {
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
