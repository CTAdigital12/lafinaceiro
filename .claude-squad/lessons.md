# Lições da Squad — La Financeiro

Memória compartilhada do squad para este repositório. Cada entrada
descreve uma armadilha encontrada em produção que **não é óbvia** olhando
só o código atual. Sempre **leia antes** de começar uma task na área
afetada e **escreva no fim** se aprender algo novo.

Formato: **Lição** → contexto + sintoma + solução + arquivos/commits.

---

## L1 — `/bin/bash` no macOS é versão 3.2.x (sem `declare -A`)

**Contexto:** scripts shell no repo (`scripts/*.sh`) usam shebang
`#!/usr/bin/env bash`, que pega o **primeiro** `bash` no PATH. Em macOS
stock, esse é `/bin/bash` 3.2.57 — versão de 2007, anterior ao
`declare -A` (associative arrays, bash 4+).

**Sintoma:** ao carregar o script, erro de parsing antes de qualquer
comando ser executado:

```
script.sh: line N: tabela.coluna: syntax error: invalid arithmetic
operator (error token is ".coluna")
```

**Solução:** **não usar associative arrays** em scripts pensados pra
operador rodar localmente. Trocar por função com `case`:

```bash
expected_count() {
  case "$1" in
    "auth.users") echo 2 ;;
    "public.transactions") echo 698 ;;
    *) echo "" ;;
  esac
}
```

**Validação:** rodar `bash -n script.sh` em ambos `/bin/bash` (3.2) e
`bash` (5+) antes de commitar.

**Origem:** commit `ed4875f`. Detectado durante Fase 3.5 (`migrate-lovable-data.sh`).

---

## L2 — Generated columns precisam ser **filtradas do CSV** antes de `\copy`

**Contexto:** schemas modernos do Supabase usam GENERATED columns em
`auth.users` (`confirmed_at` = LEAST de email/phone) e `auth.identities`
(`email` derivado de `identity_data->>'email'`). PostgreSQL **proíbe**
qualquer `COPY ... FROM` em coluna gerada.

**Sintoma:** import do CSV exportado de outro Supabase falha com:

```
ERROR: column "confirmed_at" is a generated column
DETAIL: Generated columns cannot be used in COPY.
```

Mesmo que o valor no CSV seja idêntico ao que a expressão produziria.

**Solução:** **pré-processar o CSV** removendo a coluna antes do `\copy`.
Não basta tirar do `\copy table (col1, col2, ...)` porque `\copy` é
posicional — vai jogar o valor da coluna seguinte no lugar errado (ver L4).

```python
# scripts/migrate-lovable-data.sh — preprocess_csv_drop_columns()
import csv
with open(src) as fin, open(dst, "w") as fout:
    rdr = csv.reader(fin, delimiter=";")
    wtr = csv.writer(fout, delimiter=";")
    header = next(rdr)
    keep = [i for i, c in enumerate(header) if c not in skip]
    wtr.writerow([header[i] for i in keep])
    for row in rdr:
        wtr.writerow([row[i] for i in keep])
```

**Lista conhecida pra Supabase atual:**
- `auth.users.confirmed_at`
- `auth.identities.email`

**Origem:** commits `2f611a9`, `bad4d7f`. Detectado durante import da migração Lovable→Supabase próprio.

---

## L3 — GoTrue não tolera NULL em colunas de token de `auth.users`

**Contexto:** `auth.users` tem várias colunas string que aceitam NULL no
PostgreSQL (`confirmation_token`, `recovery_token`, `email_change_token_new`,
`email_change`, `phone_change`, `phone_change_token`, `reauthentication_token`).
Quando importa esses dados de outro Supabase, vêm como NULL.

**Sintoma:** o login retorna `Database error querying schema` para o
usuário. Nos auth-logs do Supabase aparece:

```json
{
  "msg": "500: Database error querying schema",
  "error": "error finding user: sql: Scan error on column index 3,
    name \"confirmation_token\": converting NULL to string is unsupported"
}
```

GoTrue (Go) usa structs com `string` (não `*string`/`sql.NullString`)
nessas colunas e o driver pgx quebra em NULL.

**Solução:** logo após importar `auth.users`, rodar UPDATE coercendo
NULLs pra strings vazias:

```sql
UPDATE auth.users SET
  confirmation_token       = COALESCE(confirmation_token,       ''),
  recovery_token           = COALESCE(recovery_token,           ''),
  email_change_token_new   = COALESCE(email_change_token_new,   ''),
  email_change             = COALESCE(email_change,             ''),
  phone_change             = COALESCE(phone_change,             ''),
  phone_change_token       = COALESCE(phone_change_token,       ''),
  reauthentication_token   = COALESCE(reauthentication_token,   '');
```

Já está embarcado no `scripts/migrate-lovable-data.sh import` (corre
dentro da mesma transação, antes do COMMIT).

**Origem:** commit `76c9e4b`. Detectado durante o smoke test de login E2E.

---

## L4 — `\copy` é POSICIONAL, não casa por nome de coluna

**Contexto:** `\copy table FROM file CSV HEADER` parece mapear colunas
pelo header, mas só usa o `HEADER` pra **pular** a primeira linha. A
inserção é puramente posicional — coluna 1 do file → coluna 1 da tabela
(na ordem do `CREATE TABLE`).

**Sintoma:** se o exportador (ex: Lovable SQL editor) escreve as colunas
em ordem **alfabética** mas a tabela destino tem ordem diferente, valores
acabam em colunas erradas. Erros típicos:

```
ERROR: invalid input syntax for type uuid: "authenticated"
CONTEXT: COPY users, line 2, column instance_id: "authenticated"
```

(O valor `"authenticated"` veio da coluna `aud` mas foi inserido como
`instance_id`.)

**Solução:** ler o header do CSV em runtime e enumerar as colunas
explicitamente no `\copy`:

```bash
header_line=$(head -1 "$file")
cols=$(printf '%s' "$header_line" | tr ';' ',')
echo "\\copy $table ($cols) FROM '$file' WITH (FORMAT csv, HEADER true, DELIMITER ';');"
```

Aí o PostgREST mapeia por nome.

**Origem:** commit `002ae88`. Detectado durante import.

---

## L5 — Lovable SQL editor exporta CSVs com `;` (delimiter pt-BR)

**Contexto:** "Export CSV" do SQL editor do Lovable Cloud escreve com
ponto-e-vírgula como separador (locale BR), não vírgula (default global).

**Sintoma:** `\copy ... CSV HEADER` (sem `DELIMITER`) lê a linha inteira
como uma única coluna, falhando com mismatch de count.

**Solução:** sempre passar `DELIMITER ';'` no `\copy` quando consumir
exports do Lovable:

```sql
\copy table (col1,...) FROM 'file.csv' WITH (FORMAT csv, HEADER true, DELIMITER ';');
```

Validar com:

```bash
head -1 file.csv | tr -cd ';' | wc -c   # > 0 = pt-BR delimiter
```

**Origem:** commit `1e222c3`.

---

## L6 — Lovable Cloud **não expõe** `SUPABASE_SERVICE_ROLE_KEY` em Secrets

**Contexto:** o painel **Cloud → Secrets** do Lovable lista apenas os
secrets que **você** criou para edge functions (`PLUGGY_*`,
`GOOGLE_AI_API_KEY`, etc). As variáveis `SUPABASE_URL`,
`SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são **auto-injetadas**
em runtime pelo Supabase nas edge functions, e não aparecem nessa lista.

**Sintoma:** sem service_role do Lovable, REST API com bypass de RLS
está fora. `pg_dump` direto também — Lovable não expõe a connection
string Postgres ao operador.

**Solução pra exportar dados:** usar **SQL editor + Export CSV**
manualmente (uma query por tabela). Cheatsheet em
`docs/MIGRATION_QUERIES.md`. Ordem FK-safe.

Valida o que dá pra fazer no Lovable antes:
1. `SELECT count(*) FROM auth.users` — se retorna número, schema `auth`
   é acessível.
2. Rodar uma query e verificar se o botão **Export CSV** aparece.
3. **Storage** → bucket: tem download por arquivo?

**Origem:** descoberta de 28/04 durante a Fase 3.5.

---

## L7 — Vercel + Supabase: separação rígida de keys

**Contexto:** Vercel é frontend público; qualquer env var (mesmo marcada
"Sensitive") é potencialmente acessível no bundle JS. Supabase tem três
tipos de chave: `anon`/`publishable` (público por design),
`service_role` (privilegiado), e DB password (Postgres direto).

**Regra (R1 + R2):**

| Env var | Vercel? | Supabase Secrets? |
|---|---|---|
| `VITE_SUPABASE_URL` | ✅ | (auto-injetada) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` (anon) | ✅ | (auto-injetada) |
| `VITE_SUPABASE_PROJECT_ID` | ✅ | n/a |
| `SUPABASE_SERVICE_ROLE_KEY` | ❌ **NUNCA** | ✅ |
| `GOOGLE_AI_API_KEY` | ❌ | ✅ |
| `PLUGGY_CLIENT_SECRET` | ❌ | ✅ |
| `PLUGGY_WEBHOOK_SECRET` | ❌ | ✅ |
| DB password / connection string | ❌ | manual em sessão de operador |

**Atenção:** Supabase agora suporta dois formatos de chave (`eyJ...`
JWT legacy e `sb_secret_...`/`sb_publishable_...` novo). Ambos
funcionam pra REST/Admin/Storage; scripts que decodam JWT (`cmd_check`)
precisam aceitar ambos.

**Origem:** auditoria security-reviewer (PR #1, 28/04). Setup de Vercel
com 3 env vars marcadas como Sensitive — confirmou-se no commit `3e68e1a`.

---

## Como atualizar este arquivo

- **Quando**: ao final de uma task, se identificar uma lição que
  vai economizar horas pra próxima invocação. Não é diário pessoal — só
  capture lições com **alto valor de reuso**.
- **Formato**: `## L<N> — <título imperativo curto>` + Contexto,
  Sintoma, Solução, Origem (commit/PR).
- **Tamanho**: até ~30 linhas por lição. Se passar, abra issue com PoC
  e linke aqui.
- **Versionamento**: PR padrão. Não rebase em main.
- **Precedência**: este arquivo NÃO substitui SECURITY_RULES.md ou
  CLAUDE.md — complementa com aprendizado de produção.
