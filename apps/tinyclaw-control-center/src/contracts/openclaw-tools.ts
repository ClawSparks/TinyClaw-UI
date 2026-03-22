export interface SessionsListRequest {
  limit?: number;
}

export interface SessionsListItem {
  key?: string;
  sessionKey?: string;
  sessionId?: string;
  label?: string;
  agentId?: string;
  sessionFile?: string;
  updatedAt?: string;
  updatedAtMs?: number;
  active?: boolean;
  state?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface SessionsListResponse {
  sessions?: SessionsListItem[];
}

export interface SessionStatusRequest {
  sessionKey: string;
}

export interface SessionStatusResponse {
  rawText: string;
}

export interface SessionsHistoryRequest {
  sessionKey: string;
  limit?: number;
}

export interface SessionsHistoryResponse {
  json?: Record<string, unknown>;
  rawText: string;
}

export interface CronListRequest {
  includeDisabled?: boolean;
}

export interface CronJobItem {
  jobId?: string;
  id?: string;
  name?: string;
  enabled?: boolean;
  nextRunAt?: string;
  state?: {
    nextRunAtMs?: number;
  };
}

export interface CronListResponse {
  jobs?: CronJobItem[];
}

export interface ApprovalItem {
  id?: string;
  key?: string;
  sessionKey?: string;
  agentId?: string;
  state?: string;
  status?: string;
  decision?: string;
  command?: string;
  prompt?: string;
  reason?: string;
  createdAt?: string;
  requestedAt?: string;
  updatedAt?: string;
  expiresAt?: string;
}

export interface ApprovalsGetResponse {
  json?: Record<string, unknown>;
  rawText: string;
}

export interface ApprovalsApproveRequest {
  approvalId: string;
  reason?: string;
}

export interface ApprovalsRejectRequest {
  approvalId: string;
  reason: string;
}

export interface ApprovalsActionResponse {
  ok: boolean;
  action: "approve" | "reject";
  approvalId: string;
  reason?: string;
  rawText: string;
}
