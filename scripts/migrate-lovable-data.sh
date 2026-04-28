#!/usr/bin/env bash
# migrate-lovable-data.sh — exports data from the Lovable Supabase project and
# imports it into the new self-managed Supabase project. Phase 3.5 of the
# Lovable -> Vercel + new Supabase migration (~/.claude/plans/1-manter-o-vite-peppy-bunny.md).
#
# This script never accepts secrets as arguments. All sensitive values come from
# the calling shell environment so they don't end up in process listings, shell
# history, or repo files.
#
# Required env (export in YOUR terminal before running):
#   OLD_URL   = https://rmxqigouctwqkpwiapbu.supabase.co
#   OLD_SR    = service_role JWT of the Lovable project (Lovable Cloud -> Secrets)
#   NEW_URL   = https://vbrdtxgsiwhgeexihgwk.supabase.co
#   NEW_SR    = service_role JWT of the new project (Supabase -> Settings -> API)
#
# Optional env:
#   NEW_DB_URL = postgres://... of the new project, used to toggle triggers
#                during import. If unset, the trigger toggle is skipped and
#                the operator must run the SQL manually before/after import.
#
# Usage:
#   ./scripts/migrate-lovable-data.sh check         # validate env + connectivity
#   ./scripts/migrate-lovable-data.sh export        # export old -> /tmp/lovable-export
#   ./scripts/migrate-lovable-data.sh storage       # export+upload bucket 'documents'
#   ./scripts/migrate-lovable-data.sh import        # import /tmp/lovable-export -> new
#   ./scripts/migrate-lovable-data.sh counts        # count rows in old vs new
#   ./scripts/migrate-lovable-data.sh cleanup       # delete /tmp/lovable-export
#   ./scripts/migrate-lovable-data.sh all           # check -> export -> storage -> import -> counts
#
# Reads from old Supabase via PostgREST + Storage API with service_role.
# auth.users migration is deliberately NOT automated — it is performed
# manually via the Supabase SQL editors so the bcrypt hash is preserved.
# See plan section 3.5.4 (Caminho A).

set -euo pipefail

# -----------------------------------------------------------------------------
# Constants
# -----------------------------------------------------------------------------

EXPORT_DIR="/tmp/lovable-export"
TABLES_FILE="$EXPORT_DIR/tables"
STORAGE_DIR="$EXPORT_DIR/storage"
LOG_FILE="$EXPORT_DIR/migrate.log"

# Domain tables in dependency order (FK-safe). auth.users + profiles are NOT here
# — auth.users is migrated manually (preserves bcrypt hash); profiles is imported
# explicitly as the second step because most domain tables reference it.
DOMAIN_TABLES=(
  profiles
  categories
  accounts
  credit_cards
  credit_card_invoices
  categorization_rules
  budgets
  recurring_rules
  pluggy_items
  projects
  investment_institutions
  investment_assets
  investment_transactions
  transactions
  shared_access
  invitations
)

PAGE_SIZE=1000
SLEEP_BETWEEN_PAGES=0.1   # tame rate-limits

# -----------------------------------------------------------------------------
# Pretty logging (stderr; stdout reserved for tool output)
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
# Pre-flight
# -----------------------------------------------------------------------------

require_env() {
  local missing=()
  for var in OLD_URL OLD_SR NEW_URL NEW_SR; do
    if [ -z "${!var:-}" ]; then
      missing+=("$var")
    fi
  done
  if [ "${#missing[@]}" -gt 0 ]; then
    die "Missing env vars: ${missing[*]}. Export them in your shell first."
  fi
}

require_tools() {
  for tool in curl jq; do
    command -v "$tool" >/dev/null 2>&1 || die "$tool is required (try: brew install $tool)"
  done
}

ensure_export_dir() {
  mkdir -p "$EXPORT_DIR" "$STORAGE_DIR"
  chmod 700 "$EXPORT_DIR"
  : > "$LOG_FILE"
}

# Decode JWT payload (no validation) to confirm role + project ref.
decode_jwt_role() {
  local jwt="$1"
  local payload
  payload=$(printf '%s' "$jwt" | cut -d. -f2)
  # base64url -> base64
  payload="${payload//-/+}"
  payload="${payload//_/\/}"
  case $((${#payload} % 4)) in
    2) payload="${payload}==" ;;
    3) payload="${payload}=" ;;
  esac
  printf '%s' "$payload" | base64 -d 2>/dev/null || true
}

cmd_check() {
  require_env
  require_tools
  ensure_export_dir

  log "Validating service_role keys..."
  local old_payload new_payload
  old_payload=$(decode_jwt_role "$OLD_SR")
  new_payload=$(decode_jwt_role "$NEW_SR")

  local old_role new_role old_ref new_ref
  old_role=$(printf '%s' "$old_payload" | jq -r '.role // "missing"')
  new_role=$(printf '%s' "$new_payload" | jq -r '.role // "missing"')
  old_ref=$(printf '%s' "$old_payload" | jq -r '.ref // "missing"')
  new_ref=$(printf '%s' "$new_payload" | jq -r '.ref // "missing"')

  [ "$old_role" = "service_role" ] || die "OLD_SR is not a service_role JWT (role=$old_role)"
  [ "$new_role" = "service_role" ] || die "NEW_SR is not a service_role JWT (role=$new_role)"

  ok "OLD_SR -> role=service_role, ref=$old_ref"
  ok "NEW_SR -> role=service_role, ref=$new_ref"

  [ "$old_ref" != "$new_ref" ] || die "OLD_SR and NEW_SR have the same ref — refuse to migrate onto itself."

  log "Probing OLD project connectivity..."
  local probe
  probe=$(curl -sS -o /dev/null -w '%{http_code}' \
    -H "apikey: $OLD_SR" -H "Authorization: Bearer $OLD_SR" \
    "$OLD_URL/rest/v1/profiles?select=id&limit=1" || echo "000")
  [ "$probe" = "200" ] || die "OLD project probe failed (HTTP $probe)"
  ok "OLD project responsive"

  log "Probing NEW project connectivity..."
  probe=$(curl -sS -o /dev/null -w '%{http_code}' \
    -H "apikey: $NEW_SR" -H "Authorization: Bearer $NEW_SR" \
    "$NEW_URL/rest/v1/profiles?select=id&limit=1" || echo "000")
  [ "$probe" = "200" ] || die "NEW project probe failed (HTTP $probe)"
  ok "NEW project responsive"
}

# -----------------------------------------------------------------------------
# Export domain tables from OLD via PostgREST
# -----------------------------------------------------------------------------

export_one_table() {
  local table="$1"
  local outfile="$EXPORT_DIR/${table}.json"
  local offset=0
  local total=0
  : > "$outfile.tmp"
  echo '[' > "$outfile.tmp"

  local first_chunk=1
  while :; do
    local response
    local status
    response=$(curl -sS -w '\n%{http_code}' \
      -H "apikey: $OLD_SR" \
      -H "Authorization: Bearer $OLD_SR" \
      -H "Range-Unit: items" \
      -H "Range: ${offset}-$((offset + PAGE_SIZE - 1))" \
      "$OLD_URL/rest/v1/${table}?select=*&order=created_at.asc.nullslast,id.asc")
    status="${response##*$'\n'}"
    response="${response%$'\n'*}"

    if [ "$status" != "200" ] && [ "$status" != "206" ]; then
      err "Table $table page offset=$offset HTTP $status"
      err "Body: $(printf '%s' "$response" | head -c 300)"
      return 1
    fi

    local count
    count=$(printf '%s' "$response" | jq 'length')
    if [ "$count" = "0" ]; then
      break
    fi

    if [ "$first_chunk" = "1" ]; then
      first_chunk=0
    else
      echo "," >> "$outfile.tmp"
    fi
    # Strip outer brackets and append the items
    printf '%s' "$response" | jq -c '.[]' | paste -sd ',' - >> "$outfile.tmp"

    total=$((total + count))
    offset=$((offset + PAGE_SIZE))
    [ "$count" -lt "$PAGE_SIZE" ] && break
    sleep "$SLEEP_BETWEEN_PAGES"
  done

  echo ']' >> "$outfile.tmp"
  mv "$outfile.tmp" "$outfile"
  printf '%s\t%d\n' "$table" "$total" >> "$EXPORT_DIR/_export-counts.tsv"
  ok "exported $table: $total rows -> $outfile"
}

cmd_export() {
  cmd_check
  log "Starting export of ${#DOMAIN_TABLES[@]} tables to $EXPORT_DIR..."
  : > "$EXPORT_DIR/_export-counts.tsv"

  for table in "${DOMAIN_TABLES[@]}"; do
    export_one_table "$table"
  done

  ok "Export complete. Summary:"
  column -t -s $'\t' "$EXPORT_DIR/_export-counts.tsv" >&2
}

# -----------------------------------------------------------------------------
# Storage bucket 'documents' export + import
# -----------------------------------------------------------------------------

cmd_storage() {
  cmd_check
  log "Listing files in OLD bucket 'documents'..."

  local list_resp
  list_resp=$(curl -sS \
    -H "apikey: $OLD_SR" \
    -H "Authorization: Bearer $OLD_SR" \
    -H "Content-Type: application/json" \
    -X POST \
    -d '{"prefix":"","limit":10000,"sortBy":{"column":"name","order":"asc"}}' \
    "$OLD_URL/storage/v1/object/list/documents")

  local file_count
  file_count=$(printf '%s' "$list_resp" | jq 'length')
  echo "$list_resp" > "$EXPORT_DIR/_storage-list.json"
  log "Found $file_count files in old 'documents' bucket"

  if [ "$file_count" = "0" ]; then
    warn "Bucket is empty. Skipping download/upload."
    return 0
  fi

  # Ensure bucket exists in NEW (private)
  log "Ensuring bucket 'documents' exists in NEW (private)..."
  local bucket_create_status
  bucket_create_status=$(curl -sS -o /dev/null -w '%{http_code}' \
    -H "apikey: $NEW_SR" -H "Authorization: Bearer $NEW_SR" \
    -H "Content-Type: application/json" \
    -X POST \
    -d '{"id":"documents","name":"documents","public":false}' \
    "$NEW_URL/storage/v1/bucket")
  case "$bucket_create_status" in
    200|201|409) ok "bucket OK (HTTP $bucket_create_status)" ;;
    *) die "bucket create failed (HTTP $bucket_create_status)" ;;
  esac

  log "Downloading + uploading files..."
  local downloaded=0 uploaded=0 failed=0
  while IFS= read -r path; do
    [ -z "$path" ] && continue
    local local_file="$STORAGE_DIR/$path"
    mkdir -p "$(dirname "$local_file")"

    # Download from OLD
    local dl_status
    dl_status=$(curl -sS -o "$local_file" -w '%{http_code}' \
      -H "apikey: $OLD_SR" -H "Authorization: Bearer $OLD_SR" \
      "$OLD_URL/storage/v1/object/documents/$path")
    if [ "$dl_status" != "200" ]; then
      err "DL fail [$path] HTTP $dl_status"
      failed=$((failed + 1))
      continue
    fi
    downloaded=$((downloaded + 1))

    # Upload to NEW
    local up_status
    up_status=$(curl -sS -o /dev/null -w '%{http_code}' \
      -H "apikey: $NEW_SR" -H "Authorization: Bearer $NEW_SR" \
      -H "Content-Type: application/octet-stream" \
      -H "x-upsert: true" \
      --data-binary "@$local_file" \
      -X POST \
      "$NEW_URL/storage/v1/object/documents/$path")
    if [ "$up_status" != "200" ] && [ "$up_status" != "201" ]; then
      err "UP fail [$path] HTTP $up_status"
      failed=$((failed + 1))
      continue
    fi
    uploaded=$((uploaded + 1))
  done < <(printf '%s' "$list_resp" | jq -r '.[] | select(.name != null) | .name')

  ok "Storage migration: downloaded=$downloaded, uploaded=$uploaded, failed=$failed"
  [ "$failed" = "0" ] || die "Storage migration had $failed failures — fix and rerun"
}

# -----------------------------------------------------------------------------
# Import domain tables into NEW via PostgREST
# -----------------------------------------------------------------------------

set_replication_role() {
  local role="$1"
  if [ -n "${NEW_DB_URL:-}" ]; then
    log "Setting session_replication_role=$role via NEW_DB_URL..."
    psql "$NEW_DB_URL" -c "ALTER DATABASE postgres SET session_replication_role TO '$role';" >/dev/null
    psql "$NEW_DB_URL" -c "SELECT pg_reload_conf();" >/dev/null
  else
    warn "NEW_DB_URL not set; cannot toggle session_replication_role automatically."
    warn "Run this in the NEW Supabase SQL editor BEFORE import:"
    warn "  ALTER DATABASE postgres SET session_replication_role TO 'replica';"
    warn "And AFTER import:"
    warn "  ALTER DATABASE postgres SET session_replication_role TO 'origin';"
    read -rp "Confirmed it's set to '$role' in NEW? [y/N] " ack
    [[ "$ack" =~ ^[Yy]$ ]] || die "Aborting; set the role and retry."
  fi
}

import_one_table() {
  local table="$1"
  local infile="$EXPORT_DIR/${table}.json"
  [ -f "$infile" ] || die "Missing $infile — run 'export' first"

  local rows
  rows=$(jq 'length' "$infile")
  log "Importing $table: $rows rows..."

  if [ "$rows" = "0" ]; then
    warn "$table has 0 rows; skipping"
    return 0
  fi

  # Batch upserts in chunks of 500 rows
  local chunk_size=500
  local i=0
  local imported=0
  while [ $i -lt $rows ]; do
    local chunk
    chunk=$(jq -c --argjson off $i --argjson sz $chunk_size '.[$off:$off+$sz]' "$infile")

    local status
    status=$(curl -sS -o "$EXPORT_DIR/_last-import-error.json" -w '%{http_code}' \
      -H "apikey: $NEW_SR" \
      -H "Authorization: Bearer $NEW_SR" \
      -H "Content-Type: application/json" \
      -H "Prefer: return=minimal,resolution=merge-duplicates" \
      -X POST \
      -d "$chunk" \
      "$NEW_URL/rest/v1/${table}")

    if [ "$status" != "201" ] && [ "$status" != "200" ] && [ "$status" != "204" ]; then
      err "Import $table chunk offset=$i HTTP $status"
      err "Response: $(head -c 500 "$EXPORT_DIR/_last-import-error.json")"
      return 1
    fi

    imported=$((imported + $(printf '%s' "$chunk" | jq 'length')))
    i=$((i + chunk_size))
  done

  ok "imported $table: $imported rows"
}

cmd_import() {
  cmd_check
  set_replication_role "replica"

  for table in "${DOMAIN_TABLES[@]}"; do
    import_one_table "$table"
  done

  set_replication_role "origin"
  ok "All domain tables imported"
}

# -----------------------------------------------------------------------------
# Counts comparison
# -----------------------------------------------------------------------------

count_rows() {
  local url="$1" key="$2" table="$3"
  curl -sS \
    -H "apikey: $key" \
    -H "Authorization: Bearer $key" \
    -H "Range-Unit: items" \
    -H "Range: 0-0" \
    -H "Prefer: count=exact" \
    -I \
    "$url/rest/v1/${table}?select=id" 2>/dev/null \
    | grep -i '^content-range:' \
    | sed -E 's/.*\///' \
    | tr -d '\r\n '
}

cmd_counts() {
  cmd_check
  log "Counting rows in OLD vs NEW for all domain tables..."

  printf '%-30s %-12s %-12s %s\n' "table" "old" "new" "delta" >&2
  printf '%-30s %-12s %-12s %s\n' "------------------------------" "------------" "------------" "------" >&2

  local fail=0
  for table in "${DOMAIN_TABLES[@]}"; do
    local old_count new_count
    old_count=$(count_rows "$OLD_URL" "$OLD_SR" "$table" || echo "?")
    new_count=$(count_rows "$NEW_URL" "$NEW_SR" "$table" || echo "?")
    local delta=""
    if [[ "$old_count" =~ ^[0-9]+$ ]] && [[ "$new_count" =~ ^[0-9]+$ ]]; then
      delta=$((new_count - old_count))
      if [ "$delta" -ne 0 ]; then
        fail=$((fail + 1))
        printf "%-30s %-12s %-12s %s%s%s\n" "$table" "$old_count" "$new_count" "$C_WARN" "$delta" "$C_RESET" >&2
      else
        printf "%-30s %-12s %-12s %s%s%s\n" "$table" "$old_count" "$new_count" "$C_OK" "$delta" "$C_RESET" >&2
      fi
    else
      fail=$((fail + 1))
      printf "%-30s %-12s %-12s %s?%s\n" "$table" "$old_count" "$new_count" "$C_ERR" "$C_RESET" >&2
    fi
  done

  if [ "$fail" -eq 0 ]; then
    ok "All counts match between OLD and NEW"
  else
    err "$fail table(s) with mismatch — investigate"
    return 1
  fi
}

# -----------------------------------------------------------------------------
# Cleanup
# -----------------------------------------------------------------------------

cmd_cleanup() {
  if [ -d "$EXPORT_DIR" ]; then
    log "Removing $EXPORT_DIR (PII may live in those PDFs)..."
    rm -rf "$EXPORT_DIR"
    ok "cleaned"
  fi
  warn "Don't forget to: unset OLD_SR NEW_SR OLD_URL NEW_URL NEW_DB_URL"
}

# -----------------------------------------------------------------------------
# Dispatch
# -----------------------------------------------------------------------------

usage() {
  sed -n '1,30p' "$0" >&2
  exit 1
}

[ $# -ge 1 ] || usage

case "$1" in
  check)    cmd_check ;;
  export)   cmd_export ;;
  storage)  cmd_storage ;;
  import)   cmd_import ;;
  counts)   cmd_counts ;;
  cleanup)  cmd_cleanup ;;
  all)
    cmd_check
    cmd_export
    cmd_storage
    cmd_import
    cmd_counts
    warn "auth.users still need manual migration via SQL editors (Caminho A)."
    warn "When done, run './$(basename "$0") cleanup'."
    ;;
  *) usage ;;
esac
