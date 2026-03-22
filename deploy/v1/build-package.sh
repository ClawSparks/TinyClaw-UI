#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUT_DIR="$SCRIPT_DIR/out"
PKG_ROOT="$OUT_DIR/tinyclaw-suite-v1"
VERSION="${VERSION:-$(date +%Y.%m.%d-%H%M%S)}"
SKIP_BUILD="${SKIP_BUILD:-0}"

log() {
  printf '[build-v1] %s\n' "$*"
}

build_projects() {
  log "building OpenClaw-Chat-Gateway backend"
  cd "$REPO_ROOT/OpenClaw-Chat-Gateway/backend"
  npm ci
  npm run build

  log "building OpenClaw-Chat-Gateway frontend"
  cd "$REPO_ROOT/OpenClaw-Chat-Gateway/frontend"
  npm ci
  npm run build

  log "building openclaw-control-center"
  cd "$REPO_ROOT/openclaw-control-center"
  npm ci
  npm run build
}

prepare_package_tree() {
  rm -rf "$PKG_ROOT"
  mkdir -p "$PKG_ROOT/payload/backend" "$PKG_ROOT/payload/frontend" "$PKG_ROOT/payload/control-center" "$PKG_ROOT/templates"

  cp "$SCRIPT_DIR/install.sh" "$PKG_ROOT/install.sh"
  cp "$SCRIPT_DIR/bootstrap.sh" "$PKG_ROOT/bootstrap.sh"
  cp "$SCRIPT_DIR/templates/"*.service.tpl "$PKG_ROOT/templates/"
  cp "$SCRIPT_DIR/README.md" "$PKG_ROOT/README.md"

  cp -R "$REPO_ROOT/OpenClaw-Chat-Gateway/backend/dist" "$PKG_ROOT/payload/backend/"
  cp "$REPO_ROOT/OpenClaw-Chat-Gateway/backend/package.json" "$PKG_ROOT/payload/backend/"
  cp "$REPO_ROOT/OpenClaw-Chat-Gateway/backend/package-lock.json" "$PKG_ROOT/payload/backend/"
  cp "$REPO_ROOT/OpenClaw-Chat-Gateway/backend/patch-config.js" "$PKG_ROOT/payload/backend/"

  cp -R "$REPO_ROOT/OpenClaw-Chat-Gateway/frontend/dist" "$PKG_ROOT/payload/frontend/"

  cp -R "$REPO_ROOT/openclaw-control-center/dist" "$PKG_ROOT/payload/control-center/"
  cp -R "$REPO_ROOT/openclaw-control-center/img" "$PKG_ROOT/payload/control-center/"
  cp "$REPO_ROOT/openclaw-control-center/package.json" "$PKG_ROOT/payload/control-center/"

  chmod +x "$PKG_ROOT/install.sh" "$PKG_ROOT/bootstrap.sh"
}

pack_artifact() {
  mkdir -p "$OUT_DIR"
  local artifact="$OUT_DIR/tinyclaw-suite-v1-${VERSION}.tar.gz"
  tar -C "$OUT_DIR" -czf "$artifact" "tinyclaw-suite-v1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$artifact" > "$artifact.sha256"
  fi
  log "artifact: $artifact"
  if [ -f "$artifact.sha256" ]; then
    log "checksum: $artifact.sha256"
  fi
}

main() {
  if [ "$SKIP_BUILD" != "1" ]; then
    build_projects
  else
    log "SKIP_BUILD=1 -> skip npm build steps"
  fi
  prepare_package_tree
  pack_artifact
  log "done"
}

main "$@"
