#!/bin/bash
set -e

# ClawUI bootstrap
pkill -f "python3 -m http.server 3004" 2>/dev/null || true
pkill -f "node dist/index.js" 2>/dev/null || true
sleep 1

# start backend
cd /home/ange/.openclaw/workspace/projects/clawui/backend
nohup node dist/index.js >/tmp/clawui_back.log 2>&1 &

# start frontend static
cd /home/ange/.openclaw/workspace/projects/clawui/frontend/dist
nohup python3 -m http.server 3004 --bind 127.0.0.1 >/tmp/clawui_front.log 2>&1 &

sleep 2

echo "backend: $(ss -tlnp | grep ':4001 ' || true)"
echo "frontend: $(ss -tlnp | grep ':3004 ' || true)"
