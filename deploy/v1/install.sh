#!/usr/bin/env bash
set -euo pipefail

MIN_OPENCLAW_VERSION="2026.3.12"
INSTALL_DIR="${INSTALL_DIR:-/opt/tinyclaw-suite}"
CHAT_PORT="${CHAT_PORT:-3115}"
CONTROL_CENTER_PORT="${CONTROL_CENTER_PORT:-4310}"
CLAWUI_DATA_DIR="${CLAWUI_DATA_DIR:-/var/lib/tinyclaw-suite/clawui}"
RUN_USER="${RUN_USER:-${SUDO_USER:-$(id -un)}}"
LOCAL_API_TOKEN="${LOCAL_API_TOKEN:-$(openssl rand -hex 16 2>/dev/null || date +%s | sha256sum | cut -c1-32)}"
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmmirror.com/}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PAYLOAD_DIR="$SCRIPT_DIR/payload"
TEMPLATE_DIR="$SCRIPT_DIR/templates"

log() {
  printf '[tinyclaw-v1] %s\n' "$*"
}

require_root() {
  if [ "${EUID:-$(id -u)}" -ne 0 ]; then
    echo "please run as root (or sudo)"
    exit 1
  fi
}

check_arch() {
  local arch
  arch="$(uname -m)"
  case "$arch" in
    x86_64|aarch64) ;;
    *)
      echo "unsupported arch: $arch (v1 supports x86_64 and aarch64)"
      exit 1
      ;;
  esac
}

ensure_command() {
  local cmd="$1"
  if command -v "$cmd" >/dev/null 2>&1; then
    return
  fi
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    apt-get install -y curl ca-certificates gnupg jq python3
    return
  fi
  echo "missing command: $cmd"
  exit 1
}

ensure_node() {
  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    return
  fi
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "node/npm missing and auto install only supports apt-based distros in v1"
    exit 1
  fi
  ensure_command curl
  ensure_command gpg
  install -d -m 0755 /etc/apt/keyrings
  if [ ! -f /etc/apt/keyrings/nodesource.gpg ]; then
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  fi
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt-get update
  apt-get install -y nodejs
}

parse_openclaw_version() {
  local raw
  raw="$(openclaw --version 2>/dev/null || true)"
  echo "$raw" | grep -Eo '[0-9]{4}\.[0-9]+\.[0-9]+' | head -n1
}

require_openclaw_version() {
  if ! command -v openclaw >/dev/null 2>&1; then
    echo "openclaw is required before installing tinyclaw suite"
    exit 1
  fi
  local ver
  ver="$(parse_openclaw_version)"
  if [ -z "$ver" ]; then
    echo "cannot parse openclaw version"
    exit 1
  fi
  local first
  first="$(printf '%s\n%s\n' "$MIN_OPENCLAW_VERSION" "$ver" | sort -V | head -n1)"
  if [ "$first" != "$MIN_OPENCLAW_VERSION" ]; then
    echo "openclaw version $ver is too old. require >= $MIN_OPENCLAW_VERSION"
    exit 1
  fi
}

detect_user_home() {
  local home
  home="$(getent passwd "$RUN_USER" | cut -d: -f6)"
  if [ -z "$home" ]; then
    echo "cannot resolve home for user $RUN_USER"
    exit 1
  fi
  echo "$home"
}

read_openclaw_gateway() {
  local cfg="$1"
  python3 - "$cfg" <<'PY'
import json,sys
p=sys.argv[1]
obj=json.load(open(p,'r',encoding='utf-8'))
g=obj.get('gateway',{}) if isinstance(obj,dict) else {}
auth=g.get('auth',{}) if isinstance(g,dict) else {}
port=g.get('port',18789)
token=auth.get('token','')
password=auth.get('password','')
mode=auth.get('mode','')
print(f"PORT={port}")
print(f"TOKEN={token}")
print(f"PASSWORD={password}")
print(f"AUTH_MODE={mode}")
PY
}

seed_clawui_config() {
  local gateway_url="$1"
  local token="$2"
  local password="$3"
  local workspace_path="$4"
  install -d -m 0755 "$(dirname "$CLAWUI_DATA_DIR")"
  install -d -m 0755 "$CLAWUI_DATA_DIR"
  chown -R "$RUN_USER:$RUN_USER" "$(dirname "$CLAWUI_DATA_DIR")"

  local cfg_json
  cfg_json="$(python3 - <<PY
import json
print(json.dumps({
  "gatewayUrl": "$gateway_url",
  "token": "$token",
  "password": "$password",
  "defaultAgent": "main",
  "language": "zh-CN",
  "aiName": "我的小龙虾",
  "loginEnabled": False,
  "loginPassword": "123456",
  "allowedHosts": [],
  "openclawWorkspace": "$workspace_path"
}, ensure_ascii=False))
PY
)"

  runuser -u "$RUN_USER" -- env NODE_PATH="$INSTALL_DIR/backend/node_modules" /usr/bin/env node - "$CLAWUI_DATA_DIR/clawui.sqlite" "$cfg_json" <<'NODE'
const Database = require('better-sqlite3');
const [dbPath, cfgJson] = process.argv.slice(2);
const db = new Database(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);
db.prepare("INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
  .run("app_config", cfgJson);
db.close();
NODE
}

init_openclaw_auth_and_models() {
  local run_home="$1"
  runuser -u "$RUN_USER" -- python3 - "$run_home/.openclaw/openclaw.json" <<'PY'
import json
from pathlib import Path
import sys

cfg_path = Path(sys.argv[1])
if not cfg_path.exists():
    raise SystemExit(0)

cfg = json.loads(cfg_path.read_text(encoding='utf-8'))
providers = ((cfg.get("models") or {}).get("providers") or {})
preferred_provider_keys = ["onelink", "onelinkai", "OneLinkAI", "openai", "minimax"]

def valid_key(value):
    return isinstance(value, str) and value.strip() and not value.strip().startswith("http")

selected_key = ""
selected_base = ""
for key in preferred_provider_keys:
    provider_cfg = providers.get(key)
    if not isinstance(provider_cfg, dict):
        continue
    cand = provider_cfg.get("apiKey") or provider_cfg.get("token") or provider_cfg.get("key")
    if valid_key(cand):
        selected_key = cand.strip()
        selected_base = (provider_cfg.get("baseUrl") or provider_cfg.get("baseURL") or "").strip()
        break

if not selected_key:
    print("no_valid_api_key_found_skip_auth_init")
    raise SystemExit(0)

if not selected_base:
    selected_base = "https://api.onelinkai.cloud/v1"
if selected_base == "https://api.onelinkai.cloud":
    selected_base = "https://api.onelinkai.cloud/v1"

cfg.setdefault("models", {}).setdefault("providers", {})
cfg["models"]["providers"]["onelink"] = {
    "baseUrl": selected_base,
    "apiKey": selected_key,
    "api": "openai-completions",
    "models": [{"id": "kimi-k2.5", "name": "kimi-k2.5"}],
}
cfg["models"]["providers"]["openai"] = {
    "baseUrl": selected_base,
    "apiKey": selected_key,
    "api": "openai-completions",
    "models": [{"id": "gpt-4o-mini", "name": "gpt-4o-mini"}],
}

defaults = cfg.setdefault("agents", {}).setdefault("defaults", {})
defaults.setdefault("models", {})
defaults["models"]["onelink/kimi-k2.5"] = {"alias": "kimi-k2.5"}
defaults["models"]["openai/gpt-4o-mini"] = {"alias": "gpt-4o-mini"}
defaults.setdefault("model", {})
defaults["model"]["primary"] = "onelink/kimi-k2.5"

cfg_path.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

agent_dir = cfg_path.parent / "agents" / "main" / "agent"
agent_dir.mkdir(parents=True, exist_ok=True)

models_path = agent_dir / "models.json"
models_obj = {}
if models_path.exists():
    try:
        models_obj = json.loads(models_path.read_text(encoding="utf-8"))
    except Exception:
        models_obj = {}
models_obj.setdefault("providers", {})
models_obj["providers"]["onelink"] = {
    "baseUrl": selected_base,
    "apiKey": selected_key,
    "api": "openai-completions",
    "models": [{
        "id": "kimi-k2.5",
        "name": "kimi-k2.5",
        "reasoning": True,
        "input": ["text"],
        "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0},
        "contextWindow": 224000,
        "maxTokens": 16000,
        "api": "openai-completions"
    }]
}
models_obj["providers"]["openai"] = {
    "baseUrl": selected_base,
    "apiKey": selected_key,
    "api": "openai-completions",
    "models": [{
        "id": "gpt-4o-mini",
        "name": "gpt-4o-mini",
        "reasoning": False,
        "input": ["text"],
        "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0},
        "contextWindow": 200000,
        "maxTokens": 8192,
        "api": "openai-completions"
    }]
}
models_path.write_text(json.dumps(models_obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

auth_path = agent_dir / "auth-profiles.json"
auth_obj = {"version": 1, "profiles": {}, "order": {}}
if auth_path.exists():
    try:
        loaded = json.loads(auth_path.read_text(encoding="utf-8"))
        if isinstance(loaded, dict):
            auth_obj.update(loaded)
    except Exception:
        pass
auth_obj["version"] = 1
auth_obj.setdefault("profiles", {})
auth_obj.setdefault("order", {})
auth_obj["profiles"]["onelink:manual"] = {"type": "api_key", "provider": "onelink", "key": selected_key}
auth_obj["profiles"]["openai:manual"] = {"type": "api_key", "provider": "openai", "key": selected_key}
auth_obj["order"]["onelink"] = ["onelink:manual"]
auth_obj["order"]["openai"] = ["openai:manual"]
auth_path.write_text(json.dumps(auth_obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

print("auth_model_init_ok")
PY
}

patch_openclaw_gateway_service() {
  local run_home="$1"
  local svc="/etc/systemd/system/openclaw-gateway.service"
  if [ ! -f "$svc" ]; then
    return
  fi
  if ! grep -q 'NODE_OPTIONS=--dns-result-order=ipv4first' "$svc"; then
    python3 - "$svc" "$run_home" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
run_home = sys.argv[2]
text = p.read_text(encoding='utf-8')
line = "Environment=NODE_OPTIONS=--dns-result-order=ipv4first\n"
if line not in text:
    anchor = f"Environment=HOME={run_home}\n"
    if anchor in text:
        text = text.replace(anchor, anchor + line)
    else:
        text = text.replace("[Service]\n", "[Service]\n" + line)
    p.write_text(text, encoding='utf-8')
PY
    systemctl daemon-reload
    systemctl restart openclaw-gateway.service || true
  fi
}

render_services() {
  local run_home="$1"
  local gateway_url="$2"

  sed -e "s|__RUN_USER__|$RUN_USER|g" \
      -e "s|__INSTALL_DIR__|$INSTALL_DIR|g" \
      -e "s|__CHAT_PORT__|$CHAT_PORT|g" \
      -e "s|__CLAWUI_DATA_DIR__|$CLAWUI_DATA_DIR|g" \
      "$TEMPLATE_DIR/tinyclaw-chat-gateway.service.tpl" > /etc/systemd/system/tinyclaw-chat-gateway.service

  sed -e "s|__RUN_USER__|$RUN_USER|g" \
      -e "s|__RUN_HOME__|$run_home|g" \
      -e "s|__INSTALL_DIR__|$INSTALL_DIR|g" \
      -e "s|__CONTROL_CENTER_PORT__|$CONTROL_CENTER_PORT|g" \
      -e "s|__GATEWAY_URL__|$gateway_url|g" \
      -e "s|__LOCAL_API_TOKEN__|$LOCAL_API_TOKEN|g" \
      "$TEMPLATE_DIR/tinyclaw-control-center.service.tpl" > /etc/systemd/system/tinyclaw-control-center.service
}

main() {
  require_root
  check_arch
  ensure_command python3
  ensure_command jq
  ensure_node
  require_openclaw_version

  if [ ! -d "$PAYLOAD_DIR/backend/dist" ] || [ ! -d "$PAYLOAD_DIR/frontend/dist" ] || [ ! -d "$PAYLOAD_DIR/control-center/dist" ]; then
    echo "payload is incomplete; ensure install.sh runs from extracted tinyclaw-suite-v1 package"
    exit 1
  fi

  local run_home
  run_home="$(detect_user_home)"
  local oc_cfg="$run_home/.openclaw/openclaw.json"
  if [ ! -f "$oc_cfg" ]; then
    echo "openclaw config missing: $oc_cfg"
    exit 1
  fi

  log "reading openclaw gateway config"
  eval "$(read_openclaw_gateway "$oc_cfg")"
  local gateway_url="ws://127.0.0.1:${PORT:-18789}"

  log "installing files to $INSTALL_DIR"
  rm -rf "$INSTALL_DIR"
  install -d -m 0755 "$INSTALL_DIR"
  cp -R "$PAYLOAD_DIR/backend" "$INSTALL_DIR/backend"
  cp -R "$PAYLOAD_DIR/frontend" "$INSTALL_DIR/frontend"
  cp -R "$PAYLOAD_DIR/control-center" "$INSTALL_DIR/control-center"
  chown -R "$RUN_USER:$RUN_USER" "$INSTALL_DIR"

  log "installing backend runtime dependencies"
  runuser -u "$RUN_USER" -- bash -lc "npm config set registry '$NPM_REGISTRY' && cd '$INSTALL_DIR/backend' && npm ci --omit=dev"

  log "patching openclaw local gateway policy"
  runuser -u "$RUN_USER" -- bash -lc "cd '$INSTALL_DIR/backend' && node patch-config.js || true"

  local workspace_path="$run_home/.openclaw/workspace-main"
  seed_clawui_config "$gateway_url" "${TOKEN:-}" "${PASSWORD:-}" "$workspace_path"
  init_openclaw_auth_and_models "$run_home"
  patch_openclaw_gateway_service "$run_home"

  render_services "$run_home" "$gateway_url"

  log "starting services"
  systemctl daemon-reload
  systemctl enable --now tinyclaw-chat-gateway.service
  systemctl enable --now tinyclaw-control-center.service

  log "health checks"
  curl -fsS "http://127.0.0.1:${CHAT_PORT}/health" >/dev/null
  curl -fsS "http://127.0.0.1:${CONTROL_CENTER_PORT}/?section=overview&lang=zh" >/dev/null

  log "installed successfully"
  echo "chat gateway: http://<host>:${CHAT_PORT}"
  echo "control center: http://<host>:${CONTROL_CENTER_PORT}/?section=overview&lang=zh"
  echo "services: tinyclaw-chat-gateway.service, tinyclaw-control-center.service"
}

main "$@"
