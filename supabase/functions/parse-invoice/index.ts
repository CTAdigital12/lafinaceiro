import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InvoiceItem {
  date: string;
  description: string;
  amount: number;
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

    if (!file) {
      throw new Error("No file provided");
    }

    console.log(`Processing file: ${file.name}, type: ${file.type}, size: ${file.size}`);

    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    const mimeType = file.type || 'application/pdf';

    // Prepare prompt for AI to extract invoice data
    const systemPrompt = `Você é um assistente especializado em extrair dados de faturas de cartão de crédito.
    
Analise o documento fornecido e extraia TODAS as transações/compras encontradas.

Para cada transação, extraia:
- date: Data da compra no formato YYYY-MM-DD
- description: Descrição/estabelecimento da compra
- amount: Valor em reais (número positivo, sem R$)

IMPORTANTE:
- Ignore taxas, juros, pagamentos e créditos
- Foque apenas nas compras/gastos
- Se não conseguir identificar a data exata, use a data do lançamento
- Retorne APENAS um JSON válido, sem texto adicional

Formato de resposta esperado:
{
  "items": [
    {"date": "2024-01-15", "description": "UBER *TRIP", "amount": 25.50},
    {"date": "2024-01-16", "description": "NETFLIX.COM", "amount": 55.90}
  ]
}`;

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
                text: "Extraia todas as transações/compras desta fatura de cartão de crédito. Retorne apenas o JSON."
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
      throw new Error("Não foi possível processar a fatura. Tente novamente ou use outro formato.");
    }

    console.log(`Extracted ${items.length} items from invoice`);

    return new Response(JSON.stringify({ 
      success: true, 
      items,
      creditCardId 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error processing invoice:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Erro ao processar fatura" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});