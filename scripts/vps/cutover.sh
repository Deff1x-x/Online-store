#!/usr/bin/env bash
# Full cutover sequence (operator-run on VPS). Refuses unless CUTOVER_CONFIRMED=yes.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

if [[ "${CUTOVER_CONFIRMED:-}" != "yes" ]]; then
  echo "Refusing cutover: set CUTOVER_CONFIRMED=yes after checklist review." >&2
  exit 2
fi

cd "$ROOT"
echo "1 freeze: KOZ_IMAGE_TAG=${KOZ_IMAGE_TAG:-$(git rev-parse HEAD)}"
"$ROOT/scripts/vps/validate-host.sh"
"$ROOT/scripts/vps/validate-env.sh" "$ROOT/deploy/vps/.env"
"$ROOT/scripts/vps/backup-pre-cutover.sh" "${BACKUP_DIR:?set BACKUP_DIR}"
BACKUP_CONFIRMED=yes "$ROOT/scripts/vps/migrate-production.sh"
"$ROOT/scripts/vps/build-artifacts.sh"
"$ROOT/scripts/vps/start-stack.sh"
"$ROOT/scripts/vps/direct-smoke.sh" dotnet-api 8080
"$ROOT/scripts/vps/nginx-switch-dotnet.sh"
"$ROOT/scripts/vps/observe.sh" 60 || true
echo "cutover_switch_complete — keep Node healthy for observation window; drain when accepted"
exit 0
