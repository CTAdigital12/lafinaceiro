# Testes de RPC em Postgres descartável

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

# A suíte da fatura precisa da tabela `credit_cards`, que o schema.sql não tem
# (ele cobre só o que as RPCs de divisão tocam):
psql -h /tmp/lfs -p 54329 -U postgres -q -c "create table public.credit_cards (id uuid primary key, user_id uuid not null, name text not null, current_invoice numeric(12,2) not null default 0, status text not null default 'open');"
psql -h /tmp/lfs -p 54329 -U postgres -q -v ON_ERROR_STOP=1 -f supabase/migrations/20260828120000_recompute_card_invoice.sql
psql -h /tmp/lfs -p 54329 -U postgres -q -f supabase/tests/recompute_card_invoice.sql

pg_ctl -D /tmp/lfpg stop
```

## Duas armadilhas

- **RLS não se aplica ao dono da tabela nem a superusuário.** Estes scripts
  rodam como `postgres` e exercitam a LÓGICA das funções, não as policies. Para
  testar policy é preciso `set local role authenticated` — receita completa na
  migration do A1.
- Para provar que algo é RECUSADO, envolver em `do $$ ... exception when others`.
  Sem isso o psql aborta a transação e o resto do script não roda.
