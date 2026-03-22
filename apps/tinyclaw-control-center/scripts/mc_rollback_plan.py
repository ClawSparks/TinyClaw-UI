#!/usr/bin/env python3
import datetime
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "runtime" / "evidence"
REGRESSION_PATH = BASE / "regression-status.json"
SNAPSHOT_PATH = BASE / "mission-control-jobs-v2-snapshot.json"
OUTPUT_PATH = BASE / "rollback-plan.json"
now = datetime.datetime.now(datetime.timezone.utc).isoformat()
plan = {"ts": now, "canRollback": False, "reason": "", "jobs": [], "commands": []}
try:
    with open(REGRESSION_PATH, "r", encoding="utf-8") as regression_file:
        reg = json.load(regression_file)
    with open(SNAPSHOT_PATH, "r", encoding="utf-8") as snapshot_file:
        snap = json.load(snapshot_file)
    status = str(reg.get("status", "")).lower()
    if status in ["fail", "alert"]:
        jobs = snap.get("jobs", [])
        plan["canRollback"] = True
        plan["reason"] = f"regression_{status}"
        for j in jobs:
            jid = j.get("id")
            plan["jobs"].append(jid)
            plan["commands"].append(f"openclaw cron update {jid} --json '<snapshot-payload>'")
    else:
        plan["reason"] = "regression_not_triggered"
except Exception as e:
    plan["reason"] = f"error:{e}"

BASE.mkdir(parents=True, exist_ok=True)
with open(OUTPUT_PATH, "w", encoding="utf-8") as output_file:
    json.dump(plan, output_file, ensure_ascii=False, indent=2)
print(json.dumps(plan, ensure_ascii=False))
