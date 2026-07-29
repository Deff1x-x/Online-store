#!/usr/bin/env bash
# Minimal observation window helpers (not a metrics platform).
# Usage: ./observe.sh [seconds]
set -Eeuo pipefail
SECS="${1:-30}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/deploy/vps"

echo "=== docker compose ps ==="
docker compose ps
echo "=== readiness poll ==="
for i in $(seq 1 "$SECS"); do
  docker compose exec -T dotnet-api curl -fsS http://127.0.0.1:8080/health/ready >/dev/null && echo "t=$i ready=ok" || echo "t=$i ready=FAIL"
  sleep 1
done
echo "=== recent nginx access (last 20) ==="
docker compose exec -T nginx sh -c 'tail -n 20 /var/log/nginx/access.log 2>/dev/null || true'
echo "=== 5xx count sample ==="
docker compose exec -T nginx sh -c 'grep -E "\"status\":5[0-9][0-9]" /var/log/nginx/access.log 2>/dev/null | tail -n 5 || true'
echo "=== resource snapshot ==="
docker stats --no-stream || true
echo "observe_done"
exit 0
