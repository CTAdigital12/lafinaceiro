import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Corpo do webhook da Pluggy. Todos os campos são opcionais de propósito: isto
 * vem de `JSON.parse` de um corpo NÃO CONFIÁVEL, e o código já trata ausência
 * de cada um. Tipar como obrigatório mentiria sobre a garantia que existe.
 */
interface PluggyWebhookPayload {
  event?: string;
  itemId?: string;
  accountId?: string;
  createdTransactionsLink?: string;
}

/** Subconjunto de `pluggy_items` que este arquivo lê. */
interface PluggyItemRow {
  id: string;
  user_id: string;
  account_id: string | null;
  credit_card_id: string | null;
}

/** Subconjunto da conta devolvida pela API da Pluggy. */
interface PluggyAccount {
  id: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PLUGGY_API = "https://api.pluggy.ai";

/**
 * Pluggy webhook authentication (R16).
 *
 * Pluggy's documented mechanism for webhook auth is a static custom header
 * (https://docs.pluggy.ai/docs/webhooks "headers" field on webhook creation).
 * Pluggy does NOT natively sign payloads with HMAC at the time of writing
 * (verified 2026-04). We implement BOTH:
 *
 *   1) PRIMARY: shared-secret header (`x-webhook-secret`), configured on our
 *      side via the Pluggy create-webhook API. Always required.
 *   2) DEFENSE-IN-DEPTH: optional HMAC-SHA256 hex of the raw body, expected
 *      via `x-pluggy-signature`. Only enforced if PLUGGY_HMAC_ENABLED=true
 *      AND the header is present (Pluggy may add native signing later, or a
 *      signing proxy may sit in front).
 *
 * TODO(security): re-confirm header name + algorithm with Pluggy support
 * before Phase 5 deploy. If Pluggy ships native signing, flip
 * PLUGGY_HMAC_ENABLED to "true" and remove the shared-secret fallback.
 */

const PLUGGY_WEBHOOK_SECRET = (Deno.env.get("PLUGGY_WEBHOOK_SECRET") ?? "").trim();
const PLUGGY_HMAC_ENABLED =
  (Deno.env.get("PLUGGY_HMAC_ENABLED") ?? "").trim().toLowerCase() === "true";
const PLUGGY_TIMESTAMP_TOLERANCE_SEC = 300; // ±5 min if/when timestamp arrives

/** Constant-time string comparison (Deno does not export timingSafeEqual). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/** Compute HMAC-SHA256 hex of `body` using `secret`, via Web Crypto. */
async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Truncate IP to first 2 octets for log diagnostics without doxxing (R20). */
function truncateIp(ip: string | null): string {
  if (!ip) return "unknown";
  // IPv4: 1.2.3.4 -> 1.2.x.x ; IPv6: fall back to first segment
  const v4 = ip.split(",")[0].trim().split(".");
  if (v4.length === 4) return `${v4[0]}.${v4[1]}.x.x`;
  const v6 = ip.split(":");
  return v6.length > 1 ? `${v6[0]}::truncated` : "unknown";
}

/**
 * Validate Pluggy webhook authenticity. Runs BEFORE any side-effect.
 * Returns `null` on success or a Response (401/500) on failure.
 */
async function authenticatePluggyWebhook(
  req: Request,
  rawBody: string,
  requestId: string,
): Promise<Response | null> {
  const xff = req.headers.get("x-forwarded-for");
  const ipTrunc = truncateIp(xff);
  const bodyLen = rawBody.length;

  // Misconfiguration: never leak that the secret is missing — generic 500.
  if (!PLUGGY_WEBHOOK_SECRET) {
    console.error(
      `[pluggy-webhook] auth_misconfigured request_id=${requestId} ip=${ipTrunc} body_len=${bodyLen}`,
    );
    return new Response(
      JSON.stringify({ error: "internal_error", request_id: requestId }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  // 1) Shared-secret header (Pluggy's documented mechanism).
  const provided = (req.headers.get("x-webhook-secret") ?? "").trim();
  if (!provided) {
    console.warn(
      `[pluggy-webhook] auth_missing_secret request_id=${requestId} ip=${ipTrunc} body_len=${bodyLen}`,
    );
    return new Response(
      JSON.stringify({ error: "unauthorized", request_id: requestId }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }
  if (!timingSafeEqual(provided, PLUGGY_WEBHOOK_SECRET)) {
    console.warn(
      `[pluggy-webhook] auth_bad_secret request_id=${requestId} ip=${ipTrunc} body_len=${bodyLen}`,
    );
    return new Response(
      JSON.stringify({ error: "unauthorized", request_id: requestId }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  // 2) Optional HMAC layer (defense-in-depth or future Pluggy native signing).
  if (PLUGGY_HMAC_ENABLED) {
    const sigHeader = (req.headers.get("x-pluggy-signature") ?? "").trim();
    if (!sigHeader) {
      console.warn(
        `[pluggy-webhook] auth_missing_hmac request_id=${requestId} ip=${ipTrunc} body_len=${bodyLen}`,
      );
      return new Response(
        JSON.stringify({ error: "unauthorized", request_id: requestId }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    // TODO(security): if Pluggy ships timestamp anti-replay, enforce here.
    // Expected envelope (Stripe-style): "t=<unix>,v1=<hex>". For now Pluggy
    // sends only raw hex — accept that shape.
    let expectedHexSource = rawBody;
    let providedHex = sigHeader;
    if (sigHeader.includes(",")) {
      const parts = Object.fromEntries(
        sigHeader.split(",").map((p) => p.split("=") as [string, string]),
      );
      const ts = parts["t"];
      providedHex = parts["v1"] ?? "";
      if (!ts || !providedHex) {
        return new Response(
          JSON.stringify({ error: "unauthorized", request_id: requestId }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }
      const age = Date.now() / 1000 - Number(ts);
      if (!Number.isFinite(age) || age > PLUGGY_TIMESTAMP_TOLERANCE_SEC || age < -60) {
        console.warn(
          `[pluggy-webhook] auth_replay request_id=${requestId} ip=${ipTrunc} age=${age}`,
        );
        return new Response(
          JSON.stringify({ error: "unauthorized", request_id: requestId }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }
      expectedHexSource = `${ts}.${rawBody}`;
    }

    const expectedHex = await hmacSha256Hex(PLUGGY_WEBHOOK_SECRET, expectedHexSource);
    if (!timingSafeEqual(providedHex.toLowerCase(), expectedHex.toLowerCase())) {
      console.warn(
        `[pluggy-webhook] auth_bad_hmac request_id=${requestId} ip=${ipTrunc} body_len=${bodyLen}`,
      );
      return new Response(
        JSON.stringify({ error: "unauthorized", request_id: requestId }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  return null;
}

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

/**
 * Normalize string for fuzzy matching (same logic as client-side deduplication)
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalize date to YYYY-MM-DD
 */
function normalizeDate(date: string | null | undefined): string {
  if (!date) return "";
  return date.substring(0, 10);
}

/**
 * Check if a transaction is a duplicate using fuzzy matching
 */
function isDuplicate(
  pluggyTx: { description: string; amount: number; date: string },
  existing: Array<{ description: string; original_description: string | null; amount: number; date: string }>
): string | null {
  const TOLERANCE = 0.05;
  const importedDesc = normalizeString(pluggyTx.description);
  const importedDate = normalizeDate(pluggyTx.date);
  const importedAmount = Math.abs(pluggyTx.amount);

  for (const ex of existing) {
    const exDesc = normalizeString(ex.original_description || ex.description);
    const exDate = normalizeDate(ex.date);
    const exAmount = Math.abs(Number(ex.amount));

    // Date match (allow 1 day tolerance)
    const d1 = new Date(importedDate);
    const d2 = new Date(exDate);
    const dayDiff = Math.abs(d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24);
    if (dayDiff > 1) continue;

    // Amount match
    if (Math.abs(exAmount - importedAmount) > TOLERANCE) continue;

    // Description match (exact after normalization)
    if (exDesc === importedDesc) return ex.description; // Return existing description to confirm match
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    // Read body as raw text exactly once. We MUST authenticate before
    // JSON.parse — a hostile payload could be malformed and crash the parser
    // (DoS amplifier). Authentication must precede every side-effect (R16).
    const rawBody = await req.text();

    const authFailure = await authenticatePluggyWebhook(req, rawBody, requestId);
    if (authFailure) return authFailure;

    let payload: PluggyWebhookPayload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return new Response(
        JSON.stringify({ error: "invalid_json", request_id: requestId }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Only log payload AFTER authentication succeeded (R20). Even so, avoid
    // dumping the entire object — keep diagnostic fields only.
    const { event, itemId, accountId, createdTransactionsLink } = payload;
    console.log(
      `[pluggy-webhook] received request_id=${requestId} event=${event ?? "unknown"} itemId=${itemId ?? "none"}`,
    );

    if (!itemId) {
      return new Response(JSON.stringify({ ok: true, skipped: "no itemId" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create admin supabase client
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find the pluggy_item to get user_id and linked account/card
    const { data: pluggyItem } = await supabase
      .from("pluggy_items")
      .select("*")
      .eq("pluggy_item_id", itemId)
      .maybeSingle();

    if (!pluggyItem) {
      console.log("No pluggy_item found for itemId:", itemId);
      return new Response(JSON.stringify({ ok: true, skipped: "unknown item" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = pluggyItem.user_id;
    const apiKey = await getPluggyApiKey();

    // Handle transactions/created event
    if (event === "transactions/created" || event === "item/updated") {
      // Fetch transactions from Pluggy
      let transactionsUrl: string;
      if (createdTransactionsLink) {
        transactionsUrl = createdTransactionsLink;
      } else if (accountId) {
        transactionsUrl = `${PLUGGY_API}/transactions?accountId=${accountId}&pageSize=500`;
      } else {
        // Fetch all accounts for this item
        const accRes = await fetch(`${PLUGGY_API}/accounts?itemId=${itemId}`, {
          headers: { "X-API-KEY": apiKey },
        });
        if (!accRes.ok) {
          const t = await accRes.text();
          throw new Error(`Failed to fetch accounts: ${t}`);
        }
        const accData = await accRes.json();

        let totalInserted = 0;
        let totalSkipped = 0;

        for (const pluggyAccount of accData.results || []) {
          const result = await processAccountTransactions(
            supabase,
            apiKey,
            userId,
            pluggyAccount,
            pluggyItem
          );
          totalInserted += result.inserted;
          totalSkipped += result.skipped;
        }

        // Update last_sync_at
        await supabase
          .from("pluggy_items")
          .update({ last_sync_at: new Date().toISOString(), status: "UPDATED" })
          .eq("id", pluggyItem.id);

        return new Response(
          JSON.stringify({ ok: true, inserted: totalInserted, skipped: totalSkipped }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // If we have a direct transactions URL
      const txRes = await fetch(transactionsUrl, {
        headers: { "X-API-KEY": apiKey },
      });
      if (!txRes.ok) {
        const t = await txRes.text();
        throw new Error(`Failed to fetch transactions: ${t}`);
      }
      const txData = await txRes.json();

      // Determine target account/card
      let targetAccountId = pluggyItem.account_id;
      let targetCardId = pluggyItem.credit_card_id;

      // If accountId is provided, find the specific mapping
      if (accountId) {
        const { data: accByPluggy } = await supabase
          .from("accounts")
          .select("id")
          .eq("pluggy_account_id", accountId)
          .maybeSingle();

        if (accByPluggy) {
          targetAccountId = accByPluggy.id;
          targetCardId = null;
        } else {
          const { data: cardByPluggy } = await supabase
            .from("credit_cards")
            .select("id")
            .eq("pluggy_account_id", accountId)
            .maybeSingle();

          if (cardByPluggy) {
            targetCardId = cardByPluggy.id;
            targetAccountId = null;
          }
        }
      }

      // Fetch existing transactions for deduplication (last 90 days)
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const dateFilter = ninetyDaysAgo.toISOString().split("T")[0];

      let existingQuery = supabase
        .from("transactions")
        .select("id, description, original_description, amount, date, status, is_provisional")
        .eq("user_id", userId)
        .gte("date", dateFilter);

      if (targetAccountId) {
        existingQuery = existingQuery.eq("account_id", targetAccountId);
      } else if (targetCardId) {
        existingQuery = existingQuery.eq("credit_card_id", targetCardId);
      }

      const { data: existingTxs } = await existingQuery;
      const existingList = existingTxs || [];

      let inserted = 0;
      let skipped = 0;
      let updated = 0;

      for (const tx of txData.results || []) {
        const amount = Math.abs(tx.amount);
        const txType = tx.amount >= 0 ? "income" : "expense";
        const txDate = normalizeDate(tx.date);
        const description = tx.description || tx.descriptionRaw || "Transação Pluggy";

        // Deduplication check
        const matchDesc = isDuplicate(
          { description, amount, date: txDate },
          existingList
        );

        if (matchDesc) {
          // Check if existing is pending/provisional and should be updated to completed
          const matchingExisting = existingList.find((e) => {
            const eDesc = normalizeString(e.original_description || e.description);
            return (
              eDesc === normalizeString(description) &&
              Math.abs(Number(e.amount) - amount) <= 0.05 &&
              (e.status === "pending" || e.is_provisional)
            );
          });

          if (matchingExisting) {
            await supabase
              .from("transactions")
              .update({ status: "completed", is_provisional: false })
              .eq("id", matchingExisting.id);
            updated++;
          } else {
            skipped++;
          }
          continue;
        }

        // Insert new transaction
        const txRecord: Record<string, unknown> = {
          user_id: userId,
          description,
          original_description: description,
          amount,
          type: txType,
          date: txDate,
          status: "completed",
          is_provisional: false,
          imported_at: new Date().toISOString(),
        };

        if (targetCardId) {
          txRecord.credit_card_id = targetCardId;
          // Map to invoice month based on date
          txRecord.due_date = txDate;
        } else if (targetAccountId) {
          txRecord.account_id = targetAccountId;
        }

        // Try to map category via categorization rules
        const { data: rule } = await supabase
          .from("categorization_rules")
          .select("category_id, is_corporate")
          .eq("user_id", userId)
          .ilike("keyword", `%${normalizeString(description).substring(0, 30)}%`)
          .limit(1)
          .maybeSingle();

        if (rule) {
          txRecord.category_id = rule.category_id;
          txRecord.is_corporate_expense = rule.is_corporate;
        }

        const { error: insertErr } = await supabase.from("transactions").insert(txRecord);
        if (insertErr) {
          console.error("Insert error:", insertErr);
        } else {
          inserted++;
          // Add to existing list for dedup of remaining items in this batch
          existingList.push({
            id: "new",
            description,
            original_description: description,
            amount,
            date: txDate,
            status: "completed",
            is_provisional: false,
          });
        }
      }

      // Update account balance if it's a bank account
      if (targetAccountId && accountId) {
        const accDetailRes = await fetch(`${PLUGGY_API}/accounts/${accountId}`, {
          headers: { "X-API-KEY": apiKey },
        });
        if (accDetailRes.ok) {
          const accDetail = await accDetailRes.json();
          await supabase
            .from("accounts")
            .update({ current_balance: accDetail.balance })
            .eq("id", targetAccountId);
        }
      }

      // Update credit card invoice if it's a card
      if (targetCardId && accountId) {
        const accDetailRes = await fetch(`${PLUGGY_API}/accounts/${accountId}`, {
          headers: { "X-API-KEY": apiKey },
        });
        if (accDetailRes.ok) {
          const accDetail = await accDetailRes.json();
          await supabase
            .from("credit_cards")
            .update({ current_invoice: Math.abs(accDetail.balance || 0) })
            .eq("id", targetCardId);
        }
      }

      // Update last_sync_at
      await supabase
        .from("pluggy_items")
        .update({ last_sync_at: new Date().toISOString(), status: "UPDATED" })
        .eq("id", pluggyItem.id);

      console.log(`Processed: inserted=${inserted}, skipped=${skipped}, updated=${updated}`);

      return new Response(
        JSON.stringify({ ok: true, inserted, skipped, updated }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For other events, just acknowledge
    return new Response(JSON.stringify({ ok: true, event }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(
      `[pluggy-webhook] error request_id=${requestId} err=${err instanceof Error ? err.message : String(err)}`,
    );
    return new Response(
      JSON.stringify({ error: "internal_error", request_id: requestId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

/**
 * Process transactions for a single Pluggy account
 */
async function processAccountTransactions(
  supabase: SupabaseClient,
  apiKey: string,
  userId: string,
  pluggyAccount: PluggyAccount,
  pluggyItem: PluggyItemRow
): Promise<{ inserted: number; skipped: number }> {
  const txRes = await fetch(
    `${PLUGGY_API}/transactions?accountId=${pluggyAccount.id}&pageSize=500`,
    { headers: { "X-API-KEY": apiKey } }
  );

  if (!txRes.ok) {
    const t = await txRes.text();
    console.error("Failed to fetch transactions for account:", pluggyAccount.id, t);
    return { inserted: 0, skipped: 0 };
  }

  const txData = await txRes.json();

  // Find local account/card
  let targetAccountId: string | null = null;
  let targetCardId: string | null = null;

  const { data: localAcc } = await supabase
    .from("accounts")
    .select("id")
    .eq("pluggy_account_id", pluggyAccount.id)
    .maybeSingle();

  if (localAcc) {
    targetAccountId = localAcc.id;
  } else {
    const { data: localCard } = await supabase
      .from("credit_cards")
      .select("id")
      .eq("pluggy_account_id", pluggyAccount.id)
      .maybeSingle();

    if (localCard) targetCardId = localCard.id;
  }

  if (!targetAccountId && !targetCardId) {
    return { inserted: 0, skipped: 0 };
  }

  // Fetch existing for dedup
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  let existingQuery = supabase
    .from("transactions")
    .select("id, description, original_description, amount, date, status, is_provisional")
    .eq("user_id", userId)
    .gte("date", ninetyDaysAgo.toISOString().split("T")[0]);

  if (targetAccountId) existingQuery = existingQuery.eq("account_id", targetAccountId);
  else existingQuery = existingQuery.eq("credit_card_id", targetCardId);

  const { data: existingTxs } = await existingQuery;
  const existingList = existingTxs || [];

  let inserted = 0;
  let skipped = 0;

  for (const tx of txData.results || []) {
    const amount = Math.abs(tx.amount);
    const description = tx.description || tx.descriptionRaw || "Transação Pluggy";
    const txDate = normalizeDate(tx.date);

    if (isDuplicate({ description, amount, date: txDate }, existingList)) {
      skipped++;
      continue;
    }

    const txRecord: Record<string, unknown> = {
      user_id: userId,
      description,
      original_description: description,
      amount,
      type: tx.amount >= 0 ? "income" : "expense",
      date: txDate,
      status: "completed",
      is_provisional: false,
      imported_at: new Date().toISOString(),
    };

    if (targetCardId) {
      txRecord.credit_card_id = targetCardId;
      txRecord.due_date = txDate;
    } else {
      txRecord.account_id = targetAccountId;
    }

    const { error } = await supabase.from("transactions").insert(txRecord);
    if (!error) {
      inserted++;
      existingList.push({
        id: "new",
        description,
        original_description: description,
        amount,
        date: txDate,
        status: "completed",
        is_provisional: false,
      });
    }
  }

  return { inserted, skipped };
}
