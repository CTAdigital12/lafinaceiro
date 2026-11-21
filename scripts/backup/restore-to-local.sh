#!/bin/bash
# Prova que uma cópia VOLTA: restaura num Postgres descartável, local, e compara
# a contagem de linhas de cada tabela com a registrada no momento do backup.
# Não toca em produção. Apaga o Postgres temporário no fim.
#
#   npm run backup:testar                       testa a cópia mais recente
#   restore-to-local.sh <pasta-da-copia>        testa uma cópia específica
#   restore-to-local.sh <pasta> --manter        deixa o Postgres no ar para consultar
#
# Saída 0 = todas as tabelas batem. Qualquer diferença = saída 1.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=common.sh
. "$SCRIPT_DIR/common.sh"

copy="${1:-}"
keep="${2:-}"
if [ -z "$copy" ]; then
  copy="$( (ls -1d "$BACKUP_DIR"/lafinaceiro-20* 2>/dev/null | grep -v '\.partial$' | sort | tail -1) || true)"
fi
[ -n "$copy" ] && [ -d "$copy" ] || { echo "nenhuma cópia encontrada em $BACKUP_DIR"; exit 1; }
for f in public.dump auth.dump counts.tsv SHA256SUMS; do
  [ -f "$copy/$f" ] || { echo "cópia incompleta: falta $f em $copy"; exit 1; }
done

echo "== conferindo integridade (SHA256) de $(basename "$copy")"
(cd "$copy" && shasum -a 256 -c SHA256SUMS)

BIN="$(pick_pg_bin)" || { echo "pg_restore não encontrado"; exit 1; }

# Caminho CURTO: o socket Unix tem limite de 103 bytes.
tmp="$(mktemp -d /tmp/lfr.XXXXXX)"
port=54339
cleanup() {
  [ "$keep" = "--manter" ] && return 0
  "$BIN/pg_ctl" -D "$tmp/data" stop -m fast >/dev/null 2>&1 || true
  rm -rf -- "$tmp"
}
trap cleanup EXIT

"$BIN/initdb" -D "$tmp/data" -U postgres -A trust >/dev/null
"$BIN/pg_ctl" -D "$tmp/data" -o "-p $port -k $tmp -c listen_addresses=''" -l "$tmp/pg.log" -w start >/dev/null

# Daqui em diante, o Postgres local — nunca o de produção.
unset PGPASSWORD PGSSLMODE PGUSER PGDATABASE PGPORT
export PGHOST="$tmp" PGPORT="$port" PGUSER=postgres PGDATABASE=postgres
psql_local() { "$BIN/psql" -XAtq -v ON_ERROR_STOP=1 "$@"; }

# O mínimo do Supabase para o schema public carregar: papéis citados nas
# policies, schemas auth/extensions e as funções auth.* usadas nas regras.
psql_local <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create role supabase_auth_admin nologin;
create schema auth; create schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create function auth.role() returns text language sql stable as $$ select null::text $$;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create function auth.email() returns text language sql stable as $$ select null::text $$;
SQL

echo "== restaurando (erros de objetos exclusivos do Supabase são esperados e não contam)"
"$BIN/pg_restore" --no-owner --no-privileges -d postgres "$copy/auth.dump"   > "$tmp/auth.err"   2>&1 || true
"$BIN/pg_restore" --no-owner --no-privileges -d postgres "$copy/public.dump" > "$tmp/public.err" 2>&1 || true
echo "   avisos do pg_restore: auth $(grep -c 'error:' "$tmp/auth.err" || true), public $(grep -c 'error:' "$tmp/public.err" || true) (detalhes em $tmp/*.err com --manter)"

echo "== comparando linhas por tabela"
psql_local -F $'\t' -c "$COUNTS_SQL" > "$tmp/restored.tsv"

fail=0
while IFS=$'\t' read -r table expected; do
  got="$(awk -F'\t' -v t="$table" '$1==t{print $2}' "$tmp/restored.tsv")"
  if [ "$got" = "$expected" ]; then
    printf '   ok      %-45s %s\n' "$table" "$expected"
  else
    printf '   DIFERE  %-45s esperado %s, restaurado %s\n' "$table" "$expected" "${got:-AUSENTE}"
    fail=1
  fi
done < "$copy/counts.tsv"

if [ "$fail" -eq 0 ]; then
  echo "== RESTAURAÇÃO OK: todas as tabelas voltaram com o mesmo número de linhas."
else
  echo "== RESTAURAÇÃO COM DIFERENÇAS (veja acima)."
fi
if [ "$keep" = "--manter" ]; then
  echo "   Postgres no ar: psql -h $tmp -p $port -U postgres   (parar: pg_ctl -D $tmp/data stop)"
fi
exit "$fail"
