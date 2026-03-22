import type {
  ApprovalsGetResponse,
  CronListResponse,
  SessionsListResponse,
} from "../contracts/openclaw-tools";
import type {
  ApprovalState,
  ApprovalSummary,
  AgentRunState,
  CronJobSummary,
  SessionSummary,
} from "../types";

const RUNNING_SESSION_STATES = new Set([
  "running",
  "active",
  "busy",
  "working",
  "in_progress",
  "processing",
  "thinking",
  "executing",
  "streaming",
]);
const BLOCKED_SESSION_STATES = new Set([
  "blocked",
  "needs_support",
  "stuck",
]);
const WAITING_APPROVAL_SESSION_STATES = new Set([
  "waiting_approval",
  "pending_approval",
  "approval_pending",
  "awaiting_approval",
  "needs_approval",
]);
const ERROR_SESSION_STATES = new Set([
  "error",
  "failed",
  "failure",
  "crashed",
  "panic",
]);

function toState(active: boolean | undefined, explicitState?: string): AgentRunState {
  const normalized = explicitState?.trim().toLowerCase();
  if (normalized) {
    if (WAITING_APPROVAL_SESSION_STATES.has(normalized)) return "waiting_approval";
    if (BLOCKED_SESSION_STATES.has(normalized)) return "blocked";
    if (ERROR_SESSION_STATES.has(normalized)) return "error";
    if (RUNNING_SESSION_STATES.has(normalized)) return "running";
    if (normalized === "idle" || normalized === "inactive" || normalized === "done" || normalized === "completed" || normalized === "stopped" || normalized === "closed") {
      return "idle";
    }
  }
  if (active === true) return "running";
  return "idle";
}

function toIso(updatedAtMs?: number, updatedAt?: string): string | undefined {
  if (updatedAt) return updatedAt;
  if (typeof updatedAtMs === "number") return new Date(updatedAtMs).toISOString();
  return undefined;
}

export function mapSessionsListToSummaries(input: SessionsListResponse): SessionSummary[] {
  const mapped = (input.sessions ?? []).map((item) => ({
    sessionKey: item.sessionKey ?? item.key,
    label: item.label,
    agentId: item.agentId,
    lastMessageAt: toIso(item.updatedAtMs, item.updatedAt),
    state: toState(item.active, item.state),
  }));

  return mapped
    .filter((item) => Boolean(item.sessionKey))
    .map((item) => ({
      sessionKey: item.sessionKey as string,
      label: item.label,
      agentId: item.agentId,
      lastMessageAt: item.lastMessageAt,
      state: item.state,
    }));
}

export function mapCronListToSummaries(input: CronListResponse): CronJobSummary[] {
  const mapped = (input.jobs ?? []).map((job) => ({
    jobId: job.jobId ?? job.id,
    name: job.name,
    enabled: job.enabled ?? true,
    nextRunAt:
      job.nextRunAt ??
      (typeof job.state?.nextRunAtMs === "number"
        ? new Date(job.state.nextRunAtMs).toISOString()
        : undefined),
  }));

  return mapped
    .filter((job) => Boolean(job.jobId))
    .map((job) => ({
      jobId: job.jobId as string,
      name: job.name,
      enabled: job.enabled,
      nextRunAt: job.nextRunAt,
    }));
}

export function mapApprovalsGetToSummaries(input: ApprovalsGetResponse): ApprovalSummary[] {
  if (input.json) {
    return mapApprovalsJsonToSummaries(input.json);
  }

  return mapApprovalsTextToSummaries(input.rawText);
}

function mapApprovalsJsonToSummaries(json: Record<string, unknown>): ApprovalSummary[] {
  const approvals: ApprovalSummary[] = [];

  approvals.push(...mapApprovalArray(asArray(json.pending), "pending", "pending"));
  approvals.push(...mapApprovalArray(asArray(json.requests), "pending", "requests"));
  approvals.push(...mapApprovalArray(asArray(json.approvals), "unknown", "approvals"));

  const file = asObject(json.file);
  if (!file) return dedupeById(approvals);

  approvals.push(...mapApprovalArray(asArray(file.pending), "pending", "file-pending"));
  approvals.push(...mapApprovalArray(asArray(file.requests), "pending", "file-requests"));
  approvals.push(...mapApprovalArray(asArray(file.approvals), "unknown", "file-approvals"));
  approvals.push(...mapApprovalArray(asArray(file.allowlist), "approved", "file-allowlist"));

  const defaults = asObject(file.defaults);
  if (defaults) {
    let idx = 0;
    for (const [key, value] of Object.entries(defaults)) {
      idx += 1;
      const status = toApprovalState(asString(value), asString(value), "unknown");
      approvals.push({
        approvalId: `default:${key}:${idx}`,
        status,
        decision: asString(value),
        reason: "defaults rule",
      });
    }
  }

  const agents = asObject(file.agents);
  if (agents) {
    for (const [agentId, config] of Object.entries(agents)) {
      const cfg = asObject(config);
      if (!cfg) continue;

      approvals.push(
        ...mapApprovalArray(asArray(cfg.pending), "pending", `agent:${agentId}:pending`, agentId),
      );
      approvals.push(
        ...mapApprovalArray(asArray(cfg.requests), "pending", `agent:${agentId}:requests`, agentId),
      );
      approvals.push(
        ...mapApprovalArray(asArray(cfg.approvals), "unknown", `agent:${agentId}:approvals`, agentId),
      );
      approvals.push(
        ...mapApprovalArray(
          asArray(cfg.allowlist),
          "approved",
          `agent:${agentId}:allowlist`,
          agentId,
        ),
      );
    }
  }

  return dedupeById(approvals);
}

function mapApprovalsTextToSummaries(rawText: string): ApprovalSummary[] {
  const fields = extractFieldValueTable(rawText);
  const pendingCount = toInt(fields.pending) ?? 0;
  const allowlistCount = toInt(fields.allowlist) ?? 0;
  const approvals: ApprovalSummary[] = [];

  for (let i = 0; i < pendingCount; i += 1) {
    approvals.push({
      approvalId: `pending:${i + 1}`,
      status: "pending",
      reason: "from approvals text snapshot",
    });
  }

  if (allowlistCount > 0) {
    approvals.push({
      approvalId: "allowlist:summary",
      status: "approved",
      decision: "allowlist",
      reason: `allowlist entries: ${allowlistCount}`,
    });
  }

  return approvals;
}

function mapApprovalArray(
  array: unknown[] | undefined,
  fallbackState: ApprovalState,
  prefix: string,
  agentIdFromContext?: string,
): ApprovalSummary[] {
  if (!array || array.length === 0) return [];

  return array
    .map((item, idx) => mapApprovalRecord(item, fallbackState, `${prefix}:${idx + 1}`, agentIdFromContext))
    .filter((item): item is ApprovalSummary => Boolean(item));
}

function mapApprovalRecord(
  record: unknown,
  fallbackState: ApprovalState,
  fallbackId: string,
  agentIdFromContext?: string,
): ApprovalSummary | null {
  const obj = asObject(record);
  if (!obj) {
    if (typeof record === "string") {
      return {
        approvalId: fallbackId,
        status: fallbackState,
        decision: record,
      };
    }

    return null;
  }

  const statusRaw = asString(obj.status) ?? asString(obj.state);
  const decisionRaw = asString(obj.decision);
  const agentId = asString(obj.agentId) ?? agentIdFromContext;

  return {
    approvalId:
      asString(obj.id) ??
      asString(obj.key) ??
      asString(obj.approvalId) ??
      asString(obj.requestId) ??
      fallbackId,
    sessionKey: asString(obj.sessionKey),
    agentId,
    status: toApprovalState(statusRaw, decisionRaw, fallbackState),
    decision: decisionRaw ?? statusRaw,
    command: asString(obj.command) ?? asString(obj.cmd) ?? asString(obj.pattern) ?? asString(obj.prompt),
    reason: asString(obj.reason) ?? asString(obj.summary),
    requestedAt: asString(obj.requestedAt) ?? asString(obj.createdAt),
    updatedAt: asString(obj.updatedAt),
  };
}

function dedupeById(items: ApprovalSummary[]): ApprovalSummary[] {
  const seen = new Set<string>();
  const out: ApprovalSummary[] = [];

  for (const item of items) {
    if (seen.has(item.approvalId)) continue;
    seen.add(item.approvalId);
    out.push(item);
  }

  return out;
}

function extractFieldValueTable(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(/^\s*│\s*([^│]+?)\s*│\s*([^│]+?)\s*│\s*$/);
    if (!match) continue;
    const field = match[1].trim().toLowerCase();
    const value = match[2].trim();
    if (!field || field === "field" || field === "value") continue;
    result[field] = value;
  }

  return result;
}

function toApprovalState(
  statusRaw: string | undefined,
  decisionRaw: string | undefined,
  fallback: ApprovalState,
): ApprovalState {
  const value = `${statusRaw ?? ""} ${decisionRaw ?? ""}`.toLowerCase();
  if (value.includes("pending") || value.includes("wait")) return "pending";
  if (value.includes("approved") || value.includes("allow") || value.includes("granted")) return "approved";
  if (value.includes("denied") || value.includes("reject")) return "denied";
  return fallback;
}

function toInt(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const match = v.match(/\d+/);
  if (!match) return undefined;
  const parsed = Number.parseInt(match[0], 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function asArray(v: unknown): unknown[] | undefined {
  return Array.isArray(v) ? v : undefined;
}

function asObject(v: unknown): Record<string, unknown> | undefined {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}
