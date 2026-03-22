import assert from "node:assert/strict";
import { computeBudgetSummary } from "../src/runtime/budget-governance";
import type {
  ProjectStoreSnapshot,
  SessionStatusSnapshot,
  SessionSummary,
  TaskStoreSnapshot,
} from "../src/types";

function main(): void {
  const sessions: SessionSummary[] = [
    { sessionKey: "s1", agentId: "main", state: "running" },
    { sessionKey: "s2", agentId: "main", state: "running" },
    { sessionKey: "s3", agentId: "worker", state: "idle" },
  ];

  const statuses: SessionStatusSnapshot[] = [
    {
      sessionKey: "s1",
      tokensIn: 110,
      tokensOut: 30,
      cost: 5,
      updatedAt: "2026-03-01T00:00:00.000Z",
    },
    {
      sessionKey: "s2",
      tokensIn: 15,
      tokensOut: 10,
      cost: 1,
      updatedAt: "2026-03-01T00:00:00.000Z",
    },
    {
      sessionKey: "s3",
      tokensIn: 20,
      tokensOut: 5,
      cost: 0.5,
      updatedAt: "2026-03-01T00:00:00.000Z",
    },
  ];

  const tasks: TaskStoreSnapshot = {
    tasks: [
      {
        projectId: "proj-1",
        taskId: "task-over",
        title: "Task Over",
        status: "in_progress",
        owner: "main",
        definitionOfDone: [],
        artifacts: [],
        rollback: { strategy: "manual", steps: [] },
        sessionKeys: ["s1"],
        budget: { tokensIn: 100, warnRatio: 0.8 },
        updatedAt: "2026-03-01T00:00:00.000Z",
      },
      {
        projectId: "proj-1",
        taskId: "task-ok",
        title: "Task Ok",
        status: "todo",
        owner: "main",
        definitionOfDone: [],
        artifacts: [],
        rollback: { strategy: "manual", steps: [] },
        sessionKeys: ["s2"],
        budget: { totalTokens: 100, warnRatio: 0.8 },
        updatedAt: "2026-03-01T00:00:00.000Z",
      },
    ],
    agentBudgets: [
      {
        agentId: "main",
        thresholds: { totalTokens: 200, warnRatio: 0.8 },
      },
    ],
    updatedAt: "2026-03-01T00:00:00.000Z",
  };

  const projects: ProjectStoreSnapshot = {
    projects: [
      {
        projectId: "proj-1",
        title: "Project 1",
        status: "active",
        owner: "main",
        budget: { totalTokens: 120, warnRatio: 0.8 },
        updatedAt: "2026-03-01T00:00:00.000Z",
      },
    ],
    updatedAt: "2026-03-01T00:00:00.000Z",
  };

  const summary = computeBudgetSummary(sessions, statuses, tasks, projects);
  assert.equal(summary.total, 4);
  assert.equal(summary.ok, 1);
  assert.equal(summary.warn, 1);
  assert.equal(summary.over, 2);

  const byId = new Map(summary.evaluations.map((item) => [`${item.scope}:${item.scopeId}`, item.status]));
  assert.equal(byId.get("task:task-over"), "over");
  assert.equal(byId.get("task:task-ok"), "ok");
  assert.equal(byId.get("project:proj-1"), "over");
  assert.equal(byId.get("agent:main"), "warn");

  console.log("validate-budget-compute: ok");
}

main();
