#!/usr/bin/env python3
import datetime
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "runtime"
STATE_PATH = BASE / "state.json"
DOD_PATH = BASE / "evidence" / "dod-status.json"
OUTPUT_PATH = BASE / "evidence" / "dod-eval.json"
now = datetime.datetime.now(datetime.timezone.utc)
res = {"ts": now.isoformat(), "status": "fail", "reason": "init", "checks": {}}

def load(p):
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)

try:
    state = load(STATE_PATH)
    dod = load(DOD_PATH)
    res["checks"]["state_exists"] = True
    res["checks"]["dod_exists"] = True
    missing = []
    for k in ["updatedAt", "status"]:
        if k not in state:
            missing.append(k)
    res["checks"]["state_fields_ok"] = len(missing) == 0
    res["checks"]["state_missing_fields"] = missing

    fresh = False
    try:
        t = datetime.datetime.fromisoformat(str(state.get("updatedAt")).replace("Z", "+00:00"))
        fresh = (now - t).total_seconds() <= 1200
    except Exception:
        fresh = False
    res["checks"]["fresh_20m"] = fresh

    text = json.dumps(dod, ensure_ascii=False)
    done_all = "A1" in text and "E8" in text and (
        "all_pass" in text or "allPassed" in text or "全达标" in text
    )
    res["checks"]["dod_all_pass_hint"] = done_all

    st = str(state.get("status", "")).upper()
    if st in ["ALERT", "FAIL", "STALE"]:
        res["status"] = "alert"
        res["reason"] = f"state_status={st}"
    elif not fresh:
        res["status"] = "alert"
        res["reason"] = "state_stale"
    else:
        res["status"] = "ok"
        res["reason"] = "healthy"
except FileNotFoundError as e:
    res["status"] = "fail"
    res["reason"] = f"missing_file:{e.filename}"
except Exception as e:
    res["status"] = "fail"
    res["reason"] = f"exception:{e}"

OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
    json.dump(res, f, ensure_ascii=False, indent=2)
print(json.dumps(res, ensure_ascii=False))
