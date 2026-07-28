#!/usr/bin/env bash
# Validate deploy/vps/.env without printing secret values.
set -euo pipefail

ENV_FILE="${1:-}"
if [[ -z "$ENV_FILE" ]]; then
  echo "Usage: $0 /path/to/.env" >&2
  exit 2
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

require() {
  local k="$1"
  if [[ -z "${!k:-}" ]]; then
    echo "MISSING:$k" >&2
    return 1
  fi
  echo "PRESENT:$k"
}

fail=0
for k in ASPNETCORE_ENVIRONMENT DATABASE_HOST DATABASE_PORT DATABASE_NAME DATABASE_USER DATABASE_PASSWORD JWT_SECRET OTP_SECRET; do
  require "$k" || fail=1
done

[[ "${ASPNETCORE_ENVIRONMENT}" == "Production" ]] || { echo "FAIL:ASPNETCORE_ENVIRONMENT must be Production" >&2; fail=1; }
[[ "${PAYMENTS_ONLINE_INITIATION_ENABLED:-false}" == "false" ]] || { echo "FAIL:payment must be disabled for launch" >&2; fail=1; }
[[ "${DATABASE_PASSWORD}" != "postgres" ]] || { echo "FAIL:DATABASE_PASSWORD must not be postgres" >&2; fail=1; }
[[ "${#JWT_SECRET}" -ge 32 ]] || { echo "FAIL:JWT_SECRET too short" >&2; fail=1; }
[[ "${#OTP_SECRET}" -ge 32 ]] || { echo "FAIL:OTP_SECRET too short" >&2; fail=1; }
[[ "${JWT_SECRET}" != "${OTP_SECRET}" ]] || { echo "FAIL:OTP_SECRET must differ from JWT_SECRET" >&2; fail=1; }

if [[ "${ForwardedHeaders__Enabled:-}" == "true" ]]; then
  if [[ -z "${ForwardedHeaders__KnownNetworks__0:-}${ForwardedHeaders__KnownProxies__0:-}" ]]; then
    echo "FAIL:ForwardedHeaders enabled without known network/proxy" >&2
    fail=1
  fi
fi

if grep -E 'Cors__AllowedOrigins__0=' "$ENV_FILE" >/dev/null; then
  echo "PRESENT:Cors__AllowedOrigins__0"
else
  echo "MISSING:Cors__AllowedOrigins__0" >&2
  fail=1
fi

PERM="$(stat -c '%a' "$ENV_FILE" 2>/dev/null || stat -f '%OLp' "$ENV_FILE" 2>/dev/null || echo unknown)"
echo "env_mode=$PERM"
if [[ "$PERM" =~ ^[0-9]+$ ]] && [[ "$PERM" -gt 600 ]]; then
  echo "WARN: prefer chmod 600 on .env"
fi

exit "$fail"
