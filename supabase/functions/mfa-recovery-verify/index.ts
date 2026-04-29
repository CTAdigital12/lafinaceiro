// supabase/functions/mfa-recovery-verify/index.ts
//
// Consumes a recovery code submitted by a user in AAL1 (post-password,
// pre-TOTP). On success, the user's TOTP factors are deleted and ALL
// sessions are revoked — the user must log in again from scratch and
// re-enroll MFA. This is the documented "I lost my phone" escape hatch.
//
// Security:
//   R16  verify_jwt=true (AAL1 session required) + Zod
//   R17  CORS allowlist via ALLOWED_ORIGINS
//   R18  Zod strict input
//   R20  No code plaintext in any log line, ever
//   Constant-time loop: bcrypt.compare is run against ALL non-used codes
//     even after a match is found, to avoid timing-leak signaling
//     "did this user have any code at all?".
//   Rate-limit: 5 attempts / 15 min per (user_id OR ip), via mfa_attempts.
//
// Env:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   SUPABASE_ANON_KEY
//   ALLOWED_ORIGINS

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// bcryptjs (pure JS) — Supabase Edge Runtime does NOT support Web Workers,
// so the deno.land/x/bcrypt async API throws `Worker is not defined`.
// bcryptjs has no Worker dependency.
import bcrypt from "https://esm.sh/bcryptjs@2.4.3";
import { z } from "https://esm.sh/zod@3.23.8";
import { buildCorsHeaders } from "../_shared/cors.ts";

const RATE_LIMIT_WINDOW_MIN = 15;
const RATE_LIMIT_MAX = 5;

const InputSchema = z
  .object({
    code: z
      .string()
      .min(12, "código muito curto")
      .max(25, "código muito longo")
      .transform((s) => s.trim().toUpperCase()),
  })
  .strict();

// TODO(post-MVP): replace with `supabase.auth.getClaims()` when Supabase Edge
// Runtime exposes it natively. Manual decode is fail-closed: parse error →
// null → AAL check fails → 400 invalid_session_state.
function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const [, payload] = jwt.split(".");
    if (!payload) return null;
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(
      payload.length + ((4 - (payload.length % 4)) % 4),
      "=",
    );
    return JSON.parse(atob(b64)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// Best-effort IP from common reverse-proxy headers. Stored as inet (string).
function extractClientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  return null;
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
    // ---- Auth: require AAL1 Bearer JWT ----------------------------------
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
      console.error(`[mfa-recovery-verify] ${requestId} missing env config`);
      return new Response(
        JSON.stringify({ error: "server_misconfigured", request_id: requestId }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

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

    // ---- AAL1 enforcement: must NOT already be in aal2 -------------------
    const claims = decodeJwtPayload(jwt);
    const aal = typeof claims?.aal === "string" ? claims.aal : null;
    if (aal === "aal2") {
      return new Response(
        JSON.stringify({
          error: "already_aal2",
          message: "Você já está autenticado com MFA. Use Configurações para gerenciar.",
          request_id: requestId,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (aal !== "aal1") {
      // Defensive: any other state (no claim / unknown) is rejected.
      return new Response(
        JSON.stringify({ error: "invalid_session_state", request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---- Reject users with no MFA enrolled (defense in depth) -----------
    // A user without any verified factor has aal1+nextLevel='aal1' and would
    // never legitimately reach this endpoint. Bail before consuming bcrypts
    // or rate-limit slots.
    const adminClientForFactors = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: enrolledFactors } = await adminClientForFactors.auth.admin.mfa.listFactors({
      userId,
    });
    if (!(enrolledFactors?.factors ?? []).some((f) => f.status === "verified")) {
      return new Response(
        JSON.stringify({
          error: "no_mfa_enrolled",
          message: "Sua conta não tem autenticação multifator configurada.",
          request_id: requestId,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---- Validate body ---------------------------------------------------
    let bodyJson: unknown;
    try {
      bodyJson = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "invalid_json", request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const parsed = InputSchema.safeParse(bodyJson);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "invalid_input", request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const submittedCode = parsed.data.code;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const ip = extractClientIp(req);
    const userAgent = req.headers.get("user-agent")?.slice(0, 500) ?? null;

    // ---- Rate-limit (5 / 15min per user OR per IP) -----------------------
    const sinceIso = new Date(Date.now() - RATE_LIMIT_WINDOW_MIN * 60_000).toISOString();
    const orFilter = ip
      ? `user_id.eq.${userId},ip_address.eq.${ip}`
      : `user_id.eq.${userId}`;
    const { count: recentAttempts, error: rateErr } = await adminClient
      .from("mfa_attempts")
      .select("id", { count: "exact", head: true })
      .eq("attempt_type", "recovery")
      .gte("created_at", sinceIso)
      .or(orFilter);

    if (rateErr) {
      console.error(`[mfa-recovery-verify] ${requestId} rate_check_failed:`, rateErr.message);
      // Fail-closed on rate-limit lookup failure.
      return new Response(
        JSON.stringify({ error: "internal_error", request_id: requestId }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if ((recentAttempts ?? 0) >= RATE_LIMIT_MAX) {
      await adminClient.rpc("log_audit_event", {
        p_event_type: "mfa_recovery_rate_limited",
        p_actor: userId,
        p_target: userId,
        p_metadata: { ip, request_id: requestId },
      });
      return new Response(
        JSON.stringify({
          error: "rate_limited",
          message: "Muitas tentativas. Tente novamente em 15 minutos.",
          request_id: requestId,
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---- INSERT attempt BEFORE compare (prevents race in burst) ----------
    const { data: attemptRow, error: attemptErr } = await adminClient
      .from("mfa_attempts")
      .insert({
        user_id: userId,
        ip_address: ip,
        attempt_type: "recovery",
        success: false,
      })
      .select("id")
      .single();
    if (attemptErr || !attemptRow) {
      console.error(`[mfa-recovery-verify] ${requestId} attempt_insert_failed:`, attemptErr?.message);
      return new Response(
        JSON.stringify({ error: "internal_error", request_id: requestId }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const attemptId = attemptRow.id as string;

    // ---- Constant-time compare against ALL non-used hashes --------------
    const { data: codeRows, error: codesErr } = await adminClient
      .from("mfa_recovery_codes")
      .select("id, code_hash")
      .eq("user_id", userId)
      .is("used_at", null);
    if (codesErr) {
      console.error(`[mfa-recovery-verify] ${requestId} codes_lookup_failed:`, codesErr.message);
      return new Response(
        JSON.stringify({ error: "internal_error", request_id: requestId }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let matchedId: string | null = null;
    // Iterate ALL rows even after match → constant-time at row count granularity.
    // (Per-bcrypt timing is already constant via internal padding.)
    for (const row of codeRows ?? []) {
      // bcryptjs.compare is async; await sequentially for predictable timing.
      const ok = await bcrypt.compare(submittedCode, row.code_hash as string);
      if (ok && matchedId === null) {
        matchedId = row.id as string;
      }
    }

    if (matchedId === null) {
      await adminClient.rpc("log_audit_event", {
        p_event_type: "recovery_code_failed",
        p_actor: userId,
        p_target: userId,
        p_metadata: { ip, request_id: requestId },
      });
      console.warn(`[mfa-recovery-verify] ${requestId} no_match user=${userId} ip=${ip ?? "?"}`);
      // Generic message — DO NOT distinguish "wrong code" vs "code already used".
      return new Response(
        JSON.stringify({ error: "invalid_code", message: "Código inválido.", request_id: requestId }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---- Match: consume code, blow up MFA, revoke sessions ---------------
    // 1. Mark code used (trigger writes audit_log automatically).
    const { error: useErr } = await adminClient
      .from("mfa_recovery_codes")
      .update({ used_at: new Date().toISOString(), used_ip: ip, used_user_agent: userAgent })
      .eq("id", matchedId);
    if (useErr) {
      console.error(`[mfa-recovery-verify] ${requestId} mark_used_failed:`, useErr.message);
      return new Response(
        JSON.stringify({ error: "internal_error", request_id: requestId }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. List + delete every verified TOTP factor.
    const { data: factorsData, error: factorsErr } = await adminClient.auth.admin.mfa.listFactors({
      userId,
    });
    if (factorsErr) {
      console.error(`[mfa-recovery-verify] ${requestId} list_factors_failed:`, factorsErr.message);
      // Fall through — we still revoke sessions; user is in worse spot but not unsafe.
    }
    const factorsToDelete = (factorsData?.factors ?? []).filter((f) => f.status === "verified");
    for (const f of factorsToDelete) {
      const { error: delErr } = await adminClient.auth.admin.mfa.deleteFactor({
        id: f.id,
        userId,
      });
      if (delErr) {
        console.error(
          `[mfa-recovery-verify] ${requestId} delete_factor_failed factor=${f.id}:`,
          delErr.message,
        );
      }
    }

    // 3. Global signOut → kills all refresh tokens for this user.
    const { error: signOutErr } = await adminClient.auth.admin.signOut(userId, "global");
    if (signOutErr) {
      console.error(`[mfa-recovery-verify] ${requestId} signout_failed:`, signOutErr.message);
    }

    // 4. Update attempt as successful (post-hoc; rate-limit was already counted).
    await adminClient.from("mfa_attempts").update({ success: true }).eq("id", attemptId);

    // 5. Audit the macro event.
    await adminClient.rpc("log_audit_event", {
      p_event_type: "mfa_reset_via_recovery",
      p_actor: userId,
      p_target: userId,
      p_metadata: {
        code_id: matchedId,
        factors_deleted: factorsToDelete.length,
        ip,
        request_id: requestId,
      },
    });

    console.log(
      `[mfa-recovery-verify] ${requestId} reset user=${userId} factors=${factorsToDelete.length}`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        mfa_reset: true,
        message: "MFA desativado via código de recuperação. Faça login novamente.",
        request_id: requestId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error(`[mfa-recovery-verify] ${requestId} unhandled:`, (err as Error)?.message ?? "unknown");
    return new Response(
      JSON.stringify({ error: "internal_error", request_id: requestId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
