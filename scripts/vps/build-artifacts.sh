#!/usr/bin/env bash
# Build images with immutable tag = git SHA (or KOZ_IMAGE_TAG).
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
TAG="${KOZ_IMAGE_TAG:-$(git rev-parse HEAD)}"
export KOZ_IMAGE_TAG="$TAG"
echo "building tag=$TAG"
docker build -f backend-dotnet/Dockerfile -t "koz-api:$TAG" backend-dotnet
docker build -f Dockerfile.node -t "koz-node:$TAG" .
echo "koz-api_id=$(docker image inspect "koz-api:$TAG" --format '{{.Id}}')"
echo "koz-node_id=$(docker image inspect "koz-node:$TAG" --format '{{.Id}}')"
exit 0
