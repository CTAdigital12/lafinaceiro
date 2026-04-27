# Security Notes

This document captures the security posture of the La Financeiro backend. It
is the source of truth for SECURITY_RULES (R1-R26) compliance for this repo.

---

## Pre-commit hooks (R4)

Toda mudanca neste repo passa por gitleaks antes de virar commit. Configuracao
em `.gitleaks.toml` na raiz.

- Hook em `.husky/pre-commit` (instalado via `npm run prepare` apos `npm install`).
- Roda `gitleaks protect --staged --redact --verbose` somente sobre o que esta
  staged — nao varre o working tree inteiro.
- Regras customizadas: `supabase-service-role`, `pluggy-secret`, `google-ai-key`.
- Regras default do gitleaks (incluindo `generic-api-key`) tambem ativas via
  `[extend] useDefault = true`.
- Lockfiles (`bun.lock`, `bun.lockb`, `package-lock.json`, `pnpm-lock.yaml`) e
  binarios (imagens, fontes, PDFs) estao no allowlist por path.

### Regras

- NUNCA usar `--no-verify` (W3 do SECURITY_RULES.md). Se gitleaks bloquear:
  - Se for verdadeiro positivo: remova o segredo, regenere-o, mova para
    Supabase secrets / Doppler / `.env` (gitignored).
  - Se for falso-positivo: edite `.gitleaks.toml` para allowlist o caso
    especifico (path ou regex), commit a mudanca do `.gitleaks.toml`, e
    reabra o commit original.
- Onboarding de novo dev: clonar o repo + `npm install` ja deixa o hook
  ativo (script `prepare` roda automatico).
- Pre-requisito: `gitleaks` instalado localmente (`brew install gitleaks`).
  O hook falha com mensagem clara se ausente.

### Smoke test (validado em 2026-04-27)

```bash
echo 'PLUGGY_CLIENT_SECRET="<paste-real-looking-secret-here>"' > test-secret.txt   # gitleaks:allow
git add test-secret.txt
git commit -m "test"   # bloqueado por gitleaks (exit 1)
git restore --staged test-secret.txt && rm test-secret.txt
```

Tambem ha CI scan recomendado em GitHub Actions (Fase 5+) com
`gitleaks/gitleaks-action@v2`.

---

## Pluggy webhook HMAC verification (R16)

**Function**: `supabase/functions/pluggy-webhook/index.ts`
**Status**: Authenticated via shared-secret header (always required) +
optional HMAC-SHA256 layer (defense-in-depth).

### Why two layers

Pluggy's documented webhook authentication mechanism is a **static custom
header** configured at webhook-creation time via their API
(see https://docs.pluggy.ai/docs/webhooks → "headers" field). Pluggy does
**not** natively HMAC-sign payloads as of 2026-04. Our function therefore:

1. **Always** validates the shared-secret header `x-webhook-secret` against
   `PLUGGY_WEBHOOK_SECRET` using a constant-time comparison.
2. **Optionally** validates an HMAC-SHA256 hex of the raw request body via
   `x-pluggy-signature`, gated by `PLUGGY_HMAC_ENABLED=true`. This path is
   future-proof: if Pluggy ships native signing, or if we put a signing
   proxy (e.g. a Deno relay) between Pluggy and Supabase, flip the env var
   and the function will enforce HMAC instead.

Authentication runs **before** any side-effect — no Supabase client is
constructed, no logs of the payload are emitted, no `JSON.parse` is called
until both checks pass. A malformed or hostile body cannot crash the parser
or trigger DB writes.

### Required environment variables

Configured via Supabase secrets (never committed):

| Var | Purpose |
|---|---|
| `PLUGGY_WEBHOOK_SECRET` | 32+ byte random token. Sent by Pluggy in `x-webhook-secret` and validated server-side. |
| `PLUGGY_HMAC_ENABLED` | `"true"` to require HMAC validation in addition to shared secret. Default `false`. |
| `PLUGGY_CLIENT_ID` | Pluggy API client ID (for outbound calls back to Pluggy). |
| `PLUGGY_CLIENT_SECRET` | Pluggy API client secret. |
| `SUPABASE_URL` | Auto-injected by Supabase runtime. |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-injected; used to insert transactions. **Never** expose to the client. |

Set them with:

```bash
supabase secrets set \
  PLUGGY_WEBHOOK_SECRET="$(openssl rand -hex 32)" \
  PLUGGY_HMAC_ENABLED=false \
  --project-ref <NEW_REF>
```

### Configuring the Pluggy side

Pluggy webhook headers can only be configured via API (not the dashboard),
because they may contain sensitive material. Register / update the webhook:

```bash
# 1) Get a Pluggy API key
curl -sX POST https://api.pluggy.ai/auth \
  -H 'Content-Type: application/json' \
  -d "{\"clientId\":\"$PLUGGY_CLIENT_ID\",\"clientSecret\":\"$PLUGGY_CLIENT_SECRET\"}"
# -> { "apiKey": "..." }

# 2) Create the webhook with the shared secret as a custom header
curl -sX POST https://api.pluggy.ai/webhooks \
  -H "X-API-KEY: $PLUGGY_API_KEY" \
  -H 'Content-Type: application/json' \
  -d "{
    \"url\": \"https://<NEW_REF>.supabase.co/functions/v1/pluggy-webhook\",
    \"event\": \"all\",
    \"headers\": { \"x-webhook-secret\": \"$PLUGGY_WEBHOOK_SECRET\" }
  }"
```

### Rotating `PLUGGY_WEBHOOK_SECRET`

Zero-downtime rotation procedure:

1. Generate a new secret: `NEW=$(openssl rand -hex 32)`.
2. **Temporarily** modify the function to accept *either* the current or the
   new secret (compare against both, fail only if both fail). Deploy.
3. Update the Pluggy webhook to send the new secret:
   `PATCH https://api.pluggy.ai/webhooks/<id>` with the new
   `headers.x-webhook-secret`.
4. Wait for in-flight retries to drain (≤ 30 min, Pluggy retry budget).
5. Set `PLUGGY_WEBHOOK_SECRET` in Supabase secrets to the new value.
6. Remove the dual-accept code and redeploy.

If a leak is suspected: skip the dual-accept window. Rotate immediately on
both sides — accept ~5 min of failed deliveries; Pluggy will retry.

### TODO before Phase 5 deploy

- [ ] Confirm with Pluggy support whether they ship any native signing
      header today. If yes, set `PLUGGY_HMAC_ENABLED=true` and document
      the exact header name + envelope format here.
- [ ] Decide whether to add a signing proxy (Cloudflare Worker / Deno
      Deploy) in front of the Supabase function for HMAC enforcement.

---

## service_role allowlist (R1, R5)

`SUPABASE_SERVICE_ROLE_KEY` may only be referenced inside these edge
functions, never in client (`src/`) code:

- `supabase/functions/pluggy-webhook/index.ts` — server-to-server, no
  user JWT available; authenticated by shared secret instead.
- `supabase/functions/add-member/index.ts` — admin-only invite flow.
- `supabase/functions/admin-reset-password/index.ts` — admin-only.

Any new use must be reviewed and added here. Phase 4.7 of the migration
plan enforces `grep -rn "SERVICE_ROLE" src/` returning zero matches.

---

## CORS posture (R17)

To be addressed in Phase 4.3. For now, all functions echo `*`. After
Phase 4.3, an `ALLOWED_ORIGIN` env var (comma-separated allowlist) is
honored on every function except `pluggy-webhook` (server-to-server,
CORS not applicable).
