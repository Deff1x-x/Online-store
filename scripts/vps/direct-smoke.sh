#!/usr/bin/env bash
# Direct smoke against a container (bypass Nginx). Placeholders for origins.
# Usage: ./direct-smoke.sh dotnet-api 8080
set -euo pipefail
SERVICE="${1:-dotnet-api}"
PORT="${2:-8080}"
ORIGIN="${SMOKE_ORIGIN:-https://app.example.com}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/deploy/vps"

curl_in() {
  docker compose exec -T "$SERVICE" curl -fsS "$@"
}

curl_in "http://127.0.0.1:${PORT}/api/health" >/dev/null
curl_in "http://127.0.0.1:${PORT}/health/ready" >/dev/null

# Payment gate (customer token not required for webhook; pay-online needs auth — check webhook + disabled config)
CODE="$(docker compose exec -T "$SERVICE" curl -s -o /tmp/wh.json -w '%{http_code}' \
  -X POST -H 'Content-Type: application/json' -d '{}' \
  "http://127.0.0.1:${PORT}/api/webhooks/kaspi" || true)"
[[ "$CODE" == "503" ]] || { echo "webhook expected 503 got $CODE" >&2; exit 1; }

# CORS allow header on health
HDR="$(docker compose exec -T "$SERVICE" curl -sI -H "Origin: $ORIGIN" "http://127.0.0.1:${PORT}/api/health" | tr -d '\r')"
echo "$HDR" | grep -qi "access-control-allow-origin: $ORIGIN" || echo "WARN: CORS allow origin not echoed (check Cors__AllowedOrigins)"

echo "direct_smoke_ok service=$SERVICE"
exit 0
