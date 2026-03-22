#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/runtime/evidence/verifier-status.json"
TMP="$OUT.tmp"
cd "$ROOT"
./scripts/mc_dod_evaluator.py > "$TMP"
python3 - "$TMP" "$OUT" <<'PY2'
import datetime
import json
import pathlib
import sys

tmp_path = pathlib.Path(sys.argv[1])
out_path = pathlib.Path(sys.argv[2])
raw = tmp_path.read_text(encoding="utf-8").strip()
data = json.loads(raw) if raw else {}
if not isinstance(data, dict):
    raise SystemExit("Verifier must output a JSON object")
data.setdefault("ok", bool(data.get("status") == "DONE"))
data.setdefault("status", data.get("status", "UNKNOWN"))
data.setdefault("checkedItems", [])
data.setdefault("failedChecks", [])
data.setdefault("evidence", [])
data.setdefault("nextRecommendedItem", "")
data["updatedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(data, ensure_ascii=False))
tmp_path.unlink(missing_ok=True)
PY2
