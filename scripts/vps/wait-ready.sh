#!/usr/bin/env bash
# Wait for container readiness with timeout.
# Usage: ./wait-ready.sh <service> <url-path> [timeout_sec]
set -euo pipefail
SERVICE="${1:?service}"
PATH_SUFFIX="${2:?path}"
TIMEOUT="${3:-90}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/deploy/vps"
deadline=$((SECONDS + TIMEOUT))
while (( SECONDS < deadline )); do
  if docker compose exec -T "$SERVICE" curl -fsS "http://127.0.0.1${PATH_SUFFIX}" >/dev/null 2>&1; then
    echo "ready:$SERVICE$PATH_SUFFIX"
    exit 0
  fi
  sleep 2
done
echo "timeout waiting for $SERVICE$PATH_SUFFIX" >&2
exit 1
