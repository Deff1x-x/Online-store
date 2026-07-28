#!/usr/bin/env bash
# Switch Nginx active upstream to .NET. Safe reload.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ACTIVE="$ROOT/deploy/vps/nginx/conf.d/active-upstream.conf"
cat > "$ACTIVE" <<'EOF'
# ACTIVE: .NET
upstream koz_active {
    server dotnet-api:8080;
    keepalive 32;
}
EOF
COMPOSE_DIR="$ROOT/deploy/vps"
cd "$COMPOSE_DIR"
docker compose exec -T nginx nginx -t
docker compose exec -T nginx nginx -s reload
echo "nginx_active=dotnet"
exit 0
