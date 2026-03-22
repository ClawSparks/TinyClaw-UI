# Mission Control Runbook v2

## Quick health checks
- `openclaw status --deep`
- `openclaw cron list --json`
- Verify reporter output in your configured reporting destination

## Snapshot / rollback
Snapshot file:
- `runtime/evidence/mission-control-jobs-v2-snapshot.json`

Rollback principle:
1) Read snapshot
2) For each job id in snapshot, `cron update` with stored schedule/payload/delivery/enable settings
3) Re-run regression check job

## Regression monitor
- Job: `pandas-mc-regression-check-30m`
- Expected line:
  - `REGRESSION | status=ok | ...`
- If `status=alert|fail`:
  1) check `runtime/evidence/regression-status.json`
  2) check `runtime/state.json` and lockdirs
  3) restart affected chain only (avoid global restart first)

## SLO suggestion
- state freshness <= 20m
- stale lockdirs = 0
- reporter cadence = 15m
