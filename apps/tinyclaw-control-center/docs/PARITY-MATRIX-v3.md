# Mission Control v3 Parity Matrix

Date: 2026-03-04

## Goal
Track Mission Control v3 parity against core OpenClaw Mac-app control surfaces.

## Surface Matrix
| Surface | Route | Status | Notes |
| --- | --- | --- | --- |
| Conversations / session visibility | `/sessions` | Implemented | Session list, filters, detail drill-down, history preview. |
| Approvals + decision queue | `/?section=projects-tasks&quick=attention#task-lane` + `/api/action-queue` | Implemented | Queue + approval feed surfaced in the task hub decision lane. |
| Cron / scheduling | `/cron` | Implemented | Health, next-run, and lag indicators available. |
| Projects / tasks | `/?section=projects-tasks` | Implemented | Lanes + table + filters and task/project APIs. |
| Usage / cost | `/?section=usage-cost` + `/api/usage-cost` | Implemented | Runtime usage periods, breakdowns, context windows, budget/burn. |
| Subscription consumed/remaining | `/?section=usage-cost` + `/api/usage-cost` | Implemented | Provider snapshot first; runtime usage + 30d budget-limit fallback supplies consumed/remaining/limit when provider snapshots are missing. |
| Replay / audit | `/audit` | Implemented | Audit page/API are the stable user-facing replay entry; old replay section routes now resolve back to overview. |
| Health / digest | `/digest/latest` + `/healthz` | Implemented | Digest page is the operator-facing entry; `/healthz` remains the machine-readable health payload. |
| Export / import dry-run + safety gates | `/?section=settings` + `/export/state.json` + `/api/import/dry-run` | Implemented | Guard table shows gate posture; dry-run remains non-mutating by default. |
| Pixel / canvas adapter | `/view/pixel-state.json` | Implemented | Pixel scene payload (rooms/entities/links). |
| Full agent roster office model | `/?section=office-space` | Implemented | Roster merged from config + runtime with zone/desk occupancy floor. |

## Known Caveats
- UI-mode smoke in restricted sandboxes can fail with environment bind errors; use free ports and elevated execution when required.
- Provider subscription snapshots can still be unavailable; in that case values are derived from runtime spend + configured 30d budget limit and marked in source/detail fields.
