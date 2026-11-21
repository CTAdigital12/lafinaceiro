# Testes de RPC em Postgres descartável

> **Nenhum arquivo desta pasta vai para o SQL Editor do Supabase.** Quase todos
> começam com `truncate`/`drop table` (apagam `transactions` e outras tabelas) e
> usam comandos do `psql` (`\set`, `\i`). Em produção, só os arquivos de
> `supabase/migrations/`.

As RPCs deste projeto não são cobertas pelo `vitest` — ele testa TypeScript, e
a regra mora no banco. Estes scripts exercitam as funções de verdade num
cluster local que se joga fora no fim, sem tocar em produção e sem precisar de
um segundo projeto Supabase.

Foi assim que se provou que "Desfazer divisão" apagava parcela real
(`20260825150000`), e antes disso que as policies de `aal2` do A1 funcionavam.

## Como rodar

```sh
initdb -D /tmp/lfpg -U postgres -A trust
mkdir -p /tmp/lfs   # socket precisa de caminho CURTO: o limite é 103 bytes
pg_ctl -D /tmp/lfpg -o "-p 54329 -k /tmp/lfs -c listen_addresses=''" -l /tmp/lfpg.log start

psql -h /tmp/lfs -p 54329 -U postgres -q -f supabase/tests/schema.sql
for f in supabase/migrations/20260727120000_split_transaction.sql \
         supabase/migrations/20260824120000_split_transaction_recurring_rule.sql \
         supabase/migrations/20260824170000_settle_transactions_with_payment.sql \
         supabase/migrations/20260825150000_desfazer_divisao_nao_apaga_previsto_quitado.sql \
         supabase/migrations/20260828120000_quitacao_herda_categoria_do_pagamento.sql; do
  psql -h /tmp/lfs -p 54329 -U postgres -q -v ON_ERROR_STOP=1 -f "$f"
done

psql -h /tmp/lfs -p 54329 -U postgres -q -f supabase/tests/split_settle_unsplit.sql

# B5 — a descrição volta ao desfazer a divisão. Este script APLICA a própria
# migration no meio (`\i`), então rode-o por último: o primeiro bloco precisa
# do estado ANTERIOR a ela para reproduzir o defeito.
psql -h /tmp/lfs -p 54329 -U postgres -q -f supabase/tests/descricao_ao_desfazer_divisao.sql

# A suíte da fatura precisa da tabela `credit_cards`, que o schema.sql não tem
# (ele cobre só o que as RPCs de divisão tocam):
psql -h /tmp/lfs -p 54329 -U postgres -q -c "create table public.credit_cards (id uuid primary key, user_id uuid not null, name text not null, current_invoice numeric(12,2) not null default 0, status text not null default 'open');"
# `settle_reimbursement` (20260531) entra ANTES da fatura, na ordem real: a de
# 20260828 recria `unmark_reimbursed` por cima dela.
psql -h /tmp/lfs -p 54329 -U postgres -q -v ON_ERROR_STOP=1 -f supabase/migrations/20260531010000_reimbursement_external_payment.sql
psql -h /tmp/lfs -p 54329 -U postgres -q -v ON_ERROR_STOP=1 -f supabase/migrations/20260828120000_recompute_card_invoice.sql
psql -h /tmp/lfs -p 54329 -U postgres -q -f supabase/tests/recompute_card_invoice.sql

# Um PIX quitando várias despesas. Aplica a própria migration no meio (`\i`),
# como o B5, então vem por último.
psql -h /tmp/lfs -p 54329 -U postgres -q -f supabase/tests/um_pix_varias_despesas.sql

# Aporte em investimento: a divisão herda a flag. Também aplica a própria
# migration no meio (`\i`), depois das de divisão.
psql -h /tmp/lfs -p 54329 -U postgres -q -f supabase/tests/aporte_na_divisao.sql

# A receita do reembolso ganha "Reembolsos Diversos". Cria a própria tabela
# `categories` e aplica a própria migration no meio (`\i`). Precisa só do
# schema.sql e da 20260531010000; rode num banco onde as anteriores ainda não
# trocaram a categoria de nenhum PIX (ele trunca transactions no começo).
psql -h /tmp/lfs -p 54329 -U postgres -q -f supabase/tests/reembolso_recebe_categoria.sql

pg_ctl -D /tmp/lfpg stop
```

## Teste de POLICY (não de RPC)

`perfil_do_membro.sql` é diferente dos outros: ele exercita RLS, não uma
função. É autocontido — monta os stubs de `auth`, as tabelas, as policies reais
e o portão `require_aal2` do A1, roda a migration sem modificar e só então
mede. Também é rerrodável: derruba as próprias tabelas no começo.

```sh
psql -h /tmp/lfs -p 54329 -U postgres -q -v ON_ERROR_STOP=1 \
     -f supabase/tests/perfil_do_membro.sql
```

Cada cenário imprime `esperado`, `obtido` e um veredito; qualquer `FALHOU` na
saída é regressão. O primeiro bloco roda ANTES da migration e reproduz o
defeito — é o que prova que o teste mede alguma coisa.

## Duas armadilhas

- **RLS não se aplica ao dono da tabela nem a superusuário.** Estes scripts
  rodam como `postgres` e exercitam a LÓGICA das funções, não as policies. Para
  testar policy é preciso `set local role authenticated` — receita completa na
  migration do A1.
- Para provar que algo é RECUSADO, envolver em `do $$ ... exception when others`.
  Sem isso o psql aborta a transação e o resto do script não roda.

## Conta única (20261121180000)

Ver, alterar e apagar entre os dois logins. Autocontido: cria as próprias 12
tabelas com as policies de produção de 21/11/2026 e aplica a migration no meio
(`\i`). O primeiro bloco roda ANTES dela e reproduz o defeito.

```sh
psql -h /tmp/lfs -p 54329 -U postgres -q -v ON_ERROR_STOP=1 -f supabase/tests/conta_unica.sql
```

