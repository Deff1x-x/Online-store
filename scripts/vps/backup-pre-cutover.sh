#!/usr/bin/env bash
# Pre-cutover logical backup. Credentials via env / .pgpass — not argv.
# Usage: ./scripts/vps/backup-pre-cutover.sh /var/backups/koz
set -euo pipefail

OUT_DIR="${1:-}"
if [[ -z "$OUT_DIR" ]]; then
  echo "Usage: $0 <backup-output-directory>" >&2
  exit 2
fi

: "${DATABASE_HOST:?}"
: "${DATABASE_PORT:?}"
: "${DATABASE_NAME:?}"
: "${DATABASE_USER:?}"
: "${DATABASE_PASSWORD:?}"

export PGPASSWORD="$DATABASE_PASSWORD"
mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$OUT_DIR/${DATABASE_NAME}_${STAMP}.dump"

pg_dump -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -d "$DATABASE_NAME" -Fc -f "$FILE"
SIZE="$(wc -c < "$FILE" | tr -d ' ')"
if [[ "$SIZE" -lt 1000 ]]; then
  echo "Backup too small ($SIZE bytes)" >&2
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
  HASH="$(sha256sum "$FILE" | awk '{print $1}')"
elif command -v shasum >/dev/null 2>&1; then
  HASH="$(shasum -a 256 "$FILE" | awk '{print $1}')"
else
  HASH="unavailable"
fi

echo "backup_file=$FILE"
echo "backup_bytes=$SIZE"
echo "backup_sha256=$HASH"
# Retention: operator policy — do not invent production retention here.
exit 0
