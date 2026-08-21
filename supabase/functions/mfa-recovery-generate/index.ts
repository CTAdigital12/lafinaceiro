// supabase/functions/mfa-recovery-generate/index.ts
//
// Generates 8 one-time recovery codes for the authenticated user.
// Caller MUST be in AAL2 (already passed TOTP) — this is the post-enroll
// regeneration endpoint. Codes are returned in PLAINTEXT exactly once and
// stored as bcrypt hashes (cost=10).
//
// Security:
//   R16  verify_jwt + AAL2 enforcement via JWT `aal` claim
//   R17  CORS allowlist via ALLOWED_ORIGINS
//   R18  Zod (input is empty here, but error shapes are strict)
//   R20  No code plaintext in any log line, ever
//
// Env:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   SUPABASE_ANON_KEY
//   ALLOWED_ORIGINS

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// bcryptjs (pure JS) — Supabase Edge Runtime does NOT support Web Workers,
// so the deno.land/x/bcrypt async API throws `Worker is not defined`.
// bcryptjs has no Worker dependency and is ~30% slower than native bcrypt,
// which is acceptable for this rare-call endpoint (8 hashes per regen).
import bcrypt from "https://esm.sh/bcryptjs@2.4.3";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { decodeJwtPayload } from "../_shared/jwt.ts";

const RECOVERY_CODE_COUNT = 8;
const BCRYPT_COST = 10;

// Format: 4 groups of 4 hex chars separated by `-`. 16 hex chars = 64 bits of
// entropy (>> 2^60 brute-force ceiling even ignoring bcrypt + rate-limit).
function generateRecoveryCode(): string {
  const bytes = new Uint8Array(8); // 8 bytes = 16 hex chars
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "method_not_allowed", request_id: requestId }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    // ---- Auth: require Bearer JWT ----------------------------------------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "unauthorized", request_id: requestId }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const jwt = authHeader.slice("Bearer ".length).trim();

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      console.error(`[mfa-recovery-generate] ${requestId} missing env config`);
      return new Response(
        JSON.stringify({ error: "server_misconfigured", request_id: requestId }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Validate JWT via Supabase auth (verified signature, fresh).
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await anonClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "unauthorized", request_id: requestId }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const userId = userData.user.id;

    // ---- AAL2 enforcement -----------------------------------------------
    // Read aal from JWT claims. getUser() does not expose it; payload decode is safe
    // because the signature was just verified above.
    const claims = decodeJwtPayload(jwt);
    const aal = typeof claims?.aal === "string" ? claims.aal : null;
    if (aal !== "aal2") {
      console.warn(
        `[mfa-recovery-generate] ${requestId} user=${userId} attempted regen with aal=${aal ?? "unknown"}`,
      );
      return new Response(
        JSON.stringify({
          error: "aal2_required",
          message: "Esta operação exige autenticação multifator ativa.",
          request_id: requestId,
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---- Generate codes + hashes ----------------------------------------
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const batchId = crypto.randomUUID();
    const plaintextCodes: string[] = [];
    const rows: Array<{ user_id: string; code_hash: string; generated_batch_id: string }> = [];

    for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
      const code = generateRecoveryCode();
      // bcryptjs.hash returns a Promise; cost is passed directly (no separate genSalt).
      const codeHash = await bcrypt.hash(code, BCRYPT_COST);
      plaintextCodes.push(code);
      rows.push({ user_id: userId, code_hash: codeHash, generated_batch_id: batchId });
    }

    // ---- Atomic swap: revoke old batch, insert new ----------------------
    // Supabase JS client does not expose explicit transactions. The two
    // statements run sequentially on the same connection; if INSERT fails
    // after DELETE, the user has zero codes — they can simply retry.
    // (Acceptable: this endpoint already requires AAL2; failure mode is "no
    //  codes" not "old codes still valid".)
    const { error: deleteErr } = await adminClient
      .from("mfa_recovery_codes")
      .delete()
      .eq("user_id", userId);
    if (deleteErr) {
      console.error(`[mfa-recovery-generate] ${requestId} delete_failed:`, deleteErr.message);
      return new Response(
        JSON.stringify({ error: "regeneration_failed", request_id: requestId }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { error: insertErr } = await adminClient.from("mfa_recovery_codes").insert(rows);
    if (insertErr) {
      console.error(`[mfa-recovery-generate] ${requestId} insert_failed:`, insertErr.message);
      return new Response(
        JSON.stringify({ error: "regeneration_failed", request_id: requestId }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---- Audit (best-effort; failure does NOT roll back the codes) ------
    const { error: auditErr } = await adminClient.rpc("log_audit_event", {
      p_event_type: "recovery_codes_regenerated",
      p_actor: userId,
      p_target: userId,
      p_metadata: { batch_id: batchId, count: RECOVERY_CODE_COUNT, request_id: requestId },
    });
    if (auditErr) {
      console.error(`[mfa-recovery-generate] ${requestId} audit_log_failed:`, auditErr.message);
    }

    console.log(
      `[mfa-recovery-generate] ${requestId} regenerated ${RECOVERY_CODE_COUNT} codes for user=${userId} batch=${batchId}`,
    );

    return new Response(
      JSON.stringify({
        codes: plaintextCodes,
        batch_id: batchId,
        count: RECOVERY_CODE_COUNT,
        request_id: requestId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    // Generic error log — never include codes or stack details in response.
    console.error(`[mfa-recovery-generate] ${requestId} unhandled:`, (err as Error)?.message ?? "unknown");
    return new Response(
      JSON.stringify({ error: "internal_error", request_id: requestId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
