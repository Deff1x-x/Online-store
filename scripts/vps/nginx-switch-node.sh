#!/usr/bin/env bash
# Switch Nginx active upstream to Node (rollback). Safe reload. No DB schema changes.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ACTIVE="$ROOT/deploy/vps/nginx/conf.d/active-upstream.conf"
cat > "$ACTIVE" <<'EOF'
# ACTIVE: Node rollback
upstream koz_active {
    server node-api:3000;
    keepalive 16;
}
EOF
COMPOSE_DIR="$ROOT/deploy/vps"
cd "$COMPOSE_DIR"
docker compose exec -T nginx nginx -t
docker compose exec -T nginx nginx -s reload
echo "nginx_active=node"
echo "NOTICE: Users with in-flight .NET OTP must request a new OTP after rollback to Node."
exit 0
