#!/usr/bin/env bash
# Restore a dump into a SEPARATE verification database (never overwrite prod blindly).
# Usage: ./scripts/vps/restore-verify.sh /path/to/file.dump verify_db_name
set -Eeuo pipefail

DUMP="${1:-}"
VERIFY_DB="${2:-}"
if [[ -z "$DUMP" || -z "$VERIFY_DB" ]]; then
  echo "Usage: $0 <dump-file> <verify-database-name>" >&2
  exit 2
fi
if [[ "$VERIFY_DB" == "${DATABASE_NAME:-}" ]]; then
  echo "Refuse to restore into DATABASE_NAME; use a dedicated verify DB." >&2
  exit 2
fi
if ! [[ "$VERIFY_DB" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
  echo "Invalid database name: must be alphanumeric/underscore only." >&2
  exit 2
fi

: "${DATABASE_HOST:?}"
: "${DATABASE_PORT:?}"
: "${DATABASE_USER:?}"
: "${DATABASE_PASSWORD:?}"
export PGPASSWORD="$DATABASE_PASSWORD"

psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$VERIFY_DB' AND pid <> pg_backend_pid();" \
  -c "DROP DATABASE IF EXISTS \"$VERIFY_DB\";" \
  -c "CREATE DATABASE \"$VERIFY_DB\" OWNER \"$DATABASE_USER\";"

pg_restore -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -d "$VERIFY_DB" --no-owner "$DUMP"

psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -d "$VERIFY_DB" -v ON_ERROR_STOP=1 -tAc \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'" | awk '{print "public_tables="$1}'
psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -d "$VERIFY_DB" -tAc \
  "SELECT to_regclass('public.stores') IS NOT NULL, to_regclass('public.users') IS NOT NULL, to_regclass('public.products') IS NOT NULL, to_regclass('public.store_inventory') IS NOT NULL, to_regclass('public.orders') IS NOT NULL" \
  | awk '{print "core_tables="$0}'

echo "restore_verify_ok"
exit 0
