#!/usr/bin/env bash
# Production-safe migration runner for Koz (001–003). Does not print secrets.
# Usage:
#   BACKUP_CONFIRMED=yes ./scripts/vps/migrate-production.sh
# Requires: psql, env DATABASE_HOST/PORT/NAME/USER/PASSWORD (or PGPASSWORD via .pgpass / env file sourced by operator).
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATIONS_DIR="$ROOT/database/migrations"

if [[ "${BACKUP_CONFIRMED:-}" != "yes" ]]; then
  echo "Refusing to migrate: set BACKUP_CONFIRMED=yes after a verified production backup." >&2
  exit 2
fi

: "${DATABASE_HOST:?DATABASE_HOST required}"
: "${DATABASE_PORT:?DATABASE_PORT required}"
: "${DATABASE_NAME:?DATABASE_NAME required}"
: "${DATABASE_USER:?DATABASE_USER required}"
: "${DATABASE_PASSWORD:?DATABASE_PASSWORD required}"

export PGPASSWORD="$DATABASE_PASSWORD"
PSQL=(psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -d "$DATABASE_NAME" -v ON_ERROR_STOP=1 -q)

echo "Checking schema state on database (name only; no credentials logged)..."
OTP_EXISTS="$("${PSQL[@]}" -tAc "SELECT to_regclass('public.otp_challenges') IS NOT NULL")"
echo "otp_challenges_present=$OTP_EXISTS"

apply_if_needed() {
  local file="$1"
  local name
  name="$(basename "$file")"
  echo "Applying $name (idempotent where scripts use IF NOT EXISTS / guards)..."
  "${PSQL[@]}" -f "$file"
}

apply_if_needed "$MIGRATIONS_DIR/001_standardize_user_roles.sql"
apply_if_needed "$MIGRATIONS_DIR/002_expand_core_schema.sql"
apply_if_needed "$MIGRATIONS_DIR/003_otp_challenges.sql"

echo "Verification queries..."
"${PSQL[@]}" -tAc "SELECT to_regclass('public.otp_challenges') IS NOT NULL" | grep -qx t
"${PSQL[@]}" -tAc "SELECT COUNT(*) FROM pg_indexes WHERE indexname='idx_otp_challenges_expires_at'" | grep -qx 1

echo "Migration verification OK"
exit 0
