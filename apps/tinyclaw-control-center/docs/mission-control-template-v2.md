# Mission Control Template v2 (Reusable)

## Roles (4 jobs)
1. Worker (do work)
2. Watchdog (single-chain + restart)
3. Guard (resident process liveness)
4. Reporter (human-facing status)

## Required files
- runtime/state.json (single source of truth)
- runtime/evidence/dod-status.json
- runtime/evidence/<mission>-report.md
- runtime/locks/*.lockdir (atomic lock via mkdir)

## State contract (minimum)
```json
{
  "role": "worker|watchdog|guard|reporter",
  "lastRunAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "status": "IN_PROGRESS|DONE|ALERT|FAIL|STALE",
  "partial": 0,
  "missing": 0,
  "activeCodex": 0,
  "blocker": "none",
  "next": "next action"
}
```

## Schedule defaults (staggered)
- Worker: every 5m
- Watchdog: every 7m
- Guard: every 11m
- Reporter: every 15m

## Failure escalation
- Worker fail -> fallback command once -> still fail => FAIL + blocker
- Watchdog same blocker 3 rounds => ALERT
- Guard fail 2 rounds => ALERT
- Reporter stale >20m => STALE + human intervention line

## Reporter output contract (strict 4 lines)
- 做了什么：
- 目标是什么：
- 哪些没完成：
- 正在做什么：

No extra text.
