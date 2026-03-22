import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ToolClient } from "../src/clients/tool-client";
import { buildStructuredDocHubFromSessions } from "../src/runtime/doc-hub";
import type { ReadModelSnapshot } from "../src/types";

function createEmptySnapshot(): ReadModelSnapshot {
  const now = "2026-03-05T18:00:00.000Z";
  return {
    sessions: [],
    statuses: [],
    cronJobs: [],
    approvals: [],
    projects: { projects: [], updatedAt: now },
    projectSummaries: [],
    tasks: { tasks: [], agentBudgets: [], updatedAt: now },
    tasksSummary: {
      projects: 0,
      tasks: 0,
      todo: 0,
      inProgress: 0,
      blocked: 0,
      done: 0,
      owners: 0,
      artifacts: 0,
    },
    budgetSummary: { total: 0, ok: 0, warn: 0, over: 0, evaluations: [] },
    generatedAt: now,
  };
}

test("doc hub ingests structured chat outputs into runtime index", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "doc-hub-test-"));
  const indexPath = join(workspace, "doc-hub-chat.json");
  const snapshot = createEmptySnapshot();
  snapshot.sessions = [
    {
      sessionKey: "sess-alpha",
      label: "Alpha",
      agentId: "main",
      state: "running",
      lastMessageAt: "2026-03-05T18:01:00.000Z",
    },
  ];

  let historyCalls = 0;
  const client: ToolClient = {
    async sessionsList() {
      return { sessions: [] };
    },
    async sessionStatus() {
      return { rawText: "" };
    },
    async sessionsHistory() {
      historyCalls += 1;
      return {
        json: {
          history: [
            {
              role: "assistant",
              timestamp: "2026-03-05T18:01:00.000Z",
              content:
                "# 今日执行计划\n\n1. 核对 cron 任务与负责人\n2. 更新预算看板\n3. 输出复盘摘要\n\n- 风险：订阅窗口超限\n- 对策：先处理高价值任务\n\n## 下一步\n- 先修复心跳接入，再补文档入库。",
            },
          ],
        },
        rawText: "",
      };
    },
    async cronList() {
      return { jobs: [] };
    },
    async approvalsGet() {
      return { rawText: "" };
    },
    async approvalsApprove() {
      return { ok: false, action: "approve", approvalId: "na", rawText: "" };
    },
    async approvalsReject() {
      return { ok: false, action: "reject", approvalId: "na", rawText: "" };
    },
  };

  const result = await buildStructuredDocHubFromSessions({
    snapshot,
    client,
    indexPath,
    refreshFromSessions: true,
    maxSessions: 8,
    historyLimit: 40,
    maxDocsPerSession: 2,
    maxStoredDocs: 20,
  });

  assert(historyCalls >= 0);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].sourceSessionKey, "sess-alpha");
  assert.match(result.items[0].title, /今日执行计划/);
  assert.match(result.items[0].category, /(计划路线|会话文档|总结复盘)/);

  const persistedRaw = await readFile(indexPath, "utf8");
  assert(persistedRaw.includes("sess-alpha"));
  assert(persistedRaw.includes("今日执行计划"));
});
