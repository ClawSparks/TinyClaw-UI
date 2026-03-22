#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FILES=()
while IFS= read -r file; do
  FILES+=("$file")
done < <(
  rg --files --hidden \
    -g '!.git/**' \
    -g '!node_modules/**' \
    -g '!dist/**' \
    -g '!runtime/**' \
    -g '!coverage/**' \
    -g '!scripts/release-audit.sh'
)

if [ "${#FILES[@]}" -eq 0 ]; then
  echo "release-audit: no source files found" >&2
  exit 1
fi

check_no_match() {
  local description="$1"
  local pattern="$2"
  if rg -n --no-heading -P -e "$pattern" "${FILES[@]}" >/tmp/release-audit-match.txt 2>/dev/null; then
    echo "release-audit: failed: ${description}" >&2
    cat /tmp/release-audit-match.txt >&2
    rm -f /tmp/release-audit-match.txt
    exit 1
  fi
  rm -f /tmp/release-audit-match.txt
}

check_exists() {
  local file="$1"
  if [ ! -f "$file" ]; then
    echo "release-audit: missing required file: $file" >&2
    exit 1
  fi
}

check_exists "README.md"
check_exists "LICENSE"
check_exists ".gitignore"
check_exists ".env.example"
check_exists "package.json"
check_exists "src/ui/server.ts"
check_exists "src/runtime/usage-cost.ts"

check_no_match "absolute macOS home paths" '/Users/[^/]+/'
check_no_match "absolute Linux home paths" '/home/[^/]+/'
check_no_match "hard-coded internal channel ids" '1477617216529760378'
check_no_match "obvious OpenAI-style secret keys" 'sk-[A-Za-z0-9]{20,}'
check_no_match "hard-coded bearer tokens" 'Authorization: Bearer (?!<)[^[:space:]]+'
check_no_match "hard-coded local API tokens" 'LOCAL_API_TOKEN=(?!<)[^[:space:]]+'
check_no_match "hard-coded x-local-token header values" 'x-local-token:[[:space:]]*(?!<)[^[:space:]]+'

if [ -d ".git" ]; then
  if git ls-files | rg '^(runtime|dist|node_modules|coverage|plans|workflows)/' >/tmp/release-audit-match.txt 2>/dev/null; then
    echo "release-audit: failed: ignored build/runtime/internal-only paths are tracked" >&2
    cat /tmp/release-audit-match.txt >&2
    rm -f /tmp/release-audit-match.txt
    exit 1
  fi
  rm -f /tmp/release-audit-match.txt

  if ! git ls-files --error-unmatch src/ui/server.ts >/dev/null 2>&1; then
    echo "release-audit: missing tracked source file: src/ui/server.ts" >&2
    exit 1
  fi

  if ! git ls-files --error-unmatch src/runtime/usage-cost.ts >/dev/null 2>&1; then
    echo "release-audit: missing tracked source file: src/runtime/usage-cost.ts" >&2
    exit 1
  fi
fi

echo "release-audit: passed"
