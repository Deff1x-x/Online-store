#!/usr/bin/env bash
# Validate VPS host prerequisites (read-only checks).
set -euo pipefail

fail=0
need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "MISSING:$1" >&2
    fail=1
  else
    echo "OK:$1"
  fi
}

need docker
need nginx || true
# nginx may run only in container — warn only
if ! command -v nginx >/dev/null 2>&1; then
  echo "WARN:nginx binary not on host (OK if Nginx runs in Compose)"
fi
need curl
need psql || echo "WARN:psql missing on host (OK if migrations run from jump host)"

docker info >/dev/null 2>&1 || { echo "FAIL:docker daemon not reachable" >&2; fail=1; }

FREE_KB="$(df -Pk / | awk 'NR==2{print $4}')"
echo "disk_free_kb=$FREE_KB"
if [[ "${FREE_KB:-0}" -lt 2097152 ]]; then
  echo "WARN: less than ~2GiB free on /"
fi

echo "mem_total_kb=$(awk '/MemTotal/{print $2}' /proc/meminfo 2>/dev/null || echo unknown)"
exit "$fail"
