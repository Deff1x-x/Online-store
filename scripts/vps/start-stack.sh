#!/usr/bin/env bash
# Start stack with .NET as default active upstream (public traffic still via Nginx).
# Does NOT perform cutover decisions beyond bringing containers up.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/deploy/vps"
[[ -f .env ]] || { echo "Missing deploy/vps/.env — copy .env.production.example" >&2; exit 2; }
"$ROOT/scripts/vps/validate-env.sh" .env
# Ensure default active is .NET before start
"$ROOT/scripts/vps/nginx-switch-dotnet.sh" || true
# Recreate active file if nginx not up yet
cat > nginx/conf.d/active-upstream.conf <<'EOF'
upstream koz_active {
    server dotnet-api:8080;
    keepalive 32;
}
EOF
docker compose up -d --remove-orphans
"$ROOT/scripts/vps/wait-ready.sh" dotnet-api /health/ready 120
"$ROOT/scripts/vps/wait-ready.sh" node-api /api/health 120
echo "stack_up"
exit 0
