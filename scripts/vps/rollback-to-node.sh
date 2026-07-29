#!/usr/bin/env bash
# Rollback traffic to Node. No schema changes. No down migration.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/deploy/vps"

docker compose exec -T node-api curl -fsS http://127.0.0.1:3000/api/health >/dev/null
"$ROOT/scripts/vps/nginx-switch-node.sh"
docker compose exec -T nginx nginx -t
# Public smoke via nginx if TLS placeholders installed — otherwise direct node health already checked
echo "rollback_to_node_complete"
echo "OTP_NOTICE: communicate that users must request a new OTP; leave otp_challenges intact."
exit 0
