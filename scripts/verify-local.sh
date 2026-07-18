#!/usr/bin/env bash

# Run the repository checks locally. This script never starts, stops, or
# recreates the running Compose services and never contacts the Nature API.
set -euo pipefail

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"

if ! command -v go >/dev/null 2>&1; then
  echo "error: go is required" >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "error: npm is required" >&2
  exit 1
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "error: docker is required" >&2
  exit 1
fi

echo "==> Go formatting"
UNFORMATTED="$(gofmt -l "$ROOT_DIR/backend")"
if [ -n "$UNFORMATTED" ]; then
  echo "error: gofmt required for:" >&2
  echo "$UNFORMATTED" >&2
  exit 1
fi

echo "==> Web checks"
(
  cd "$ROOT_DIR/web"
  npm run format:check
  npm run lint
  npm run typecheck
  npm test
  npm run build
  if [ "${SKIP_E2E:-0}" = "1" ]; then
    echo "==> Skipping Playwright E2E because SKIP_E2E=1"
  else
    npm run test:e2e
  fi
)

echo "==> Go tests and build"
(
  cd "$ROOT_DIR/backend"
  go test ./...
  go test -race ./...
  go vet ./...
  go build -o "${TMPDIR:-/tmp}/ambient-lapis-verify" ./cmd/ambient-lapis
)

echo "==> Compose validation"
(
  cd "$ROOT_DIR"
  docker compose --env-file .env.example -f compose.yaml config --quiet
  docker compose --env-file .env.example -f compose.backend.yaml config --quiet
  docker compose --env-file .env.example -f compose.yaml build --pull=false
)

echo "Local verification passed."
