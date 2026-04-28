# Cheatsheet — exportar dados do Lovable Cloud (Fase 3.5)

Use este guia para extrair todos os dados do projeto antigo do Lovable
e gerar 18 arquivos CSV em `/tmp/lovable-export/`. Os CSVs são
posteriormente importados no Supabase novo via
`scripts/migrate-lovable-data.sh import`.

## Antes de começar

1. Garante que ninguém vai usar o app no Lovable nas próximas
   ~30 minutos (evita drift entre export e import).
2. No terminal, cria a pasta com permissão restrita:
   ```bash
   mkdir -p /tmp/lovable-export
   chmod 700 /tmp/lovable-export
   ```
3. Abre o **SQL editor** no painel Cloud do Lovable (menu lateral, ícone `>_`).

## Ordem das queries

A ordem importa por causa das foreign keys. Roda **uma query por vez**,
clica **Export CSV**, salva em `/tmp/lovable-export/<nome>.csv`
respeitando o nome exato da tabela.

⚠️ Não usar `SELECT *` em `auth.users` — o schema `auth` pode ter colunas
geradas que quebram o import. A query 1 lista colunas explicitamente.

### 1. `auth_users.csv`

```sql
SELECT
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_user_meta_data,
  raw_app_meta_data,
  aud,
  role,
  instance_id,
  confirmation_token,
  confirmation_sent_at,
  recovery_token,
  recovery_sent_at,
  email_change_token_new,
  email_change,
  email_change_sent_at,
  last_sign_in_at,
  phone,
  phone_confirmed_at,
  phone_change,
  phone_change_token,
  phone_change_sent_at,
  confirmed_at,
  banned_until,
  reauthentication_token,
  reauthentication_sent_at,
  is_sso_user,
  deleted_at,
  is_anonymous
FROM auth.users;
```

### 2. `auth_identities.csv`

```sql
SELECT * FROM auth.identities;
```

### 3-18. Tabelas de domínio (em ordem FK-safe)

| # | Query | Arquivo |
|---|---|---|
| 3 | `SELECT * FROM public.profiles;` | `profiles.csv` |
| 4 | `SELECT * FROM public.categories;` | `categories.csv` |
| 5 | `SELECT * FROM public.accounts;` | `accounts.csv` |
| 6 | `SELECT * FROM public.credit_cards;` | `credit_cards.csv` |
| 7 | `SELECT * FROM public.credit_card_invoices;` | `credit_card_invoices.csv` |
| 8 | `SELECT * FROM public.categorization_rules;` | `categorization_rules.csv` |
| 9 | `SELECT * FROM public.budgets;` | `budgets.csv` |
| 10 | `SELECT * FROM public.recurring_rules;` | `recurring_rules.csv` |
| 11 | `SELECT * FROM public.pluggy_items;` | `pluggy_items.csv` |
| 12 | `SELECT * FROM public.projects;` | `projects.csv` |
| 13 | `SELECT * FROM public.investment_institutions;` | `investment_institutions.csv` |
| 14 | `SELECT * FROM public.investment_assets;` | `investment_assets.csv` |
| 15 | `SELECT * FROM public.investment_transactions;` | `investment_transactions.csv` |
| 16 | `SELECT * FROM public.transactions;` | `transactions.csv` |
| 17 | `SELECT * FROM public.shared_access;` | `shared_access.csv` |
| 18 | `SELECT * FROM public.invitations;` | `invitations.csv` |

### Volume esperado (para você comparar)

Counts conhecidos do snapshot do painel Cloud:

| Tabela | Linhas |
|---|---|
| auth.users | 2 |
| transactions | 698 |
| budgets | 220 |
| categories | 103 |
| categorization_rules | 31 |

As outras tabelas costumam ter muito menos linhas (ou zero). Tudo bem
um CSV chegar vazio — isso significa que aquela tabela ainda não tinha
dados no antigo.

## Validação local

```bash
ls /tmp/lovable-export/*.csv | wc -l   # deve retornar 18
```

Se retornar menos de 18, alguma query foi pulada — confere a lista
acima.

## Próximo passo

Rodar `./scripts/migrate-lovable-data.sh check` (validação dos pré-
requisitos) e depois `./scripts/migrate-lovable-data.sh import`
(aplica os CSVs no Supabase novo via `psql \copy`).

---

## Notas de segurança

- Os CSVs contêm PII: emails, hashes de senha (`encrypted_password`),
  valores financeiros, descrições de transações.
- Tratamento mandatório:
  - `chmod 700 /tmp/lovable-export` antes de qualquer download.
  - `rm -rf /tmp/lovable-export` imediatamente após o gate de counts
    pós-import passar.
  - Não compartilhar via email, chat, drive público — manter local.
- Se o SQL editor do Lovable expuser preview do resultado em screen
  share, fechar antes de continuar.
