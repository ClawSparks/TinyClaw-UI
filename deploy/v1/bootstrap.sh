#!/usr/bin/env bash
set -euo pipefail

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo "please run with sudo: sudo bash bootstrap.sh"
  exit 1
fi

if [ -z "${TINYCLAW_PACKAGE_URL:-}" ]; then
  echo "set TINYCLAW_PACKAGE_URL to tinyclaw-suite-v1-*.tar.gz url"
  exit 1
fi

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

curl -fsSL "$TINYCLAW_PACKAGE_URL" -o "$workdir/pkg.tar.gz"
tar -xzf "$workdir/pkg.tar.gz" -C "$workdir"

bash "$workdir/tinyclaw-suite-v1/install.sh"
