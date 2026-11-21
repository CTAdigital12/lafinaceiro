#!/bin/bash
# Backup completo do banco do La Financeiro para o computador local.
#
#   npm run backup              cópia agora (use ANTES de qualquer SQL que altere dados)
#   backup-db.sh --se-preciso   só faz se ainda não houver cópia hoje (usado pelo agendamento)
#
# Cada cópia é uma pasta  $BACKUP_DIR/lafinaceiro-AAAA-MM-DD-HHMM/  com:
#   public.dump   schema public inteiro (pg_dump -Fc)
#   auth.dump     auth.users e auth.identities (quem é dono de cada linha)
#   counts.tsv    linhas por tabela no momento da cópia
#   SHA256SUMS    para conferir que os arquivos não mudaram
#
# A pasta só ganha o nome final depois de tudo conferido; cópia pela metade fica
# como *.partial e é descartada na próxima execução.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=common.sh
. "$SCRIPT_DIR/common.sh"

umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
LOG="$BACKUP_DIR/backup.log"
exec > >(tee -a "$LOG") 2>&1

trap 'die "erro inesperado na linha $LINENO (detalhes em $LOG)"' ERR

if [ "${1:-}" = "--se-preciso" ]; then
  today="$(date +%Y-%m-%d)"
  if ls -d "$BACKUP_DIR"/lafinaceiro-"$today"-[0-9][0-9][0-9][0-9] >/dev/null 2>&1; then
    log "já existe cópia de hoje; nada a fazer"
    exit 0
  fi
fi

load_conf
BIN="$(pick_pg_bin)" || die "pg_dump não encontrado. Instale: brew install postgresql@17"

server_num="$("$BIN/psql" -XAtq -c 'show server_version_num')" \
  || die "não conectou em $PGHOST:$PGPORT como $PGUSER (senha, rede ou projeto pausado?)"
server_major=$((server_num / 10000))
client_major="$("$BIN/pg_dump" --version | sed -E 's/^[^0-9]*([0-9]+).*/\1/')"
if [ "$server_major" -gt "$client_major" ]; then
  die "servidor é Postgres $server_major e o pg_dump é $client_major. Rode: brew install postgresql@$server_major"
fi

# Restos de execução interrompida.
for p in "$BACKUP_DIR"/lafinaceiro-*.partial; do
  [ -d "$p" ] && rm -rf -- "$p"
done

stamp="$(date +%Y-%m-%d-%H%M)"
final="$BACKUP_DIR/lafinaceiro-$stamp"
if [ -e "$final" ]; then final="$final-$(date +%S)"; fi
work="$final.partial"
mkdir "$work"

log "copiando de $PGHOST (Postgres $server_major, pg_dump $client_major) para $final"

"$BIN/pg_dump" -Fc --no-owner --no-privileges -n public -f "$work/public.dump"
"$BIN/pg_dump" -Fc --no-owner --no-privileges -t auth.users -t auth.identities -f "$work/auth.dump"
"$BIN/psql" -XAtq -F $'\t' -c "$COUNTS_SQL" > "$work/counts.tsv"

# Conferência: os dumps abrem e trazem dados.
for f in public auth; do
  n="$("$BIN/pg_restore" --list "$work/$f.dump" | grep -c 'TABLE DATA' || true)"
  [ "$n" -gt 0 ] || die "$f.dump não tem nenhuma tabela com dados"
done
tx_now="$(awk -F'\t' '$1=="public.transactions"{print $2}' "$work/counts.tsv")"
[ -n "$tx_now" ] || die "a contagem não achou public.transactions"

(cd "$work" && shasum -a 256 public.dump auth.dump counts.tsv > SHA256SUMS)
mv "$work" "$final"

size="$(du -sh "$final" | cut -f1)"
log "ok: $final ($size, $tx_now transações)"

# Alarme: transações caíram muito desde a cópia anterior. A cópia de hoje fica,
# mas as antigas NÃO são podadas — são elas que salvam o dia nesse caso.
prev="$( (ls -1d "$BACKUP_DIR"/lafinaceiro-20* 2>/dev/null | grep -v '\.partial$' | sort | grep -B1 -x "$final" | head -1) || true)"
if [ -n "$prev" ] && [ "$prev" != "$final" ] && [ -f "$prev/counts.tsv" ]; then
  tx_prev="$(awk -F'\t' '$1=="public.transactions"{print $2}' "$prev/counts.tsv")"
  if [ -n "$tx_prev" ] && [ "$tx_prev" -gt 0 ] && [ $((tx_now * 100)) -lt $((tx_prev * 80)) ]; then
    log "ALERTA: transações caíram de $tx_prev para $tx_now desde $(basename "$prev"). Poda suspensa."
    notify "La Financeiro: transações SUMIRAM?" "Eram $tx_prev, agora $tx_now. Backups antigos preservados em $BACKUP_DIR"
    exit 2
  fi
fi

# Poda: todas as cópias dos últimos KEEP_DAYS dias com backup; antes disso, a
# mais recente de cada mês, por KEEP_MONTHS meses. Só toca em pastas com o
# padrão de nome dentro de $BACKUP_DIR.
days=0; last_day=""; months=0; last_month=""
all="$( (ls -1d "$BACKUP_DIR"/lafinaceiro-20* 2>/dev/null | grep -v '\.partial$' | sort -r) || true)"
for d in $all; do
  [ -d "$d" ] || continue
  name="$(basename "$d")"
  day="${name:12:10}"; month="${name:12:7}"
  if [ "$day" != "$last_day" ]; then days=$((days + 1)); last_day="$day"; fi
  [ "$days" -le "$KEEP_DAYS" ] && continue
  if [ "$month" != "$last_month" ] && [ "$months" -lt "$KEEP_MONTHS" ]; then
    last_month="$month"; months=$((months + 1)); continue
  fi
  log "poda: removendo $name"
  rm -rf -- "$d"
done
