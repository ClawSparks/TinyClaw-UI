# 24/7 Control Plan (Pandas)

## P0 Checklist (must pass in order)

- [x] P0-1 Single Run Lock
  - lock file: `runtime/run.lock`
  - acquire rejects concurrent non-expired lock
  - renew only works for owner
  - release requires owner or expired lock
  - fencing token increments on each new acquire after expiry/reacquire

- [x] P0-2 Evidence Gate
- [x] P0-3 Stall Detection + Auto-Heal
- [x] P0-4 Goal State Machine (DoD + phase gates)

## P1 Checklist

- [x] P1-1 Unified artifact directories baseline (`runtime/evidence`, `runtime/health`, `runtime/recovery`)
- [x] P1-2 Periodic health/evidence snapshot automation
- [x] P1-3 Evidence-only reporter wiring to outbound updates
- [x] P1-4 Single-chain watchdog orchestration

## P2 Checklist

- [x] P2-1 Resident worker loop (`worker:resident`) with lock lease renew + cycle heartbeat/progress artifacts
- [x] P2-2 Resident supervisor (`supervisor:resident`) with stale/dead restart decisions, bounded retries, recovery reports
- [x] P2-3 Independent DoD checker (`dod:check`) with machine-readable DoD status artifact and hard gate for done state

## Evidence for P0-1

- command: `npm run lock:acquire`
- command: `npm run lock:status`
- command: `npm run lock:renew`
- command: `npm run lock:release`
- artifact: `runtime/run.lock`

## Evidence for P1-2

- command: `npm run health:snapshot:periodic`
- artifacts:
  - `runtime/health/snapshots/<timestamp>.json`
  - `runtime/health/latest.pointer.json`
  - `runtime/evidence/snapshots/<timestamp>.json`
  - `runtime/evidence/latest.pointer.json`

## Evidence for P1-3

- command: `npm run evidence:report`
- command: `node --import tsx scripts/evidence-reporter.ts <incomplete-evidence.json> <outbound-dir>` (fails closed)
- artifacts:
  - `runtime/evidence/outbound/<timestamp>.json`
  - `runtime/evidence/outbound/latest.json`
  - `runtime/evidence/outbound/latest.pointer.json`
- hard gate:
  - 当 evidence.completed 包含完成语义（done/completed/完成）时，`evidence:report` 会先执行 `dod:check`
  - 若 DoD 未通过，系统层拦截并返回 `REPORT_BLOCKED_DOD NOT_DONE`，禁止发出“完成”消息

## Evidence for P1-4

- command: `npm run watchdog:run`
- artifact: `runtime/recovery/watchdog-latest.json`
- behavior:
  - lock owner conflict exits non-zero (`WATCHDOG_LOCK_CONFLICT`)
  - owner lock renew/acquire + heal chain succeeds (`WATCHDOG_OK`)

## Product DoD (Ti acceptance gate)

Mission Control 只有在以下标准全部通过时才允许标记完成，否则必须保持 `NOT_DONE`：
- 全量任务可视化：所有 cron + heartbeat 任务可见（谁在执行、在做什么、下次时间、最近结果）
- 非技术化默认视图：不暴露无用技术噪音（PID/命令/JSON键等）
- 全中文彻底 + 初中生可懂
- 一眼看全局（cron/heartbeat/当前任务/工具调用）
- UI 达到 Apple 原生风格水准
- 订阅窗口必须真实接通；若未接通必须明确阻塞与下一步，不可模糊 partial
- Ti 人工验收通过

系统硬规则：
- 未达标 = `NOT_DONE`
- `NOT_DONE` 时禁止宣布完成
- `NOT_DONE` 时施工链必须持续运行，不能停工

DoD 定义文件：`runtime/evidence/product-dod.json`
DoD 状态产物：`runtime/evidence/dod-status.json`

## Evidence for P2 Triplet

- commands:
  - `npm run worker:resident`
  - `npm run supervisor:resident`
  - `npm run dod:check`
- artifacts:
  - `runtime/health/worker-heartbeat.json`
  - `runtime/evidence/worker-progress.json`
  - `runtime/evidence/dod-status.json`
  - `runtime/recovery/supervisor-latest.json`
  - `runtime/recovery/supervisor-audit.log`
- guarantees:
  - worker exits non-zero on lock owner conflict (`WORKER_LOCK_CONFLICT`)
  - worker runs resident loop by default: `codex-patch -> test -> evidence-report -> health-snapshot -> next cycle`
  - supervisor restarts on stale/dead worker with bounded retries
  - neither worker nor supervisor treats run as done unless `dod:check` returns `DONE` (otherwise `NOT_DONE`)
