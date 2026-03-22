import assert from "node:assert/strict";
import test from "node:test";

test("commander exceptions feed ordering is deterministic by severity then time", async () => {
  const { commanderExceptionsFeed } = await import("../src/runtime/commander");

  const snapshot = {
    sessions: [
      {
        sessionKey: "s-error",
        state: "error",
        agentId: "agent-1",
        label: "Error Session",
        lastMessageAt: "2026-03-01T10:00:00.000Z",
      },
      {
        sessionKey: "s-blocked",
        state: "blocked",
        agentId: "agent-2",
        label: "Blocked Session",
        lastMessageAt: "2026-03-01T11:00:00.000Z",
      },
    ],
    statuses: [],
    cronJobs: [],
    approvals: [
      {
        approvalId: "approval-b",
        status: "pending",
        requestedAt: "2026-03-01T09:00:00.000Z",
        updatedAt: "2026-03-01T09:00:00.000Z",
      },
      {
        approvalId: "approval-a",
        status: "pending",
        requestedAt: "2026-03-01T09:00:00.000Z",
        updatedAt: "2026-03-01T09:00:00.000Z",
      },
    ],
    projects: {
      updatedAt: "2026-03-01T08:00:00.000Z",
      projects: [],
    },
    projectSummaries: [],
    tasks: {
      updatedAt: "2026-03-01T08:00:00.000Z",
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
    generatedAt: "2026-03-01T12:00:00.000Z",
  } as const;

  const first = commanderExceptionsFeed(snapshot).items.map((item) => ({
    level: item.level,
    code: item.code,
    sourceId: item.sourceId,
    occurredAt: item.occurredAt,
  }));
  const second = commanderExceptionsFeed(snapshot).items.map((item) => ({
    level: item.level,
    code: item.code,
    sourceId: item.sourceId,
    occurredAt: item.occurredAt,
  }));

  assert.deepEqual(first, second);
  assert.equal(first[0]?.level, "action-required");
  assert.equal(first[0]?.code, "SESSION_ERROR");
  assert.equal(first[1]?.code, "PENDING_APPROVAL");
  assert.equal(first[1]?.sourceId, "approval-a");
  assert.equal(first[2]?.sourceId, "approval-b");
});

test("stale runtime issue sessions stay out of the current action queue", async () => {
  const { commanderExceptions, commanderExceptionsFeed } = await import("../src/runtime/commander");

  const now = new Date();
  const freshAt = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
  const staleAt = new Date(now.getTime() - 8 * 60 * 60 * 1000).toISOString();
  const generatedAt = now.toISOString();
  const snapshot = {
    sessions: [
      {
        sessionKey: "s-error-stale",
        state: "error",
        agentId: "agent-1",
        label: "Stale Error Session",
        lastMessageAt: staleAt,
      },
      {
        sessionKey: "s-blocked-fresh",
        state: "blocked",
        agentId: "agent-2",
        label: "Fresh Blocked Session",
        lastMessageAt: freshAt,
      },
      {
        sessionKey: "s-error-fresh",
        state: "error",
        agentId: "agent-3",
        label: "Fresh Error Session",
        lastMessageAt: freshAt,
      },
    ],
    statuses: [],
    cronJobs: [],
    approvals: [],
    projects: {
      updatedAt: generatedAt,
      projects: [],
    },
    projectSummaries: [],
    tasks: {
      updatedAt: generatedAt,
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
    generatedAt,
  } as const;

  const exceptions = commanderExceptions(snapshot);
  const feed = commanderExceptionsFeed(snapshot);

  assert.equal(exceptions.errors.length, 1);
  assert.equal(exceptions.errors[0]?.sessionKey, "s-error-fresh");
  assert.equal(exceptions.blocked.length, 1);
  assert.equal(exceptions.blocked[0]?.sessionKey, "s-blocked-fresh");
  assert(feed.items.every((item) => item.sourceId !== "s-error-stale"));
});
