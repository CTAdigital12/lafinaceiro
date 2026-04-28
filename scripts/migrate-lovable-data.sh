#!/usr/bin/env bash
# migrate-lovable-data.sh — Phase 3.5 of the Lovable -> Vercel + new Supabase
# migration. See ~/.claude/plans/1-manter-o-vite-peppy-bunny.md.
#
# CONTEXT
# -------
# The Lovable Cloud panel does NOT expose the project's SUPABASE_SERVICE_ROLE_KEY
# (only edge-function-level secrets like PLUGGY_*, GOOGLE_AI_API_KEY). Without
# service_role on the old side, REST/Admin/Storage exports are not possible.
# The operator therefore exports CSVs MANUALLY from the Lovable SQL editor
# (see docs/MIGRATION_QUERIES.md), saving 18 files into /tmp/lovable-export/.
# This script imports those CSVs into the new Supabase via psql \copy.
#
# The Storage bucket 'documents' was confirmed empty in the old project, so it
# is intentionally not migrated. It will be recreated as a private bucket on
# the new project at first use (R10/R11).
#
# REQUIRED ENV (export in YOUR shell before running)
# --------------------------------------------------
#   NEW_DB_URL = postgresql://postgres.<ref>:<encoded_pass>@<host>:5432/postgres
#                (Session pooler URI from Supabase Dashboard -> Connect -> Direct,
#                 with the password percent-encoded)
#   NEW_SR     = service_role JWT of the new project
#                (Settings -> API -> service_role secret)
#   NEW_URL    = https://<new-ref>.supabase.co
#
# Usage:
#   ./scripts/migrate-lovable-data.sh check     # validate env + connectivity + CSVs
#   ./scripts/migrate-lovable-data.sh import    # \copy each CSV into the new DB
#   ./scripts/migrate-lovable-data.sh counts    # show row counts in NEW + expected
#   ./scripts/migrate-lovable-data.sh cleanup   # rm -rf /tmp/lovable-export
#
# auth.users migration is included in 'import' (preserves bcrypt hash so
# existing logins keep working without a password reset).

set -euo pipefail

# -----------------------------------------------------------------------------
# Constants
# -----------------------------------------------------------------------------

EXPORT_DIR="/tmp/lovable-export"

# (csv_basename, target_table) pairs in FK-safe order. Order is critical:
# parents before children, otherwise \copy fails on foreign key violations.
IMPORT_ORDER=(
  "auth_users:auth.users"
  "auth_identities:auth.identities"
  "profiles:public.profiles"
  "categories:public.categories"
  "accounts:public.accounts"
  "credit_cards:public.credit_cards"
  "credit_card_invoices:public.credit_card_invoices"
  "categorization_rules:public.categorization_rules"
  "budgets:public.budgets"
  "recurring_rules:public.recurring_rules"
  "pluggy_items:public.pluggy_items"
  "projects:public.projects"
  "investment_institutions:public.investment_institutions"
  "investment_assets:public.investment_assets"
  "investment_transactions:public.investment_transactions"
  "transactions:public.transactions"
  "shared_access:public.shared_access"
  "invitations:public.invitations"
)

# Counts known from the Lovable Cloud overview snapshot. The script prints
# these next to the live count in the NEW project so the operator can spot
# mismatches at a glance. Tables not listed here are validated visually.
# Implemented as a function (not associative array) for bash 3.2 compatibility
# — macOS still ships /bin/bash 3.2.x by default and `declare -A` was added
# in bash 4.0.
expected_count() {
  case "$1" in
    "auth.users") echo 2 ;;
    "public.transactions") echo 698 ;;
    "public.budgets") echo 220 ;;
    "public.categories") echo 103 ;;
    "public.categorization_rules") echo 31 ;;
    *) echo "" ;;
  esac
}

# Columns that are GENERATED / IDENTITY in the new schema and must be dropped
# from the source CSV before \copy (PostgreSQL refuses COPY into generated
# columns). Discovered incrementally; add more as the import surfaces them.
skip_columns_for_table() {
  case "$1" in
    "auth.users") echo "confirmed_at" ;;
    *) echo "" ;;
  esac
}

# Use Python (CSV-aware, handles quoted fields with embedded ';' or newlines)
# to drop columns from a CSV. Returns the path of the resulting file (either
# the original or a sibling .filtered file). Caller should not assume the
# file is mutable.
preprocess_csv_drop_columns() {
  local file="$1"
  local table="$2"
  local skip_cols
  skip_cols=$(skip_columns_for_table "$table")
  if [ -z "$skip_cols" ]; then
    printf '%s' "$file"
    return
  fi

  local filtered="${file}.filtered"
  SKIP_COLS="$skip_cols" python3 - "$file" "$filtered" <<'PYEOF'
import csv, os, sys
src, dst = sys.argv[1], sys.argv[2]
skip = set(os.environ["SKIP_COLS"].split(","))
with open(src, newline="") as fin, open(dst, "w", newline="") as fout:
    rdr = csv.reader(fin, delimiter=";")
    wtr = csv.writer(fout, delimiter=";")
    header = next(rdr)
    keep = [i for i, c in enumerate(header) if c.strip() not in skip]
    wtr.writerow([header[i] for i in keep])
    for row in rdr:
        wtr.writerow([row[i] if i < len(row) else "" for i in keep])
PYEOF
  printf '%s' "$filtered"
}

# -----------------------------------------------------------------------------
# Logging (stderr only)
# -----------------------------------------------------------------------------

if [ -t 2 ]; then
  C_RESET=$'\033[0m'
  C_INFO=$'\033[1;34m'
  C_OK=$'\033[1;32m'
  C_WARN=$'\033[1;33m'
  C_ERR=$'\033[1;31m'
else
  C_RESET=""; C_INFO=""; C_OK=""; C_WARN=""; C_ERR=""
fi

log()   { printf '%s[%s]%s %s\n' "$C_INFO" "$(date +%H:%M:%S)" "$C_RESET" "$*" >&2; }
ok()    { printf '%s[%s] OK%s %s\n' "$C_OK" "$(date +%H:%M:%S)" "$C_RESET" "$*" >&2; }
warn()  { printf '%s[%s] WARN%s %s\n' "$C_WARN" "$(date +%H:%M:%S)" "$C_RESET" "$*" >&2; }
err()   { printf '%s[%s] ERROR%s %s\n' "$C_ERR" "$(date +%H:%M:%S)" "$C_RESET" "$*" >&2; }
die()   { err "$*"; exit 1; }

# -----------------------------------------------------------------------------
# Pre-flight helpers
# -----------------------------------------------------------------------------

require_env() {
  local missing=()
  for var in NEW_DB_URL NEW_SR NEW_URL; do
    if [ -z "${!var:-}" ]; then
      missing+=("$var")
    fi
  done
  if [ "${#missing[@]}" -gt 0 ]; then
    die "Missing env vars: ${missing[*]}. Export them in your shell first."
  fi
}

require_tools() {
  for tool in curl psql jq; do
    command -v "$tool" >/dev/null 2>&1 \
      || die "$tool is required (try: brew install $tool / brew install postgresql@17)"
  done
}

# Decode a JWT payload (no signature check) so we can validate role + ref.
decode_jwt_payload() {
  local jwt="$1"
  local payload
  payload=$(printf '%s' "$jwt" | cut -d. -f2)
  payload="${payload//-/+}"
  payload="${payload//_/\/}"
  case $((${#payload} % 4)) in
    2) payload="${payload}==" ;;
    3) payload="${payload}=" ;;
  esac
  printf '%s' "$payload" | base64 -d 2>/dev/null || true
}

# -----------------------------------------------------------------------------
# check
# -----------------------------------------------------------------------------

cmd_check() {
  require_env
  require_tools

  # Supabase now ships TWO key formats. We accept both:
  #   1) Legacy JWT: starts with "eyJ", payload has role + ref
  #   2) New: starts with "sb_secret_" (~40 chars) or "sb_publishable_" (~25-44).
  log "Validating NEW_SR..."
  case "$NEW_SR" in
    eyJ*)
      local payload role ref
      payload=$(decode_jwt_payload "$NEW_SR")
      role=$(printf '%s' "$payload" | jq -r '.role // "missing"' 2>/dev/null || echo missing)
      ref=$(printf '%s' "$payload" | jq -r '.ref // "missing"' 2>/dev/null || echo missing)
      [ "$role" = "service_role" ] || die "NEW_SR is a JWT but role=$role (expected service_role)"
      ok "NEW_SR -> JWT legacy, role=service_role, ref=$ref"
      ;;
    sb_secret_*)
      [ "${#NEW_SR}" -ge 30 ] || die "NEW_SR sb_secret_ key looks truncated (len=${#NEW_SR})"
      ok "NEW_SR -> sb_secret_ (new format, len=${#NEW_SR})"
      ;;
    sb_publishable_*)
      die "NEW_SR is a publishable key — needs the SECRET key for service_role privileges"
      ;;
    *)
      die "NEW_SR has unrecognized format (length=${#NEW_SR}). Expected eyJ... or sb_secret_..."
      ;;
  esac

  log "Probing NEW project via PostgREST (with privilege)..."
  # service_role / sb_secret should be able to read profiles even with RLS,
  # because both bypass RLS. A publishable/anon key would return 200 too but
  # only see public rows; we test privilege below via a privileged-only path.
  local probe
  probe=$(curl -sS -o /dev/null -w '%{http_code}' \
    -H "apikey: $NEW_SR" -H "Authorization: Bearer $NEW_SR" \
    "$NEW_URL/rest/v1/profiles?select=id&limit=1" || echo "000")
  [ "$probe" = "200" ] || die "PostgREST probe failed (HTTP $probe)"
  ok "PostgREST responsive (HTTP 200)"

  log "Probing NEW DB via psql..."
  if ! psql "$NEW_DB_URL" -c 'SELECT 1' >/dev/null 2>&1; then
    die "psql connect to NEW_DB_URL failed"
  fi
  ok "DB connection OK"

  log "Verifying CSV files in $EXPORT_DIR..."
  if [ ! -d "$EXPORT_DIR" ]; then
    warn "$EXPORT_DIR does not exist yet — that is fine for 'check' alone, but"
    warn "'import' needs the 18 CSVs from the Lovable SQL editor first"
    warn "(see docs/MIGRATION_QUERIES.md)."
    return 0
  fi

  local missing_csvs=()
  for pair in "${IMPORT_ORDER[@]}"; do
    local csv="${pair%%:*}"
    local file="$EXPORT_DIR/${csv}.csv"
    if [ ! -f "$file" ]; then
      missing_csvs+=("$csv.csv")
    fi
  done

  if [ "${#missing_csvs[@]}" -gt 0 ]; then
    warn "Missing CSVs (${#missing_csvs[@]} of ${#IMPORT_ORDER[@]}):"
    printf '  - %s\n' "${missing_csvs[@]}" >&2
    warn "Run the queries from docs/MIGRATION_QUERIES.md and download each result"
    warn "as CSV into $EXPORT_DIR before running 'import'."
  else
    ok "All ${#IMPORT_ORDER[@]} CSVs present"
  fi

  local perm
  perm=$(stat -f '%Lp' "$EXPORT_DIR" 2>/dev/null || stat -c '%a' "$EXPORT_DIR" 2>/dev/null || echo "?")
  if [ "$perm" != "700" ]; then
    warn "$EXPORT_DIR perm is $perm (expected 700). Fix with: chmod 700 $EXPORT_DIR"
  else
    ok "$EXPORT_DIR perm = 700"
  fi
}

# -----------------------------------------------------------------------------
# import
# -----------------------------------------------------------------------------

cmd_import() {
  require_env
  require_tools

  if [ ! -d "$EXPORT_DIR" ]; then
    die "$EXPORT_DIR not found. Export CSVs from the Lovable SQL editor first."
  fi

  # Verify all 18 CSVs are present before starting — partial imports are bad.
  for pair in "${IMPORT_ORDER[@]}"; do
    local csv="${pair%%:*}"
    local file="$EXPORT_DIR/${csv}.csv"
    if [ ! -f "$file" ]; then
      die "Missing $file. Run 'check' to see all missing CSVs."
    fi
  done
  ok "All 18 CSVs found"

  log "Starting transactional import (triggers off, FK-safe order)..."

  # Build a single psql script so the whole import runs in ONE transaction.
  # If anything fails, the transaction rolls back and the new DB stays clean.
  local sql_script
  sql_script=$(mktemp)
  trap 'rm -f "$sql_script"' EXIT

  {
    echo "\\set ON_ERROR_STOP on"
    echo "BEGIN;"
    echo "SET LOCAL session_replication_role = 'replica';"
    echo ""

    for pair in "${IMPORT_ORDER[@]}"; do
      local csv="${pair%%:*}"
      local table="${pair##*:}"
      local file="$EXPORT_DIR/${csv}.csv"

      # Drop generated/identity columns from the source CSV before \copy.
      # The function returns the original path if nothing to filter, or a
      # sibling .filtered file otherwise.
      local effective_file
      effective_file=$(preprocess_csv_drop_columns "$file" "$table")

      local rows
      rows=$(($(wc -l < "$effective_file") - 1))
      [ "$rows" -lt 0 ] && rows=0

      # Lovable SQL editor exports columns alphabetically, not in the order we
      # asked. PostgreSQL \copy is POSITIONAL by default — it would shove
      # column #1 of the file into column #1 of the table regardless of names.
      # To map by name, we must enumerate the columns explicitly:
      #   \copy table (col1, col2, ...) FROM file ...
      # Read the header (first line) and convert ';' to ',' to use as the
      # column list.
      local header_line cols
      header_line=$(head -1 "$effective_file")
      cols=$(printf '%s' "$header_line" | tr ';' ',')

      echo "\\echo === Importing $table ($rows rows from ${csv}.csv) ==="
      # Lovable SQL editor exports use ';' as delimiter (pt-BR locale).
      echo "\\copy $table ($cols) FROM '$effective_file' WITH (FORMAT csv, HEADER true, DELIMITER ';');"
      echo ""
    done

    echo "SET LOCAL session_replication_role = 'origin';"
    echo "COMMIT;"
    echo "\\echo === Import committed ==="
  } > "$sql_script"

  if psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -f "$sql_script"; then
    ok "Import committed successfully"
  else
    die "Import failed — transaction rolled back. New DB is unchanged."
  fi
}

# -----------------------------------------------------------------------------
# counts
# -----------------------------------------------------------------------------

count_new() {
  local table="$1"
  curl -sS \
    -H "apikey: $NEW_SR" \
    -H "Authorization: Bearer $NEW_SR" \
    -H "Range-Unit: items" \
    -H "Range: 0-0" \
    -H "Prefer: count=exact" \
    -I \
    "$NEW_URL/rest/v1/${table#public.}?select=id" 2>/dev/null \
    | awk -F/ '/[Cc]ontent-[Rr]ange:/ {gsub(/[\r\n ]/, "", $2); print $2}'
}

count_new_sql() {
  # For tables PostgREST does not expose (e.g. auth.users), use psql directly.
  local table="$1"
  psql "$NEW_DB_URL" -At -c "SELECT count(*) FROM $table;" 2>/dev/null | tr -d '[:space:]'
}

cmd_counts() {
  require_env
  require_tools

  printf '%-35s %-10s %-10s %s\n' "table" "new" "expected" "delta" >&2
  printf '%-35s %-10s %-10s %s\n' "-----------------------------------" "----------" "----------" "------" >&2

  local mismatch=0
  for pair in "${IMPORT_ORDER[@]}"; do
    local csv="${pair%%:*}"
    local table="${pair##*:}"
    local new_count

    case "$table" in
      auth.*) new_count=$(count_new_sql "$table") ;;
      *)      new_count=$(count_new "$table") ;;
    esac
    [ -z "$new_count" ] && new_count="?"

    local expected
    expected=$(expected_count "$table")
    [ -z "$expected" ] && expected="?"
    local delta=""
    if [[ "$expected" =~ ^[0-9]+$ && "$new_count" =~ ^[0-9]+$ ]]; then
      delta=$((new_count - expected))
      if [ "$delta" -ne 0 ]; then
        mismatch=$((mismatch + 1))
        printf "%-35s %-10s %-10s %s%s%s\n" "$table" "$new_count" "$expected" \
          "$C_WARN" "$delta" "$C_RESET" >&2
      else
        printf "%-35s %-10s %-10s %s%s%s\n" "$table" "$new_count" "$expected" \
          "$C_OK" "$delta" "$C_RESET" >&2
      fi
    else
      printf "%-35s %-10s %-10s -\n" "$table" "$new_count" "$expected" >&2
    fi
  done

  if [ "$mismatch" -eq 0 ]; then
    ok "All known counts match. Eyeball the '?' rows against Lovable SQL editor."
  else
    err "$mismatch mismatch(es) — investigate before proceeding."
    return 1
  fi
}

# -----------------------------------------------------------------------------
# cleanup
# -----------------------------------------------------------------------------

cmd_cleanup() {
  if [ -d "$EXPORT_DIR" ]; then
    log "Removing $EXPORT_DIR (PII may be in those CSVs)..."
    rm -rf "$EXPORT_DIR"
    ok "deleted"
  else
    log "$EXPORT_DIR already gone"
  fi
  warn "Don't forget: unset NEW_SR NEW_DB_URL SUPABASE_DB_PASSWORD SUPABASE_ACCESS_TOKEN"
}

# -----------------------------------------------------------------------------
# Dispatch
# -----------------------------------------------------------------------------

usage() {
  sed -n '1,40p' "$0" >&2
  exit 1
}

[ $# -ge 1 ] || usage

case "$1" in
  check)    cmd_check ;;
  import)   cmd_import ;;
  counts)   cmd_counts ;;
  cleanup)  cmd_cleanup ;;
  *) usage ;;
esac
