# Partes comuns dos scripts de backup. Não executar direto: `source`.
#
# Nada de segredo aqui nem no repositório (ele é PÚBLICO):
#   - host/porta/usuário ficam em $BACKUP_DIR/backup.conf, fora do Git;
#   - a senha fica no Keychain do macOS (serviço $KEYCHAIN_SERVICE).
# Variáveis de ambiente PG* e LAFIN_BACKUP_DIR têm precedência — é assim que
# os scripts são testados contra um Postgres local descartável.
#
# Compatível com o bash 3.2 do macOS (sem arrays associativos).

BACKUP_DIR="${LAFIN_BACKUP_DIR:-$HOME/Backups/lafinaceiro}"
CONF="$BACKUP_DIR/backup.conf"
KEYCHAIN_SERVICE="lafinaceiro-db-backup"
KEEP_DAYS="${LAFIN_KEEP_DAYS:-30}"       # todas as cópias dos últimos 30 dias com backup
KEEP_MONTHS="${LAFIN_KEEP_MONTHS:-12}"   # depois, 1 por mês durante 12 meses

log()  { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
die()  { log "ERRO: $*"; notify "Backup do La Financeiro FALHOU" "$*"; exit 1; }

notify() {
  # Notificação na tela; falha silenciosa fora de sessão gráfica.
  [ -n "${LAFIN_NO_NOTIFY:-}" ] && { log "(notificação suprimida) $1: $2"; return 0; }
  local t="${1//\"/\'}" m="${2//\"/\'}"
  osascript -e "display notification \"$m\" with title \"$t\" sound name \"Basso\"" >/dev/null 2>&1 || true
}

# pg_dump do Homebrew de versão mais alta instalada. O pg_dump recusa servidor
# de versão maior que a dele, então a mais nova é a escolha segura.
pick_pg_bin() {
  local v d
  for v in 18 17 16 15; do
    d="/opt/homebrew/opt/postgresql@$v/bin"
    if [ -x "$d/pg_dump" ]; then echo "$d"; return 0; fi
  done
  if command -v pg_dump >/dev/null 2>&1; then dirname "$(command -v pg_dump)"; return 0; fi
  return 1
}

load_conf() {
  if [ -f "$CONF" ]; then
    # shellcheck disable=SC1090
    . "$CONF"
  fi
  [ -n "${PGHOST:-}" ] || die "sem configuração ($CONF não existe). Rode: npm run backup:setup"
  export PGHOST PGPORT="${PGPORT:-5432}" PGUSER="${PGUSER:-postgres}" PGDATABASE="${PGDATABASE:-postgres}"
  export PGSSLMODE="${PGSSLMODE:-require}"
  export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-20}"
  if [ -z "${PGPASSWORD:-}" ]; then
    PGPASSWORD="$(security find-generic-password -s "$KEYCHAIN_SERVICE" -a "$PGUSER" -w 2>/dev/null)" \
      || die "senha do banco não está no Keychain. Rode: npm run backup:setup"
    export PGPASSWORD
  fi
}

# Contagem EXATA de linhas por tabela (public + as duas de auth que o backup
# leva). Banco pequeno: count(*) em todas custa pouco e não depende das
# estatísticas do Postgres, que podem estar velhas.
COUNTS_SQL="
select table_schema || '.' || table_name,
       (xpath('/row/c/text()', query_to_xml(
          format('select count(*) as c from %I.%I', table_schema, table_name),
          false, true, '')))[1]::text
  from information_schema.tables
 where table_type = 'BASE TABLE'
   and (table_schema = 'public'
        or (table_schema = 'auth' and table_name in ('users', 'identities')))
 order by 1;"
