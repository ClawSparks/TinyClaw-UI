import type {
  ApprovalsActionResponse,
  ApprovalsApproveRequest,
  ApprovalsGetResponse,
  ApprovalsRejectRequest,
  CronListResponse,
  SessionStatusResponse,
  SessionsHistoryRequest,
  SessionsHistoryResponse,
  SessionsListResponse,
} from "../contracts/openclaw-tools";
import { APPROVAL_ACTIONS_ENABLED } from "../config";

export interface ToolClient {
  sessionsList(): Promise<SessionsListResponse>;
  sessionStatus(sessionKey: string): Promise<SessionStatusResponse>;
  sessionsHistory(request: SessionsHistoryRequest): Promise<SessionsHistoryResponse>;
  cronList(): Promise<CronListResponse>;
  approvalsGet(): Promise<ApprovalsGetResponse>;
  approvalsApprove(request: ApprovalsApproveRequest): Promise<ApprovalsActionResponse>;
  approvalsReject(request: ApprovalsRejectRequest): Promise<ApprovalsActionResponse>;
}

export class ReadonlyToolClient implements ToolClient {
  async sessionsList(): Promise<SessionsListResponse> {
    return { sessions: [] };
  }

  async sessionStatus(_sessionKey: string): Promise<SessionStatusResponse> {
    return { rawText: "" };
  }

  async sessionsHistory(_request: SessionsHistoryRequest): Promise<SessionsHistoryResponse> {
    return { rawText: "" };
  }

  async cronList(): Promise<CronListResponse> {
    return { jobs: [] };
  }

  async approvalsGet(): Promise<ApprovalsGetResponse> {
    return { rawText: "" };
  }

  async approvalsApprove(request: ApprovalsApproveRequest): Promise<ApprovalsActionResponse> {
    if (!APPROVAL_ACTIONS_ENABLED) {
      throw new Error(
        `approvalsApprove is disabled by safety gate (APPROVAL_ACTIONS_ENABLED=${String(
          APPROVAL_ACTIONS_ENABLED,
        )}).`,
      );
    }

    return {
      ok: false,
      action: "approve",
      approvalId: request.approvalId,
      reason: request.reason,
      rawText: "readonly client has no approve capability",
    };
  }

  async approvalsReject(request: ApprovalsRejectRequest): Promise<ApprovalsActionResponse> {
    if (!APPROVAL_ACTIONS_ENABLED) {
      throw new Error(
        `approvalsReject is disabled by safety gate (APPROVAL_ACTIONS_ENABLED=${String(
          APPROVAL_ACTIONS_ENABLED,
        )}).`,
      );
    }

    return {
      ok: false,
      action: "reject",
      approvalId: request.approvalId,
      reason: request.reason,
      rawText: "readonly client has no reject capability",
    };
  }
}
