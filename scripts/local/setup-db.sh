#!/usr/bin/env bash
# Create / reset local database: schema + migrations + seed.
# Usage: ./scripts/local/setup-db.sh
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
: "${DATABASE_HOST:=localhost}"
: "${DATABASE_PORT:=5432}"
: "${DATABASE_NAME:=online_store}"
: "${DATABASE_USER:=postgres}"
: "${DATABASE_PASSWORD:=postgres}"
export PGPASSWORD="$DATABASE_PASSWORD"

PSQL=(psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -v ON_ERROR_STOP=1)

echo "Recreating database $DATABASE_NAME on $DATABASE_HOST:$DATABASE_PORT ..."
"${PSQL[@]}" -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$DATABASE_NAME' AND pid <> pg_backend_pid();" >/dev/null || true
"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS \"$DATABASE_NAME\";"
"${PSQL[@]}" -d postgres -c "CREATE DATABASE \"$DATABASE_NAME\" OWNER \"$DATABASE_USER\";"

echo "Applying schema..."
"${PSQL[@]}" -d "$DATABASE_NAME" -f "$ROOT/database/schema.sql"
for f in "$ROOT"/database/migrations/*.sql; do
  echo "Applying $(basename "$f")..."
  "${PSQL[@]}" -d "$DATABASE_NAME" -f "$f"
done
echo "Seeding..."
"${PSQL[@]}" -d "$DATABASE_NAME" -f "$ROOT/database/seed.sql"
echo "setup_db_ok"
