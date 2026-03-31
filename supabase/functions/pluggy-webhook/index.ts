import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

  try {
    const payload = await req.json();
    console.log("Webhook received:", JSON.stringify(payload));

    const { event, itemId, accountId, createdTransactionsLink } = payload;

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
        const txRecord: Record<string, any> = {
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
    console.error("pluggy-webhook error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/**
 * Process transactions for a single Pluggy account
 */
async function processAccountTransactions(
  supabase: any,
  apiKey: string,
  userId: string,
  pluggyAccount: any,
  pluggyItem: any
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

    const txRecord: Record<string, any> = {
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
