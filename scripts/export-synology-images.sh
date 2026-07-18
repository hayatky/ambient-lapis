#!/usr/bin/env bash

# Build linux/amd64 images and export one Docker archive for manual Synology
# transfer. This script does not push to a registry or contact the Nature API.
set -euo pipefail

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v git >/dev/null 2>&1; then
  echo "error: git is required" >&2
  exit 1
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "error: docker is required" >&2
  exit 1
fi
if ! command -v shasum >/dev/null 2>&1; then
  echo "error: shasum is required" >&2
  exit 1
fi

if [ -n "$(git status --porcelain --untracked-files=all)" ]; then
  echo "error: the worktree must be clean before exporting images" >&2
  echo "Commit the intended changes first, then rerun this script." >&2
  exit 1
fi

COMMIT_SHA="$(git rev-parse --verify HEAD)"
ARTIFACT_DIR="$ROOT_DIR/artifacts"
ARCHIVE="$ARTIFACT_DIR/ambient-lapis-${COMMIT_SHA}-linux-amd64.tar"
CHECKSUM="$ARCHIVE.sha256"
API_IMAGE="ambient-lapis-api:${COMMIT_SHA}"
WEB_IMAGE="ambient-lapis-web:${COMMIT_SHA}"

if [ -e "$ARCHIVE" ] || [ -e "$CHECKSUM" ]; then
  echo "error: export artifact already exists: $ARCHIVE" >&2
  echo "Move it away before rerunning to avoid overwriting it." >&2
  exit 1
fi

echo "==> Running local verification before export"
# Keep the currently running macOS service untouched. Playwright is run
# separately when ports 3000/8090 are available.
SKIP_E2E=1 "$ROOT_DIR/scripts/verify-local.sh"

mkdir -p "$ARTIFACT_DIR"

echo "==> Building $API_IMAGE for linux/amd64"
docker buildx build \
  --platform linux/amd64 \
  --load \
  --tag "$API_IMAGE" \
  --file backend/Dockerfile \
  .

echo "==> Building $WEB_IMAGE for linux/amd64"
docker buildx build \
  --platform linux/amd64 \
  --load \
  --tag "$WEB_IMAGE" \
  --file web/Dockerfile \
  .

echo "==> Saving Docker archive"
docker save --output "$ARCHIVE" "$API_IMAGE" "$WEB_IMAGE"
(
  cd "$ARTIFACT_DIR"
  shasum -a 256 "$(basename "$ARCHIVE")" > "$(basename "$CHECKSUM")"
)

echo "Export complete:"
echo "  archive: $ARCHIVE"
echo "  sha256:  $CHECKSUM"
