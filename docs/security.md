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
  A regra da Pluggy fica MESMO com a integração removida: regra de gitleaks é
  rede de proteção, e tirá-la só abriria caminho para um segredo antigo passar
  despercebido num arquivo qualquer.
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
echo 'SUPABASE_SERVICE_ROLE_KEY="<paste-real-looking-key-here>"' > test-secret.txt   # gitleaks:allow
git add test-secret.txt
git commit -m "test"   # bloqueado por gitleaks (exit 1)
git restore --staged test-secret.txt && rm test-secret.txt
```

Tambem ha CI scan recomendado em GitHub Actions (Fase 5+) com
`gitleaks/gitleaks-action@v2`.

## service_role allowlist (R1, R5)

`SUPABASE_SERVICE_ROLE_KEY` may only be referenced inside these edge
functions, never in client (`src/`) code:

- `supabase/functions/add-member/index.ts` — concede acesso compartilhado;
  exige AAL2 no código, porque service-role ignora as policies do A1.
- `supabase/functions/mfa-recovery-generate/index.ts` — exige AAL2.
- `supabase/functions/mfa-recovery-verify/index.ts` — roda ANTES do segundo
  fator, por definição: é o resgate de quem perdeu o app autenticador.

Conferido em 24/09/2026 com `grep -rln SERVICE_ROLE supabase/functions/`.
A lista anterior estava desatualizada nas DUAS pontas: citava
`pluggy-webhook` (removida) e `admin-reset-password` (derrubada no C1 da
auditoria, porque permitia a qualquer usuário autenticado redefinir a senha
de outro), e não citava as duas functions de MFA, que usam a chave.

Any new use must be reviewed and added here. Phase 4.7 of the migration
plan enforces `grep -rn "SERVICE_ROLE" src/` returning zero matches.

---

## CORS posture (R17)

To be addressed in Phase 4.3. For now, all functions echo `*`. After
Phase 4.3, an `ALLOWED_ORIGIN` env var (comma-separated allowlist) is
honored on every function.
