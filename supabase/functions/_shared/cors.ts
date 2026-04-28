// Shared CORS allowlist helper for edge functions (R17).
//
// Reads the comma-separated env `ALLOWED_ORIGINS` and decides whether the
// requesting `Origin` is allowed. Supports exact matches and wildcard
// subdomain patterns (e.g. `https://*.vercel.app`). When the origin is not
// allowed, returns a non-matching value (`"null"`) so browsers block the
// response — never echoes back the caller's origin.
//
// Usage:
//   const cors = buildCorsHeaders(req.headers.get("origin"));
//   return new Response(body, { headers: { ...cors, "Content-Type": "application/json" } });

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function escapeRegex(value: string): string {
  return value.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

function isOriginAllowed(origin: string): boolean {
  return allowedOrigins.some((allowed) => {
    if (allowed === origin) return true;
    if (allowed.includes("*")) {
      // Convert wildcard pattern to regex: `*` matches one DNS label (no dots).
      const pattern =
        "^" +
        allowed
          .split("*")
          .map(escapeRegex)
          .join("[^.]+") +
        "$";
      return new RegExp(pattern).test(origin);
    }
    return false;
  });
}

export function buildCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && isOriginAllowed(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin! : "null",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
