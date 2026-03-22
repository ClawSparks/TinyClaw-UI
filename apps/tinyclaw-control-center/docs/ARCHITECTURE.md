# Architecture (Official-First)

## Core Principle
Use official OpenClaw interfaces first, then add thin adapters only when required.

## Official Capability Mapping

1) Gateway (control plane)
- Endpoint: `GATEWAY_URL` (defaults to `ws://127.0.0.1:18789`)
- Role: real-time event/control backbone

2) Sessions APIs
- `sessions_list`: discover sessions/agents
- `sessions_history`: inspect message history
- `sessions_send`: route instructions
- Local session-visibility module merges `sessions_list` with per-session latest history snippets for operator read APIs.
- Session history normalization distinguishes regular messages and tool events for readonly drill-down rendering.

3) Runtime status
- `session_status`: usage/time/cost/status snapshots

4) Scheduling / Ops
- `cron`: list/add/run/runs for scheduled tasks

5) Governance
- approvals + tool policy boundaries for sensitive actions
- approvals action service is runtime-gated and dry-run by default
- every approval action attempt writes audit entries to `runtime/approval-actions.log`

6) Visual layer
- Canvas/A2UI for future Gameboy-style rendering

7) Project/task state
- Local typed project store at `runtime/projects.json`
- Local typed task store at `runtime/tasks.json`
- Tasks are linked to projects via `projectId` and validated on create/update flows
- Domain entities include project status/owner/title + task owner/DoD/artifacts/rollback plan/per-scope thresholds
- Local HTTP APIs support project list/create/update and task list/create/update-status with schema validation
- Snapshot includes `projectSummaries` for board views and operational counts

8) Budget governance
- Scopes: `agent`, `project`, `task`
- Inputs: session usage snapshots (`tokensIn`, `tokensOut`, optional `cost`)
- Runtime policy file: `runtime/budgets.json` with validated defaults and optional per-scope overrides
- Output status: `ok`, `warn`, `over` via threshold + warn ratio computation
- Commander exceptions endpoint reports `over-budget` entries only

9) Alert routing
- Levels: `info`, `warn`, `action-required`
- Routing targets:
  - `info` -> `timeline`
  - `warn` -> `operator-watch`
  - `action-required` -> `action-queue`
- Exceptions feed endpoint: `GET /exceptions`
- Notification center queue endpoint: `GET /api/action-queue`
- Queue items include links to related `/sessions/:id`, `/tasks`, `/projects` targets when context is available.
- Queue acknowledgements persisted at `runtime/acks.json`
- Ack API endpoint: `POST /api/action-queue/:itemId/ack`
  - optional acknowledgement expiry via `ttlMinutes` or `snoozeUntil`

10) Audit timeline
- Aggregates runtime sources into a unified event list:
  - `runtime/timeline.log` (monitor diffs)
  - `runtime/approval-actions.log` (action audit trail)
  - `runtime/operation-audit.log` (import dry-run + backup export actions)
  - snapshot health event from `runtime/last-snapshot.json`
- Local page: `GET /audit`
- JSON API: `GET /api/audit`
- Timeline is newest-first with severity filter (`all|info|warn|action-required|error`).

11) Linkage graph + state export
- `GET /graph` returns normalized graph data (`project/task/session/agent` nodes and linkage edges).
- `GET /export/state.json` returns bundled project/task/budget/exception state for downstream consumers.

12) Commander digest
- On each monitor run, a daily digest is written to:
  - `runtime/digests/YYYY-MM-DD.json`
  - `runtime/digests/YYYY-MM-DD.md`
- Digest captures operational counts + alerts + exception summary for commander review.

13) Pixel data adapter (Phase 7)
- Endpoint: `GET /view/pixel-state.json`
- Purpose: minimal adapter for future Gameboy view.
- Output model: `rooms`, `entities`, `links` generated from local project/task/session/agent state.

14) Notification policy engine (Phase 7)
- Runtime policy file: `runtime/notification-policy.json`
- Supports:
  - quiet hours suppression
  - severity-to-route mapping (`info/warn/action-required`)
- Preview endpoint: `GET /notifications/preview` (optional `?at=<ISO>` simulation).

15) Cron overview (Phase 7)
- Endpoint: `GET /cron`
- Summarizes next run timing, per-job health (`scheduled/due/late/unknown/disabled`), and monitor lag state.

16) System health panel endpoint (Phase 7)
- Endpoint: `GET /healthz`
- Combines:
  - build/runtime info (`package.json`, dist build timestamp, safety gates)
  - snapshot freshness (`runtime/last-snapshot.json` age)
  - monitor lag (`runtime/timeline.log` latest tick)

17) Markdown digest renderer page (Phase 7)
- Endpoint: `GET /digest/latest`
- Reads latest `runtime/digests/*.md` and renders safe HTML for operator consumption.

18) Operator dashboard preferences + quick filters (Phase 8)
- Home page resolves effective filters from URL query + persisted defaults in `runtime/ui-preferences.json`.
- Compact status strip mode is persisted and toggleable from dashboard UI.
- Quick filters (`all`, `attention`, task states) apply readonly task subsets without mutating task state.

19) Search APIs (Phase 8)
- Endpoints:
  - `GET /api/search/tasks`
  - `GET /api/search/projects`
  - `GET /api/search/sessions`
  - `GET /api/search/exceptions`
- Semantics:
  - case-insensitive substring matching only (safe includes, no regex eval)
  - bounded `limit` query to cap payload size and prevent oversized scans

20) Replay index + API docs (Phase 8)
- `GET /api/replay/index` indexes:
  - `runtime/timeline.log`
  - `runtime/digests/*.json`
  - `runtime/export-snapshots/*.json`
  - `runtime/exports/*.json`
- optional query window filters:
  - `from=<ISO>`
  - `to=<ISO>`
- replay response includes per-source filter observability stats:
  - `total`, `returned`, `filteredOut`, `filteredOutByWindow`, `filteredOutByLimit`
- `GET /api/docs` returns route + schema summary payload for operator/debug usage.
- `GET /export/state.json` now also persists timestamped export snapshots under `runtime/export-snapshots/`.

21) Request telemetry correlation (Phase 8)
- Request ID resolution:
  - incoming `x-request-id` sanitized and reused when valid
  - otherwise generated UUID
- Correlation propagation:
  - all responses include `x-request-id`
  - JSON responses include top-level `requestId`
  - error envelope includes `error.requestId`
  - warn/error logs include the same requestId

22) Integration readiness + backup/import surfaces (Phase 9)
- Final integration checklist endpoint:
  - `GET /done-checklist` (alias `GET /api/done-checklist`)
  - Builds docs-aligned checklist with runtime capability checks.
  - Computes lightweight readiness scores: `observability`, `governance`, `collaboration`, `security`.
- Export backup command:
  - app command mode `backup-export` writes timestamped bundles to `runtime/exports/*.json`.
- Import dry-run validator:
  - API: `POST /api/import/dry-run`
  - app command mode: `import-validate <file>`
  - validates bundle shape only; no mutation.
- Optional live import mutation endpoint:
  - API: `POST /api/import/live`
  - requires explicit env gate `IMPORT_MUTATION_ENABLED=true`
  - still requires local token auth
  - blocked while `READONLY_MODE=true` unless request sets `dryRun=true`
- Commander feed order is normalized for operator priority:
  - severity first (`action-required` > `warn` > `info`)
  - newest event timestamp within each severity bucket.

23) Local mutation/import auth gate + deterministic ordering hardening (Phase 10)
- New local auth gate defaults:
  - `LOCAL_TOKEN_AUTH_REQUIRED=true`
  - `LOCAL_API_TOKEN` must be configured for protected operations
  - token accepted via `x-local-token` or `Authorization: Bearer`
- Protected routes:
  - all state-changing endpoints (`POST`/`PATCH`)
  - import/export routes with side effects (`/api/import/dry-run`, `/api/import/live`, `/export/state.json`, `/api/export/state.json`)
- Protected command paths:
  - `backup-export`
  - `import-validate`
  - `acks-prune`
- Operation audit trail:
  - import dry-run, import apply, backup export, and ack prune attempts append JSONL entries to `runtime/operation-audit.log`
  - audit timeline now includes source `operation`
- Commander feed ordering tie-breakers are now fully deterministic after severity/time (code/source/sourceId/route/message).

24) Replay windowing + acknowledgement TTL semantics (Phase 13)
- Replay index supports optional global time window filtering (`from`, `to`) over:
  - timeline entries
  - digest entries
  - export snapshots
  - export bundles
- Action queue acknowledgements support optional expiry:
  - `ttlMinutes` (relative duration)
  - `snoozeUntil` (absolute future timestamp)
- Expired acknowledgements are treated as inactive, so queue items reappear without manual reset.

25) Replay filter stats + stale ack prune command (Phase 14)
- Replay index exposes per-source and aggregate filtered-vs-returned stats for operator debugging on large windows.
- Replay stats now include per-source latency and size indicators (`latencyMs`, `latencyBucketsMs.p50`, `latencyBucketsMs.p95`, `totalSizeBytes`, `returnedSizeBytes`) for large-instance troubleshooting.
- Home dashboard replay panel surfaces returned/filtered counts to reduce blind spots when window/limit filters hide artifacts.
- Added command-mode stale ack prune:
  - `APP_COMMAND=acks-prune`
  - optional dry-run via `COMMAND_ARG=--dry-run` or `ACK_PRUNE_DRY_RUN=true`
  - local token-gated by default when `LOCAL_TOKEN_AUTH_REQUIRED=true`
  - prunes expired `runtime/acks.json` entries and writes `ack_prune` operation audit records.

26) Mission Control v3 parity + office model (Phase 25)
- UI shell upgraded to polished pixel-office visual system (tokenized colors/spacing/radii/shadows, layered background, responsive rails, subtle motion).
- Primary IA renamed for operator intent:
  - Command Deck, Usage & Billing, Pixel Office, Work Board, Decisions, Timeline, Control Room.
- Added Mac parity surface matrix panel in Command Deck:
  - each core capability exposes status + direct route entry.
- Added agent roster adapter:
  - module: `src/runtime/agent-roster.ts`
  - source: best-effort read from `~/.openclaw/openclaw.json` (read-only)
  - fallback merge with runtime session/task/project/budget signals to avoid missing inactive agents.
- Pixel Office renders desk/zone occupancy instead of session-only grouping.

27) Subscription usage/remaining contract (Phase 25)
- Usage adapter now includes best-effort subscription source probes:
  - `runtime/subscription-snapshot.json`
  - `~/.openclaw/subscription.json`
  - `~/.openclaw/billing/subscription.json`
  - `~/.openclaw/billing/usage.json`
  - `~/.openclaw/usage/subscription.json`
- Data contract in `UsageCostSnapshot.subscription`:
  - `connected`: consumed/remaining/limit/cycle/source available
  - `partial`: source found but fields incomplete/parse issues
  - `not_connected`: explicit connection hint
- Connector state now includes `subscriptionUsage` and exposes actionable TODOs when disconnected.

## MVP Scope (Phase 1)
- Local scaffold only
- No network calls in default readonly mode
- Define contracts + polling config

## Safety Constraints (Current)
- `READONLY_MODE=true` is the default and remains the primary runtime mode.
- `APPROVAL_ACTIONS_ENABLED=false` by default; no real approve/reject runs unless this is explicitly `true`.
- `APPROVAL_ACTIONS_DRY_RUN=true` by default; action endpoints simulate and audit but do not execute.
- `IMPORT_MUTATION_ENABLED=false` by default; live import apply is disabled unless explicitly gated on.
- `IMPORT_MUTATION_DRY_RUN=false` by default; `/api/import/live` uses request `dryRun=true` for non-mutating execution when needed.
- `LOCAL_TOKEN_AUTH_REQUIRED=true` by default; protected operations remain blocked unless explicit local token is configured and presented.
- Writes are limited to local `control-center/runtime/*` files (`last-snapshot.json`, `timeline.log`, `projects.json`, `tasks.json`, `budgets.json`, `acks.json`, `approval-actions.log`, `operation-audit.log`, `ui-preferences.json`, `export-snapshots/*.json`, `exports/*.json`).
- Runtime digests are local-only artifacts under `control-center/runtime/digests/*`.
- No mutation of OpenClaw runtime config from this project.

## Local API Surface
- `GET /projects`
- `GET /api/projects`
- `POST /api/projects`
- `PATCH /api/projects/:projectId`
- `GET /api/tasks`
- `GET /tasks`
- `GET /sessions`
- `GET /sessions/:id`
- `GET /session/:id`
- `GET /api/sessions`
- `GET /api/sessions/:id`
- `POST /api/tasks`
- `PATCH /api/tasks/:taskId/status`
- `GET /api/action-queue`
- `GET /api/action-queue/acks/prune-preview`
- `POST /api/action-queue/:itemId/ack`
- `GET /exceptions`
- `GET /api/commander/exceptions`
- `GET /graph`
- `GET /view/pixel-state.json`
- `GET /export/state.json`
- `GET /notifications/preview`
- `GET /cron`
- `GET /healthz`
- `GET /digest/latest`
- `GET /audit`
- `GET /api/audit`
- `GET /api/ui/preferences`
- `PATCH /api/ui/preferences`
- `GET /api/search/tasks`
- `GET /api/search/projects`
- `GET /api/search/sessions`
- `GET /api/search/exceptions`
- `GET /api/replay/index`
- `GET /api/docs`
- `GET /done-checklist`
- `GET /api/done-checklist`
- `POST /api/import/dry-run`
- `POST /api/import/live`
- `POST /api/approvals/:approvalId/approve`
- `POST /api/approvals/:approvalId/reject`
