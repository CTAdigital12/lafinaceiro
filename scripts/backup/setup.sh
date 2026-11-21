#!/bin/bash
# Configuração do backup local (uma vez por computador).
#
#   npm run backup:setup                     conexão + senha no Keychain + agendamento
#   setup.sh --so-agendamento                só reinstala o agendamento (após atualizar os scripts)
#
# A senha é digitada no prompt do próprio `security` e vai direto para o
# Keychain: não passa por arquivo, histórico do shell nem pelo repositório.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=common.sh
. "$SCRIPT_DIR/common.sh"

LABEL="br.com.lafinaceiro.backup"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
HOUR="${LAFIN_BACKUP_HOUR:-12}"

umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

configure_connection() {
  echo "Conexão com o banco (Supabase → Project Settings → Database → Connection string → Session pooler)."
  echo "Use o SESSION pooler (porta 5432): a conexão direta do plano gratuito só funciona por IPv6."
  echo
  read -r -p "Host (ex.: aws-0-sa-east-1.pooler.supabase.com): " host
  read -r -p "Porta [5432]: " port; port="${port:-5432}"
  read -r -p "Usuário (ex.: postgres.vbrdtxgsiwhgeexihgwk): " user
  [ -n "$host" ] && [ -n "$user" ] || { echo "host e usuário são obrigatórios"; exit 1; }

  {
    echo "# Gerado por scripts/backup/setup.sh. Sem segredo: a senha está no Keychain."
    printf 'PGHOST=%q\nPGPORT=%q\nPGUSER=%q\nPGDATABASE=postgres\n' "$host" "$port" "$user"
  } > "$CONF"

  echo
  echo "Agora a SENHA do banco (Database password). O macOS vai pedir duas vezes; nada aparece ao digitar."
  security add-generic-password -U -s "$KEYCHAIN_SERVICE" -a "$user" -T /usr/bin/security -w

  echo
  echo "Testando a conexão..."
  ( load_conf
    BIN="$(pick_pg_bin)" || { echo "pg_dump não encontrado. Instale: brew install postgresql@17"; exit 1; }
    "$BIN/psql" -XAtq -c "select 'conectado: ' || version()" )
}

install_schedule() {
  # Cópia dos scripts FORA de ~/Documents: o macOS restringe o acesso de tarefas
  # em segundo plano a Documents, e a pasta do projeto ainda é sincronizada pelo
  # iCloud. Rode de novo com --so-agendamento sempre que os scripts mudarem.
  mkdir -p "$BACKUP_DIR/bin"
  cp "$SCRIPT_DIR/common.sh" "$SCRIPT_DIR/backup-db.sh" "$SCRIPT_DIR/restore-to-local.sh" "$BACKUP_DIR/bin/"
  chmod 700 "$BACKUP_DIR/bin/"*.sh

  mkdir -p "$HOME/Library/LaunchAgents"
  cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$BACKUP_DIR/bin/backup-db.sh</string>
    <string>--se-preciso</string>
  </array>
  <!-- Todo dia às ${HOUR}h e também ao entrar na conta: se o Mac estava
       desligado no horário, a cópia do dia sai no login. --se-preciso evita
       mais de uma cópia automática por dia. -->
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>$HOUR</integer><key>Minute</key><integer>0</integer></dict>
  <key>RunAtLoad</key><true/>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>StandardOutPath</key><string>$BACKUP_DIR/launchd.log</string>
  <key>StandardErrorPath</key><string>$BACKUP_DIR/launchd.log</string>
</dict>
</plist>
PLIST

  launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST"
  echo "Agendamento instalado: todo dia às ${HOUR}h e ao entrar na conta ($PLIST)."
}

if [ "${1:-}" != "--so-agendamento" ]; then
  configure_connection
fi
install_schedule
echo
echo "Pronto. Cópias em: $BACKUP_DIR"
echo "Próximo passo: npm run backup && npm run backup:testar"
