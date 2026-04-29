# 2FA TOTP — Roteiro de Testes Manual

> **Branch:** `feature/mfa-totp`
> **Última atualização:** 2026-04-29
> **Para quem:** André (owner) — testar end-to-end com Supabase real **antes** do merge.
> **Objetivo:** validar enroll, login com challenge, recovery, regen, unenroll e edge cases que Vitest não cobre (clock drift, sessões em 2 browsers, biometria iOS).

Este roteiro pressupõe que o backend (migrations + 2 edge functions) já foi
deployado no projeto Supabase de produção (`vbrdtxgsiwhgeexihgwk`). Se ainda
não foi, leia primeiro `~/.claude/plans/carregue-as-regras-e-clever-sprout.md`
e o "Pré-requisitos manuais" abaixo.

---

## 0. Pré-requisitos manuais (faça uma vez)

### 0.1 Habilitar TOTP no painel Supabase

1. Acesse https://supabase.com/dashboard/project/vbrdtxgsiwhgeexihgwk/auth/providers
2. Role até **Multi-Factor Authentication**
3. Toggle **TOTP** = ON
4. (Opcional) Em **Authentication → URL Configuration**, defina **Site URL** = `https://lafinanceiro.ia.br` se ainda não estiver.

**Você deve ver:** o card "Multi-Factor Authentication" com TOTP marcado como
"Enabled" em verde.

### 0.2 Definir secret `MFA_ISSUER`

```bash
# No projeto Supabase (via CLI):
supabase secrets set MFA_ISSUER="La Financeiro" \
  --project-ref vbrdtxgsiwhgeexihgwk
```

**Você deve ver:** `Set MFA_ISSUER` na saída. (Ainda não usado pelos arquivos
deste PR — ficará pendente quando customizarmos `friendlyName` no enroll. Hoje
o issuer renderizado pelo authenticator app virá do `friendlyName` que está
hard-coded como "La Financeiro" em `AuthContext.tsx:206`.)

### 0.3 Definir `ALLOWED_ORIGINS` para as edge functions

```bash
supabase secrets set ALLOWED_ORIGINS="https://lafinanceiro.ia.br,http://localhost:5173,http://localhost:8080" \
  --project-ref vbrdtxgsiwhgeexihgwk
```

**Você deve ver:** `Set ALLOWED_ORIGINS`.

### 0.4 Aplicar migrations e fazer deploy das edge functions

```bash
cd "/Users/andreeduardo/Documents/La Financeiro /lafinaceiro"

# Migrations (4 arquivos novos — ordem importa)
supabase db push --project-ref vbrdtxgsiwhgeexihgwk

# Edge functions
supabase functions deploy mfa-recovery-generate \
  --project-ref vbrdtxgsiwhgeexihgwk
supabase functions deploy mfa-recovery-verify \
  --project-ref vbrdtxgsiwhgeexihgwk
```

**Você deve ver:** `Applied migration 20260429160000_create_has_role_function`
... 160100, 160200, 160300. Depois `Deployed Function mfa-recovery-generate` e
`Deployed Function mfa-recovery-verify`.

### 0.5 Sanity check no banco

Cole no SQL editor do painel:

```sql
SELECT
  (SELECT count(*) FROM public.audit_logs)            AS audit_count,
  (SELECT count(*) FROM public.mfa_recovery_codes)    AS codes_count,
  (SELECT count(*) FROM public.mfa_attempts)          AS attempts_count,
  has_function_privilege('authenticated', 'public.has_role(uuid,text)', 'EXECUTE') AS auth_can_call_has_role;
```

**Você deve ver:** todas as contagens em 0 e `auth_can_call_has_role = true`.

---

## 1. Enroll TOTP no Google Authenticator

### Passos

1. Abra https://lafinanceiro.ia.br/auth (ou `npm run dev` localhost)
2. Login com seu email/senha normal (`aesdomingues@gmail.com`)
3. Vá em **Configurações** (sidebar) → **Configurar** ao lado de "Autenticação de dois fatores"

   **Você deve ver:** redirecionamento para `/settings/security`. Card "Autenticação de dois fatores" mostra "Não ativado" + botão "Ativar 2FA".

4. Clique **Ativar 2FA**

   **Você deve ver:** dialog modal abre com "Passo 1 de 3", QR code grande no centro, e o secret abaixo (algo tipo `JBSWY3DPEHPK3PXP...`).

5. No celular: abra **Google Authenticator** → **+** → **Scan a QR code** → aponte para a tela.

   **Você deve ver:** entrada "La Financeiro: <seu-email>" aparece no app, com código de 6 dígitos rotativo (renova a cada 30s).

6. Clique **Próximo** no wizard.

   **Você deve ver:** "Passo 2 de 3", input OTP de 6 dígitos.

7. Digite o código atual do app autenticador.

   **Você deve ver:** botão "Confirmar" habilita ao chegar nos 6 dígitos. Após click, transição para "Passo 3 de 3".

8. **Passo 3:** 8 códigos de recuperação aparecem em grid 2x4. Banner vermelho "Salve estes códigos AGORA. Eles aparecem apenas uma vez."

9. Clique **Copiar tudo** → cole num gerenciador de senhas (1Password / Bitwarden). Marque o checkbox "Confirmo que salvei...". Clique **Concluir**.

   **Você deve ver:** toast "2FA ativado com sucesso", dialog fecha, card "Autenticação de dois fatores" agora mostra o dispositivo cadastrado com data e botão de lixeira.

### Validações (DB)

```sql
-- 1 fator verified
SELECT id, friendly_name, status, factor_type, created_at
FROM auth.mfa_factors WHERE user_id = '<seu-uuid>';
-- esperado: 1 row, status='verified', factor_type='totp'

-- 8 recovery codes não-usados
SELECT count(*), generated_batch_id
FROM public.mfa_recovery_codes
WHERE user_id = '<seu-uuid>' AND used_at IS NULL
GROUP BY generated_batch_id;
-- esperado: 1 row, count=8

-- audit log: recovery_codes_regenerated
SELECT event_type, metadata, created_at
FROM public.audit_logs
WHERE actor_user_id = '<seu-uuid>' ORDER BY created_at DESC LIMIT 5;
-- esperado: 1 row 'recovery_codes_regenerated' com count=8
```

---

## 2. Logout e Login com challenge

### Passos

1. No app: clique avatar/menu → **Sair**.

   **Você deve ver:** redirecionamento para `/auth`.

2. Faça login novamente com email + senha.

   **Você deve ver:** **NÃO** vai pra Dashboard direto. Em vez disso, redireciona pra `/mfa-challenge` — tela "Verificação de dois fatores" com input OTP de 6 dígitos.

3. Digite código atual do Google Authenticator.

   **Você deve ver:** auto-submit ao completar 6 dígitos. Loader spinner. Em ~1s, redireciona pra `/` (Dashboard) e a sessão fica AAL2.

### Validação no DevTools (Application → Local Storage)

A chave `sb-vbrdtxgsiwhgeexihgwk-auth-token` deve ter `aal: "aal2"` no JWT
decodificado (cole o `access_token` em jwt.io). Se for `aal1`, o challenge não
elevou — bug crítico.

---

## 3. Recovery code happy path

### Passos

1. Logout.
2. Login email+senha → tela `/mfa-challenge`.
3. Clique **Usar código de recuperação**.

   **Você deve ver:** input troca para texto livre com placeholder `XXXX-XXXX-XXXX-XXXX`.

4. Cole **um** dos 8 códigos salvos no passo 1.9.

5. Clique **Verificar**.

   **Você deve ver:**
   - Toast "Código de recuperação aceito"
   - Mensagem "MFA desativado via código de recuperação. Faça login novamente."
   - Redirecionamento para `/auth` (signOut global)

6. Tente login email+senha de novo.

   **Você deve ver:** **NÃO** pede mais MFA — vai direto pra Dashboard. (Porque a
   edge function deletou o factor TOTP.)

### Validação no DB

```sql
-- código consumido
SELECT id, used_at, used_ip, used_user_agent
FROM public.mfa_recovery_codes
WHERE used_at IS NOT NULL ORDER BY used_at DESC LIMIT 1;
-- esperado: 1 row, used_at=now-ish, used_ip preenchido

-- factor deletado
SELECT count(*) FROM auth.mfa_factors WHERE user_id = '<seu-uuid>';
-- esperado: 0

-- audit log do reset
SELECT event_type, metadata FROM public.audit_logs
WHERE actor_user_id = '<seu-uuid>' AND event_type IN ('mfa_reset_via_recovery','recovery_code_used')
ORDER BY created_at DESC LIMIT 5;
-- esperado: 2 rows ('recovery_code_used' do trigger + 'mfa_reset_via_recovery' do edge)
```

> **Após este teste, refaça o passo 1 (enroll) pra continuar com os próximos
> testes — todos eles assumem 2FA ativo.**

---

## 4. Recovery code rate-limit (errar 5x → 429)

### Passos

1. Logout.
2. Login email+senha → `/mfa-challenge` → **Usar código de recuperação**.
3. Tente 5 códigos errados em sequência (digite `XXXX-XXXX-XXXX-XXXX` ou
   `WRONGCODEHERE` etc.). Use **outro tab** se quiser, ou repita no mesmo.

   **Você deve ver nos primeiros 4-5 erros:** mensagem inline "Código inválido."

4. Na 6ª tentativa (ou em algum ponto entre 5-7 dependendo do timing):

   **Você deve ver:** "Muitas tentativas. Aguarde 15 minutos."

### Validação direta na edge (curl)

Substitua `<JWT_AAL1>` pelo `access_token` que está no localStorage **DURANTE
a tela `/mfa-challenge`** (não usar token de sessão AAL2!):

```bash
# 6 chamadas seguidas — a 5ª ou 6ª deve retornar 429
for i in $(seq 1 6); do
  echo "Attempt $i:"
  curl -s -o /dev/null -w "  HTTP %{http_code}\n" \
    -X POST https://vbrdtxgsiwhgeexihgwk.supabase.co/functions/v1/mfa-recovery-verify \
    -H "Authorization: Bearer <JWT_AAL1>" \
    -H "Content-Type: application/json" \
    -d '{"code":"WRONGCODEHEREXX"}'
done
```

**Você deve ver:** `HTTP 401` nas primeiras 4-5, `HTTP 429` daí em diante até
passar 15 minutos.

### Validação no DB

```sql
SELECT count(*), success FROM public.mfa_attempts
WHERE user_id = '<seu-uuid>' AND attempt_type = 'recovery'
GROUP BY success;
-- esperado: 5+ rows com success=false
```

```sql
SELECT event_type, count(*) FROM public.audit_logs
WHERE actor_user_id = '<seu-uuid>'
  AND event_type IN ('recovery_code_failed','mfa_recovery_rate_limited')
GROUP BY event_type;
-- esperado: 5 rows 'recovery_code_failed' + 1+ 'mfa_recovery_rate_limited'
```

---

## 5. Regenerar códigos de recuperação

### Passos

1. Estando logado em AAL2 (login completo + TOTP), vá em
   `/settings/security`.
2. No card "Autenticação de dois fatores", clique **Gerar novos códigos de recuperação**.

   **Você deve ver:** dialog "Novos códigos de recuperação" abre com loader.
   Em ~2-4s, 8 códigos novos aparecem em grid + banner "Salve estes códigos. Eles aparecem apenas uma vez."

3. Clique **Copiar tudo**, marque o checkbox "Confirmo que salvei...", clique
   **Concluir**.

   **Você deve ver:** dialog fecha. Os códigos antigos foram **invalidados**
   (DELETE no DB).

### Validação no DB

```sql
SELECT
  generated_batch_id,
  count(*) FILTER (WHERE used_at IS NULL) AS unused,
  count(*) FILTER (WHERE used_at IS NOT NULL) AS used
FROM public.mfa_recovery_codes
WHERE user_id = '<seu-uuid>'
GROUP BY generated_batch_id ORDER BY min(created_at) DESC;
-- esperado: 1 row (batch novo) com unused=8, used=0
-- (o batch antigo foi DELETADO pela edge — não aparece)

-- audit
SELECT event_type, metadata->>'count' AS code_count, created_at
FROM public.audit_logs
WHERE actor_user_id = '<seu-uuid>' AND event_type = 'recovery_codes_regenerated'
ORDER BY created_at DESC LIMIT 3;
```

### Validação direta (curl, opcional)

```bash
# Pegue um JWT AAL2 do localStorage do browser (após login + TOTP)
curl -s -X POST https://vbrdtxgsiwhgeexihgwk.supabase.co/functions/v1/mfa-recovery-generate \
  -H "Authorization: Bearer <JWT_AAL2>" \
  -H "Content-Type: application/json" \
  | jq '.codes | length, .batch_id'
# esperado: 8 \n "<uuid>"
```

Tente com JWT AAL1 (durante `/mfa-challenge`):

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://vbrdtxgsiwhgeexihgwk.supabase.co/functions/v1/mfa-recovery-generate \
  -H "Authorization: Bearer <JWT_AAL1>" \
  -H "Content-Type: application/json"
# esperado: 403 (aal2_required)
```

---

## 6. Unenroll com reauth

### Passos

1. Em `/settings/security` → card 2FA, clique no ícone de **lixeira** ao lado
   do dispositivo cadastrado.

   **Você deve ver:** AlertDialog "Desativar autenticação de dois fatores?".

2. Clique **Desativar**.

   **Você deve ver:** UM destes comportamentos:

   **(a)** Toast "2FA desativado", card volta pra "Não ativado" + botão "Ativar 2FA".
       → desejável, sessão estava AAL2 recente o suficiente.

   **(b)** Toast "Não foi possível desativar — Talvez você precise fazer login
       novamente recentemente." → Supabase rejeitou por reauth não recente.
       Faça logout, login + TOTP, e repita.

3. Verifique no DB:

```sql
SELECT count(*) FROM auth.mfa_factors WHERE user_id = '<seu-uuid>';
-- esperado após (a): 0

-- recovery codes ficam (não foram deletados pelo unenroll)
SELECT count(*) FROM public.mfa_recovery_codes WHERE user_id = '<seu-uuid>';
-- esperado: 8 (não tem cleanup automático no unenroll — ver finding 🟡 abaixo)
```

> **Finding 🟡 médio (qa-tester):** unenroll **não** apaga os recovery codes.
> Se o user re-enrolar, os 8 códigos antigos continuam válidos no
> banco. Não é vetor crítico (codes só funcionam pra factor existente do mesmo
> user), mas é higiene. Discutir com security-reviewer se vale fix nesta sprint.

---

## 7. Edge cases

### 7.1 Clock drift (TOTP de 30s)

1. No celular, vá em Configurações → Data/hora → desligue "Atualizar
   automaticamente". Mude o relógio em **+90 segundos**.
2. Abra Google Authenticator (mostra código baseado no horário modificado).
3. Tente login. Use o código exibido.

   **Você deve ver:** o backend Supabase aceita ±1 step (30s) de drift por
   padrão. **+90s deve falhar** ("Código inválido"). **±60s pode aceitar
   ou falhar dependendo do alinhamento exato do step.**

4. **Restaure** o horário automático no celular antes de continuar.

### 7.2 Sessão em 2 browsers (revogação global)

1. **Browser A (Chrome):** logado em AAL2.
2. **Browser B (Safari):** logado em AAL2 também (login completo + TOTP).
3. **Browser A:** vá em `/settings/security` e use um recovery code (passo 3
   acima).

   **Você deve ver no Browser A:** signOut imediato → `/auth`.

4. **Browser B (sem recarregar):** tente navegar para qualquer página.

   **Você deve ver:** **PROBLEMA conhecido (Risco R-A do architect):** a sessão
   B pode continuar funcionando até o refresh token expirar (~1h padrão).
   `auth.admin.signOut(userId, 'global')` revoga refresh tokens, mas o access
   token atual em uso pode permanecer válido até expirar.

5. Aguarde 5-10min ou force refresh do token (clique em qualquer ação que
   chame `supabase.auth.getSession`). Após refresh:

   **Você deve ver:** Browser B redireciona para `/auth` (token expirou ou
   refresh foi rejeitado).

### 7.3 Mobile (iOS Safari)

1. Abra https://lafinanceiro.ia.br no Safari iPhone.
2. Faça enroll (passo 1) usando 1Password OTP ou Authy.

   **Você deve ver:** wizard renderiza como **Drawer (vaul)** ao invés de
   Dialog (responsive). QR code visível, secret copiável (botão funciona via
   `navigator.clipboard.writeText` — iOS 14+ aceita).

3. Faça login com challenge.

   **Você deve ver:** `<InputOTP>` aceita teclado numérico nativo iOS, com
   sugestão de "Da Mensagens" (quando 2FA por SMS — não nosso caso, mas o
   `autoComplete="one-time-code"` ativa essa interface).

4. **Bug conhecido a verificar:** `recoveryCode` input com `autoCapitalize="characters"`
   e `inputMode="text"` — confirme que o iOS NÃO autocorrige o código (não
   deve, mas vale validar).

### 7.4 Network offline durante challenge

1. Em `/mfa-challenge`, abra DevTools → Network → **Offline**.
2. Digite código e tente verificar.

   **Você deve ver:** mensagem genérica de erro de rede. Form não trava
   permanentemente. Ao voltar online + tentar de novo, funciona.

### 7.5 Botão "voltar e sair" no challenge

1. Em `/mfa-challenge`, clique **Voltar e sair**.

   **Você deve ver:** signOut + redirect pra `/auth`. Sem dialog de confirmação
   (decisão UX — challenge não é destrutivo).

---

## 8. Smoke test final (recap rápido)

Execute em sequência, esperado tudo passar:

```bash
# 0. Build local pra garantir nada quebrou:
cd "/Users/andreeduardo/Documents/La Financeiro /lafinaceiro" && \
  npm run build && npm test
# esperado: build OK + 66 testes passando

# 1. Curl de health (anônimo, sem token):
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://vbrdtxgsiwhgeexihgwk.supabase.co/functions/v1/mfa-recovery-verify
# esperado: 401

curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://vbrdtxgsiwhgeexihgwk.supabase.co/functions/v1/mfa-recovery-generate
# esperado: 401

# 2. Curl com token AAL1 chamando endpoint de gerar (deve negar):
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://vbrdtxgsiwhgeexihgwk.supabase.co/functions/v1/mfa-recovery-generate \
  -H "Authorization: Bearer <JWT_AAL1>" \
  -H "Content-Type: application/json"
# esperado: 403

# 3. Curl com origin não permitida (CORS):
curl -s -i -X OPTIONS \
  https://vbrdtxgsiwhgeexihgwk.supabase.co/functions/v1/mfa-recovery-verify \
  -H "Origin: https://evil.example.com" \
  | grep "Access-Control-Allow-Origin"
# esperado: "Access-Control-Allow-Origin: null" (NÃO o evil)
```

---

## 9. Critério de aprovação

Marque cada bloco quando passar:

- [ ] Pré-requisitos manuais (0.1 - 0.5)
- [ ] Enroll (1) — 1 factor verified + 8 codes não-usados + audit log
- [ ] Login com challenge (2) — AAL2 alcançado
- [ ] Recovery happy path (3) — code consumido, factor deletado, signOut global
- [ ] Recovery rate-limit (4) — 429 após 5 tentativas
- [ ] Regenerar codes (5) — batch novo, antigo deletado
- [ ] Unenroll (6) — factor removido (com reauth se necessário)
- [ ] Edge cases (7.1 - 7.5) — pelo menos 7.1, 7.2, 7.3 testados
- [ ] Smoke test (8) — todos os curls retornam o esperado

> **Se algum item falhar, NÃO mergeie.** Reabra um ticket pro squad e
> documente o repro. O security-reviewer vai pedir esse roteiro completo
> antes de assinar a Parte I.

---

## Apêndice — Como pegar o JWT pra usar nos curls

1. Browser logado, DevTools → Application → Local Storage →
   `https://lafinanceiro.ia.br` (ou localhost).
2. Procure chave `sb-vbrdtxgsiwhgeexihgwk-auth-token`.
3. Copie o valor JSON. Procure `"access_token":"eyJhbGc..."` — use esse string
   inteiro como `<JWT_AAL1>` ou `<JWT_AAL2>` (depende do estado da sessão na
   hora de copiar).
4. **Não cole o JWT em logs/Slack.** Usa só localmente nos curls e apaga do
   histórico do shell depois (`history -d`).

## Apêndice — Reset total (recriar do zero)

Se algo entrar em estado inconsistente durante o teste, rode no SQL editor
(cuidado — destrutivo):

```sql
-- Apaga seus factors e codes (não toca em outros users)
DELETE FROM public.mfa_recovery_codes WHERE user_id = '<seu-uuid>';
DELETE FROM public.mfa_attempts WHERE user_id = '<seu-uuid>';
-- Audit logs ficam (R14 — imutável)

-- Apaga factor via service_role na função admin (não SQL):
-- usar Supabase JS admin no console: supabase.auth.admin.mfa.deleteFactor(...)
-- OU clicar no painel: Auth → Users → <user> → Multi-Factor → Remove Factor
```
