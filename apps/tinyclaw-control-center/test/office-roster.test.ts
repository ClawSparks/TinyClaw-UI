import assert from "node:assert/strict";
import test from "node:test";
import type { ToolClient } from "../src/clients/tool-client";
import type { ReadModelSnapshot } from "../src/types";

test("office roster fallback keeps full known agent list even without live sessions", async () => {
  const { buildOfficeAgentRosterIds, buildOfficeSpaceCards } = await import("../src/ui/server");
  const snapshot = buildSnapshotFixture();

  const knownAgents = ["pandas", "otter", "tiger"];
  const rosterIds = buildOfficeAgentRosterIds(snapshot, [], knownAgents);
  assert.equal(rosterIds.length, 3);
  assert(rosterIds.includes("pandas"));
  assert(rosterIds.includes("otter"));
  assert(rosterIds.includes("tiger"));

  const cards = buildOfficeSpaceCards(snapshot, [], knownAgents);
  assert.equal(cards.length, 3);
  const otter = cards.find((item) => item.agentId === "otter");
  assert(otter, "Expected known roster agent to render a card.");
  assert.equal(otter.status, "inactive");
  assert.equal(otter.officeZone, "Standby Pods");
});

test("office cards use runtime active-session map when snapshot sessions are empty", async () => {
  const { buildOfficeSpaceCards } = await import("../src/ui/server");
  const snapshot = buildSnapshotFixture();

  const cards = buildOfficeSpaceCards(snapshot, [], ["codex"], new Map([["codex", 2]]));
  const codex = cards.find((item) => item.agentId === "codex");
  assert(codex, "Expected runtime-mapped agent card.");
  assert.equal(codex.activeSessions, 2);
  assert.equal(codex.status, "running");
  assert.equal(codex.officeZone, "Builder Desks");
});

test("office cards ignore unknown runtime agents when a current roster is present", async () => {
  const { buildOfficeSpaceCards } = await import("../src/ui/server");
  const snapshot = buildSnapshotFixture();
  snapshot.sessions = [
    {
      sessionKey: "agent:codex:legacy",
      agentId: "codex",
      state: "running",
      lastMessageAt: "2026-03-10T10:00:00.000Z",
    },
  ];

  const cards = buildOfficeSpaceCards(snapshot, [], ["main"], new Map([["codex", 2], ["main", 1]]));
  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.agentId, "main");
  assert.equal(cards[0]?.activeSessions, 1);
});

test("office cards do not mark agents as running from idle historical sessions alone", async () => {
  const { buildOfficeSpaceCards } = await import("../src/ui/server");
  const snapshot = buildSnapshotFixture();
  snapshot.sessions = [
    {
      sessionKey: "agent:main:main",
      agentId: "main",
      state: "idle",
      lastMessageAt: "2026-03-09T16:27:26.457Z",
    },
    {
      sessionKey: "agent:main:cron:job-1:run:child-1",
      agentId: "main",
      state: "idle",
      lastMessageAt: "2026-03-09T15:15:00.020Z",
    },
  ];

  const cards = buildOfficeSpaceCards(snapshot, [], ["main"]);
  const main = cards.find((item) => item.agentId === "main");
  assert(main, "Expected main card.");
  assert.equal(main.activeSessions, 0);
  assert.equal(main.status, "idle");
  assert.equal(main.officeZone, "Standby Pods");
});

test("office cards keep agents idle when they only have unfinished tasks but no live sessions", async () => {
  const { buildOfficeSpaceCards } = await import("../src/ui/server");
  const snapshot = buildSnapshotFixture();
  const tasks = [
    {
      projectId: "p-1",
      projectTitle: "Project One",
      taskId: "task-1",
      title: "Prepare next report",
      status: "todo",
      owner: "main",
      sessionKeys: [],
      updatedAt: "2026-03-10T10:00:00.000Z",
    },
  ];

  const cards = buildOfficeSpaceCards(snapshot, tasks, ["main"]);
  const main = cards.find((item) => item.agentId === "main");
  assert(main, "Expected main card.");
  assert.equal(main.activeSessions, 0);
  assert.equal(main.status, "idle");
  assert.equal(main.officeZone, "Standby Pods");
  assert.deepEqual(main.focusItems, ["Prepare next report"]);
});

test("execution summaries infer cron ownership from agent cron session keys when jobs omit ownerAgentId", async () => {
  const { buildExecutionAgentSummaries } = await import("../src/ui/server");
  const snapshot = buildSnapshotFixture();
  snapshot.sessions = [
    {
      sessionKey: "agent:main:cron:job-1",
      agentId: "main",
      state: "idle",
      lastMessageAt: "2026-03-09T16:27:26.457Z",
    },
    {
      sessionKey: "agent:main:cron:job-1:run:child-1",
      agentId: "main",
      state: "idle",
      lastMessageAt: "2026-03-09T16:28:00.000Z",
    },
  ];

  const rows = buildExecutionAgentSummaries(
    snapshot,
    [],
    [
      {
        jobId: "job-1",
        name: "Demo cron",
        enabled: true,
        owner: "Scheduler",
        purpose: "Run demo cron.",
        scheduleLabel: "cron * * * * *",
        sourcePath: "/tmp/jobs.json",
      },
    ],
    [],
    new Map(),
  );
  const main = rows.find((item) => item.agentId === "main");
  assert(main, "Expected main execution summary.");
  assert.equal(main.enabledCronJobs, 1);
  assert.deepEqual(main.cronJobNames, ["Demo cron"]);
});

test("execution summaries ignore agents outside the current roster", async () => {
  const { buildExecutionAgentSummaries } = await import("../src/ui/server");
  const snapshot = buildSnapshotFixture();
  snapshot.sessions = [
    {
      sessionKey: "agent:codex:legacy",
      agentId: "codex",
      state: "running",
      lastMessageAt: "2026-03-09T16:27:26.457Z",
    },
  ];

  const rows = buildExecutionAgentSummaries(
    snapshot,
    [],
    [],
    [{ agentId: "main", displayName: "main" }],
    new Map([["codex", 999], ["main", 10]]),
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.agentId, "main");
});

test("staff overview recent output is per-agent and excludes user/thinking noise", async () => {
  const { buildStaffOverviewCards } = await import("../src/ui/server");
  const snapshot = buildSnapshotFixture();
  snapshot.sessions = [
    {
      sessionKey: "agent:main:main",
      agentId: "main",
      state: "idle",
      lastMessageAt: "2026-03-09T16:30:00.000Z",
    },
    {
      sessionKey: "agent:main:cron:job-1",
      agentId: "main",
      state: "idle",
      lastMessageAt: "2026-03-09T16:00:00.000Z",
    },
    {
      sessionKey: "agent:otter:main",
      agentId: "otter",
      state: "idle",
      lastMessageAt: "2026-03-09T15:00:00.000Z",
    },
  ];

  const client: ToolClient = {
    async sessionsList() { return { sessions: [] }; },
    async sessionStatus() { return { rawText: "" }; },
    async sessionsHistory(request) {
      if (request.sessionKey === "agent:main:main") {
        return {
          json: {
            history: [
              { role: "user", content: "继续推进当前目标：在达到 Alex Finn 流程最终验收前不要停。" },
              { role: "assistant", content: "[Mon 2026-03-09 09:01 GMT+1] OpenClaw runtime context (internal): This context is run-only." },
              { role: "assistant", content: "thinking **Summarizing discussion points**" },
            ],
          },
          rawText: "",
        };
      }
      if (request.sessionKey === "agent:main:cron:job-1") {
        return {
          json: {
            history: [
              { role: "assistant", content: "{\"ok\":true,\"sent\":5}" },
            ],
          },
          rawText: "",
        };
      }
      if (request.sessionKey === "agent:otter:main") {
        return {
          json: {
            history: [
              { role: "assistant", content: "Conversation info (untrusted metadata): ```json {\"message_id\":\"1022\"}```" },
              { role: "assistant", content: "已记录并设置提醒。" },
            ],
          },
          rawText: "",
        };
      }
      return { rawText: "" };
    },
    async cronList() { return { jobs: [] }; },
    async approvalsGet() { return { rawText: "" }; },
    async approvalsApprove() { return { ok: false, action: "approve", approvalId: "x", rawText: "" }; },
    async approvalsReject() { return { ok: false, action: "reject", approvalId: "x", reason: "no", rawText: "" }; },
  };

  const cards = await buildStaffOverviewCards({
    snapshot,
    client,
    members: [
      { agentId: "main", displayName: "main", model: "gpt", workspace: "main", toolsProfile: "full" },
      { agentId: "otter", displayName: "otter", model: "gpt", workspace: "otter", toolsProfile: "minimal" },
    ],
    officeCards: [
      {
        agentId: "main",
        identity: { animal: "lion", title: "Commander", accent: "#ff9966", sprite: "lion" },
        status: "idle",
        statusLabel: "待命",
        officeZone: "Standby Pods",
        activeSessions: 0,
        activeTasks: 0,
        focusItems: [],
        summary: "待命中。",
      },
      {
        agentId: "otter",
        identity: { animal: "otter", title: "Assistant", accent: "#88d5f6", sprite: "otter" },
        status: "idle",
        statusLabel: "待命",
        officeZone: "Standby Pods",
        activeSessions: 0,
        activeTasks: 0,
        focusItems: [],
        summary: "待命中。",
      },
    ],
    executionAgentSummaries: [
      { agentId: "main", displayName: "main", activeSessions: 0, activeTasks: 0, enabledCronJobs: 1, cronJobNames: ["Demo cron"], recentTokens30d: 0 },
      { agentId: "otter", displayName: "otter", activeSessions: 0, activeTasks: 0, enabledCronJobs: 0, cronJobNames: [], recentTokens30d: 0 },
    ],
    language: "zh",
  });

  const main = cards.find((item) => item.agentId === "main");
  const otter = cards.find((item) => item.agentId === "otter");
  assert(main);
  assert(otter);
  assert.equal(main.recentOutput, "最近完成一次任务，并返回结构化结果。");
  assert.equal(main.currentWorkLabel, "下一项");
  assert.equal(main.currentWork, "Demo cron");
  assert.equal(main.scheduledLabel, "已排班");
  assert.equal(otter.currentWorkLabel, "正在处理什么");
  assert.equal(otter.recentOutput, "已记录并设置提醒。");
});

test("staff overview uses next-up wording when tasks exist but no live session is active", async () => {
  const { buildStaffOverviewCards } = await import("../src/ui/server");
  const snapshot = buildSnapshotFixture();
  const client: ToolClient = {
    async sessionsList() { return { sessions: [] }; },
    async sessionStatus() { return { rawText: "" }; },
    async sessionsHistory() { return { rawText: "" }; },
    async cronList() { return { jobs: [] }; },
    async approvalsGet() { return { rawText: "" }; },
    async approvalsApprove() { return { ok: false, action: "approve", approvalId: "x", rawText: "" }; },
    async approvalsReject() { return { ok: false, action: "reject", approvalId: "x", reason: "no", rawText: "" }; },
  };

  const cards = await buildStaffOverviewCards({
    snapshot,
    client,
    members: [
      { agentId: "main", displayName: "main", model: "gpt", workspace: "main", toolsProfile: "full" },
    ],
    officeCards: [
      {
        agentId: "main",
        identity: { animal: "lion", title: "Commander", accent: "#ff9966", sprite: "lion" },
        status: "idle",
        statusLabel: "待命",
        officeZone: "Standby Pods",
        activeSessions: 0,
        activeTasks: 1,
        focusItems: ["Prepare next report"],
        summary: "当前跟进：Prepare next report",
      },
    ],
    executionAgentSummaries: [
      { agentId: "main", displayName: "main", activeSessions: 0, activeTasks: 1, enabledCronJobs: 0, cronJobNames: [], recentTokens30d: 0 },
    ],
    language: "zh",
  });

  const main = cards.find((item) => item.agentId === "main");
  assert(main);
  assert.equal(main.statusLabel, "待命");
  assert.equal(main.currentWorkLabel, "下一项");
  assert.equal(main.currentWork, "Prepare next report");
});

test("staff overview does not show standby copy while status is running", async () => {
  const { buildStaffOverviewCards } = await import("../src/ui/server");
  const snapshot = buildSnapshotFixture();
  const client: ToolClient = {
    async sessionsList() { return { sessions: [] }; },
    async sessionStatus() { return { rawText: "" }; },
    async sessionsHistory() { return { rawText: "" }; },
    async cronList() { return { jobs: [] }; },
    async approvalsGet() { return { rawText: "" }; },
    async approvalsApprove() { return { ok: false, action: "approve", approvalId: "x", rawText: "" }; },
    async approvalsReject() { return { ok: false, action: "reject", approvalId: "x", reason: "no", rawText: "" }; },
  };

  const cards = await buildStaffOverviewCards({
    snapshot,
    client,
    members: [
      { agentId: "main", displayName: "main", model: "gpt", workspace: "main", toolsProfile: "full" },
    ],
    officeCards: [
      {
        agentId: "main",
        identity: { animal: "lion", title: "Commander", accent: "#ff9966", sprite: "lion" },
        status: "running",
        statusLabel: "执行中",
        officeZone: "Builder Desks",
        activeSessions: 1,
        activeTasks: 0,
        focusItems: [],
        summary: "会话已开启，等待下一步指令。",
      },
    ],
    executionAgentSummaries: [
      { agentId: "main", displayName: "main", activeSessions: 1, activeTasks: 0, enabledCronJobs: 2, cronJobNames: ["Job A", "Job B"], recentTokens30d: 0 },
    ],
    language: "zh",
  });

  const main = cards.find((item) => item.agentId === "main");
  assert(main);
  assert.equal(main.statusLabel, "工作中");
  assert.equal(main.currentWorkLabel, "正在处理什么");
  assert.equal(main.currentWork, "Job A");
  assert.notEqual(main.currentWork, "正在执行排班任务");
  assert.notEqual(main.currentWork, "按排班待命");
});

test("staff overview downgrades residual running sessions after explicit stop signal", async () => {
  const { buildStaffOverviewCards } = await import("../src/ui/server");
  const snapshot = buildSnapshotFixture();
  snapshot.sessions = [
    {
      sessionKey: "agent:coq:main",
      agentId: "coq",
      state: "running",
      lastMessageAt: "2026-03-09T22:31:49.227Z",
    },
  ];

  const client: ToolClient = {
    async sessionsList() { return { sessions: [] }; },
    async sessionStatus() { return { rawText: "" }; },
    async sessionsHistory() {
      return {
        json: {
          history: [
            { role: "user", content: "[Mon 2026-03-09 23:30 GMT+1] 立即停止你当前的所有活动，不要继续任何 review、演示、brief、整理、输出、工具调用或后续收尾扩展。从现在起进入待命状态，不再处理任何当前任务。回复必须是：REPLY_SKIP；announce：ANNOUNCE_SKIP" },
            { role: "assistant", content: "[[reply_to_current]]REPLY_SKIP" },
            { role: "assistant", content: "[Mon 2026-03-09 23:31 GMT+1] Agent-to-agent announce step." },
            { role: "assistant", content: "thinking **Implementing exact skip announcement**" },
          ],
        },
        rawText: "",
      };
    },
    async cronList() { return { jobs: [] }; },
    async approvalsGet() { return { rawText: "" }; },
    async approvalsApprove() { return { ok: false, action: "approve", approvalId: "x", rawText: "" }; },
    async approvalsReject() { return { ok: false, action: "reject", approvalId: "x", reason: "no", rawText: "" }; },
  };

  const cards = await buildStaffOverviewCards({
    snapshot,
    client,
    members: [
      { agentId: "coq", displayName: "Coq-每日新闻", model: "gpt", workspace: "coq", toolsProfile: "minimal" },
    ],
    officeCards: [
      {
        agentId: "coq",
        identity: { animal: "rooster", title: "Reporter", accent: "#ffcc66", sprite: "rooster" },
        status: "running",
        statusLabel: "执行中",
        officeZone: "Builder Desks",
        activeSessions: 1,
        activeTasks: 0,
        focusItems: [],
        summary: "当前有会话在运行。",
      },
    ],
    executionAgentSummaries: [
      { agentId: "coq", displayName: "Coq-每日新闻", activeSessions: 1, activeTasks: 0, enabledCronJobs: 1, cronJobNames: ["Coq-每日新闻 | Trend Report 09:00"], recentTokens30d: 0 },
    ],
    language: "zh",
  });

  const coq = cards.find((item) => item.agentId === "coq");
  assert(coq);
  assert.equal(coq.statusLabel, "待命");
  assert.equal(coq.currentWorkLabel, "下一项");
  assert.equal(coq.currentWork, "Coq-每日新闻 | Trend Report 09:00");
  assert.equal(coq.recentOutput, "最近已停止当前任务并回到待命。");
});

test("staff overview downgrades residual running sessions from nested OpenClaw history payloads", async () => {
  const { buildStaffOverviewCards } = await import("../src/ui/server");
  const snapshot = buildSnapshotFixture();
  snapshot.sessions = [
    {
      sessionKey: "agent:pandas:main",
      agentId: "pandas",
      state: "running",
      lastMessageAt: "2026-03-09T22:56:03.814Z",
    },
  ];

  const client: ToolClient = {
    async sessionsList() { return { sessions: [] }; },
    async sessionStatus() { return { rawText: "" }; },
    async sessionsHistory() {
      return {
        json: {
          history: [
            {
              type: "message",
              timestamp: "2026-03-09T22:55:43.287Z",
              message: {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: "[Mon 2026-03-09 23:55 GMT+1] 立即停止你当前的所有活动，不要继续任何 review、演示、brief、整理、输出、工具调用或后续收尾扩展。从现在起进入待命状态，不再处理任何当前任务。回复必须是：REPLY_SKIP。announce 必须是：ANNOUNCE_SKIP。",
                  },
                ],
              },
            },
            {
              type: "message",
              timestamp: "2026-03-09T22:55:46.209Z",
              message: {
                role: "assistant",
                content: [
                  { type: "thinking", thinking: "**Deciding reply tag usage**" },
                  { type: "text", text: "REPLY_SKIP" },
                ],
              },
            },
            {
              type: "message",
              timestamp: "2026-03-09T22:56:01.532Z",
              message: {
                role: "user",
                content: [
                  { type: "text", text: "[Mon 2026-03-09 23:56 GMT+1] Agent-to-agent announce step." },
                ],
              },
            },
            {
              type: "message",
              timestamp: "2026-03-09T22:56:03.814Z",
              message: {
                role: "assistant",
                content: [
                  { type: "thinking", thinking: "" },
                  { type: "text", text: "ANNOUNCE_SKIP" },
                ],
              },
            },
          ],
        },
        rawText: "",
      };
    },
    async cronList() { return { jobs: [] }; },
    async approvalsGet() { return { rawText: "" }; },
    async approvalsApprove() { return { ok: false, action: "approve", approvalId: "x", rawText: "" }; },
    async approvalsReject() { return { ok: false, action: "reject", approvalId: "x", reason: "no", rawText: "" }; },
  };

  const cards = await buildStaffOverviewCards({
    snapshot,
    client,
    members: [
      { agentId: "pandas", displayName: "pandas", model: "gpt", workspace: "pandas", toolsProfile: "full" },
    ],
    officeCards: [
      {
        agentId: "pandas",
        identity: { animal: "panda", title: "Planner", accent: "#86e2ef", sprite: "panda" },
        status: "running",
        statusLabel: "执行中",
        officeZone: "Builder Desks",
        activeSessions: 1,
        activeTasks: 0,
        focusItems: [],
        summary: "当前有会话在运行。",
      },
    ],
    executionAgentSummaries: [
      { agentId: "pandas", displayName: "pandas", activeSessions: 1, activeTasks: 0, enabledCronJobs: 0, cronJobNames: [], recentTokens30d: 0 },
    ],
    language: "zh",
  });

  const pandas = cards.find((item) => item.agentId === "pandas");
  assert(pandas);
  assert.equal(pandas.statusLabel, "待命");
  assert.equal(pandas.currentWorkLabel, "正在处理什么");
  assert.equal(pandas.currentWork, "当前无实时任务");
  assert.equal(pandas.recentOutput, "最近已停止当前任务并回到待命。");
});

function buildSnapshotFixture(): ReadModelSnapshot {
  const now = new Date().toISOString();
  return {
    sessions: [],
    statuses: [],
    cronJobs: [],
    approvals: [],
    projects: {
      updatedAt: now,
      projects: [],
    },
    projectSummaries: [],
    tasks: {
      updatedAt: now,
      agentBudgets: [],
      tasks: [],
    },
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
    budgetSummary: {
      total: 0,
      ok: 0,
      warn: 0,
      over: 0,
      evaluations: [],
    },
    generatedAt: now,
  };
}
