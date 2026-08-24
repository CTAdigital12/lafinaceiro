import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

const PLUGGY_API = "https://api.pluggy.ai";

async function getPluggyApiKey(): Promise<string> {
  const clientId = Deno.env.get("PLUGGY_CLIENT_ID")!;
  const clientSecret = Deno.env.get("PLUGGY_CLIENT_SECRET")!;

  const res = await fetch(`${PLUGGY_API}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pluggy auth failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.apiKey;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const userId = claimsData.claims.sub;
    const body = await req.json().catch(() => ({}));
    const { action, itemId } = body;

    const apiKey = await getPluggyApiKey();

    if (action === "create_connect_token") {
      // Generate a connect token for the Pluggy Connect Widget
      const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/pluggy-webhook`;

      const tokenRes = await fetch(`${PLUGGY_API}/connect_token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": apiKey,
        },
        body: JSON.stringify({
          options: {
            clientUserId: userId,
            webhookUrl,
            avoidDuplicates: true,
          },
        }),
      });

      if (!tokenRes.ok) {
        const text = await tokenRes.text();
        throw new Error(`Connect token failed: ${tokenRes.status} ${text}`);
      }

      const tokenData = await tokenRes.json();
      return new Response(JSON.stringify({ accessToken: tokenData.accessToken }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get_item" && itemId) {
      // Get item details from Pluggy
      const itemRes = await fetch(`${PLUGGY_API}/items/${itemId}`, {
        headers: { "X-API-KEY": apiKey },
      });

      if (!itemRes.ok) {
        const text = await itemRes.text();
        throw new Error(`Get item failed: ${itemRes.status} ${text}`);
      }

      const itemData = await itemRes.json();
      return new Response(JSON.stringify(itemData), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "save_item" && itemId) {
      // After widget success: fetch item details, create accounts/cards, save pluggy_item
      const itemRes = await fetch(`${PLUGGY_API}/items/${itemId}`, {
        headers: { "X-API-KEY": apiKey },
      });
      if (!itemRes.ok) throw new Error("Failed to fetch item");
      const item = await itemRes.json();

      // Fetch accounts from Pluggy
      const accRes = await fetch(`${PLUGGY_API}/accounts?itemId=${itemId}`, {
        headers: { "X-API-KEY": apiKey },
      });
      if (!accRes.ok) throw new Error("Failed to fetch accounts");
      const accData = await accRes.json();

      // O que é devolvido ao cliente ao fim da conexão.
      const savedItems: Array<{ type: "credit_card" | "account"; id: string; name: string }> = [];

      for (const pluggyAccount of accData.results || []) {
        if (pluggyAccount.type === "CREDIT") {
          // Credit card account
          const { data: existingCard } = await supabase
            .from("credit_cards")
            .select("id")
            .eq("pluggy_account_id", pluggyAccount.id)
            .maybeSingle();

          let cardId: string;
          if (existingCard) {
            cardId = existingCard.id;
          } else {
            const lastDigits = pluggyAccount.number?.slice(-4) || "0000";
            const { data: newCard, error: cardErr } = await supabase
              .from("credit_cards")
              .insert({
                user_id: userId,
                name: pluggyAccount.name || item.connector?.name || "Cartão Pluggy",
                last_digits: lastDigits,
                brand: pluggyAccount.subtype || "Visa",
                credit_limit: pluggyAccount.creditData?.creditLimit || 0,
                current_invoice: Math.abs(pluggyAccount.balance || 0),
                pluggy_account_id: pluggyAccount.id,
              })
              .select("id")
              .single();

            if (cardErr) throw cardErr;
            cardId = newCard.id;
          }

          // Save pluggy_item
          const { error: piErr } = await supabase.from("pluggy_items").upsert(
            {
              user_id: userId,
              pluggy_item_id: itemId,
              connector_name: item.connector?.name,
              connector_logo: item.connector?.imageUrl,
              credit_card_id: cardId,
              status: item.status,
              last_sync_at: new Date().toISOString(),
            },
            { onConflict: "pluggy_item_id" }
          );
          if (piErr) throw piErr;

          savedItems.push({ type: "credit_card", id: cardId, name: pluggyAccount.name });
        } else {
          // Bank/savings account
          const { data: existingAcc } = await supabase
            .from("accounts")
            .select("id")
            .eq("pluggy_account_id", pluggyAccount.id)
            .maybeSingle();

          let accountId: string;
          if (existingAcc) {
            accountId = existingAcc.id;
          } else {
            const accType =
              pluggyAccount.type === "SAVINGS"
                ? "savings"
                : pluggyAccount.type === "INVESTMENT"
                ? "investment"
                : "bank";

            const { data: newAcc, error: accErr } = await supabase
              .from("accounts")
              .insert({
                user_id: userId,
                name: pluggyAccount.name || item.connector?.name || "Conta Pluggy",
                type: accType,
                current_balance: pluggyAccount.balance || 0,
                initial_balance: pluggyAccount.balance || 0,
                pluggy_account_id: pluggyAccount.id,
              })
              .select("id")
              .single();

            if (accErr) throw accErr;
            accountId = newAcc.id;
          }

          const { error: piErr } = await supabase.from("pluggy_items").upsert(
            {
              user_id: userId,
              pluggy_item_id: itemId,
              connector_name: item.connector?.name,
              connector_logo: item.connector?.imageUrl,
              account_id: accountId,
              status: item.status,
              last_sync_at: new Date().toISOString(),
            },
            { onConflict: "pluggy_item_id" }
          );
          if (piErr) throw piErr;

          savedItems.push({ type: "account", id: accountId, name: pluggyAccount.name });
        }
      }

      return new Response(JSON.stringify({ success: true, items: savedItems }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete_item" && itemId) {
      // Delete from Pluggy
      await fetch(`${PLUGGY_API}/items/${itemId}`, {
        method: "DELETE",
        headers: { "X-API-KEY": apiKey },
      });

      // Delete local record
      await supabase.from("pluggy_items").delete().eq("pluggy_item_id", itemId);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("pluggy-connect error:", err);
    // `err` num catch é `unknown`: nada garante que seja um Error. Antes disto
    // um throw de string virava `{"error": undefined}` no corpo da resposta.
    const mensagem = err instanceof Error ? err.message : "Erro interno do servidor";
    return new Response(JSON.stringify({ error: mensagem }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
