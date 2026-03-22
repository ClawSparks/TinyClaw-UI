import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import test from "node:test";
import type { ProjectTask, TaskStoreSnapshot } from "../src/types";
import { TASKS_PATH } from "../src/runtime/task-store";
import {
  TASK_HEARTBEAT_LOG_PATH,
  readTaskHeartbeatRuns,
  runTaskHeartbeat,
  selectHeartbeatTasks,
} from "../src/runtime/task-heartbeat";

test("selectHeartbeatTasks picks assigned todo tasks by due/age priority", () => {
  const store: TaskStoreSnapshot = {
    tasks: [
      buildTask({
        projectId: "p1",
        taskId: "late-unassigned",
        owner: "unassigned",
        dueAt: "2026-03-01T10:00:00.000Z",
      }),
      buildTask({
        projectId: "p1",
        taskId: "first",
        owner: "alex",
        dueAt: "2026-03-01T10:00:00.000Z",
        updatedAt: "2026-02-28T10:00:00.000Z",
      }),
      buildTask({
        projectId: "p1",
        taskId: "second",
        owner: "sam",
        dueAt: "2026-03-03T10:00:00.000Z",
        updatedAt: "2026-02-27T10:00:00.000Z",
      }),
      buildTask({
        projectId: "p1",
        taskId: "already-running",
        owner: "sam",
        status: "in_progress",
      }),
      buildTask({
        projectId: "p1",
        taskId: "third-no-due",
        owner: "zoe",
      }),
    ],
    agentBudgets: [],
    updatedAt: "2026-03-01T00:00:00.000Z",
  };

  const selected = selectHeartbeatTasks(store, 2);
  assert.equal(selected.length, 2);
  assert.equal(selected[0].taskId, "first");
  assert.equal(selected[1].taskId, "second");
});

test("runTaskHeartbeat dry-run records selection without mutating task store", async () => {
  const tasksBefore = await readOptionalFile(TASKS_PATH);
  const logBefore = await readOptionalFile(TASK_HEARTBEAT_LOG_PATH);

  await writeTaskStoreFixture([
    buildTask({ projectId: "p1", taskId: "todo-1", owner: "alex" }),
    buildTask({ projectId: "p1", taskId: "todo-2", owner: "sam" }),
  ]);

  try {
    const result = await runTaskHeartbeat({
      gate: {
        enabled: true,
        dryRun: true,
        maxTasksPerRun: 1,
        localTokenAuthRequired: true,
        localTokenConfigured: false,
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.mode, "dry_run");
    assert.equal(result.selected, 1);
    assert.equal(result.executed, 0);

    const raw = await readFile(TASKS_PATH, "utf8");
    const parsed = JSON.parse(raw) as TaskStoreSnapshot;
    const statuses = parsed.tasks.map((task) => task.status);
    assert.deepEqual(statuses, ["todo", "todo"]);
  } finally {
    await restoreOptionalFile(TASKS_PATH, tasksBefore);
    await restoreOptionalFile(TASK_HEARTBEAT_LOG_PATH, logBefore);
  }
});

test("runTaskHeartbeat live mode moves selected assigned todo tasks to in_progress", async () => {
  const tasksBefore = await readOptionalFile(TASKS_PATH);
  const logBefore = await readOptionalFile(TASK_HEARTBEAT_LOG_PATH);

  await writeTaskStoreFixture([
    buildTask({
      projectId: "p-live",
      taskId: "due-fast",
      owner: "alex",
      dueAt: "2026-03-01T09:00:00.000Z",
      updatedAt: "2026-02-25T00:00:00.000Z",
    }),
    buildTask({ projectId: "p-live", taskId: "unassigned", owner: "unassigned" }),
    buildTask({
      projectId: "p-live",
      taskId: "todo-second",
      owner: "sam",
      dueAt: "2026-03-05T09:00:00.000Z",
      updatedAt: "2026-02-26T00:00:00.000Z",
    }),
    buildTask({ projectId: "p-live", taskId: "already-running", owner: "taylor", status: "in_progress" }),
  ]);

  try {
    const result = await runTaskHeartbeat({
      gate: {
        enabled: true,
        dryRun: false,
        maxTasksPerRun: 2,
        localTokenAuthRequired: true,
        localTokenConfigured: true,
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.mode, "live");
    assert.equal(result.selected, 2);
    assert.equal(result.executed, 2);

    const raw = await readFile(TASKS_PATH, "utf8");
    const parsed = JSON.parse(raw) as TaskStoreSnapshot;
    const byTaskId = new Map(parsed.tasks.map((task) => [task.taskId, task.status]));
    assert.equal(byTaskId.get("due-fast"), "in_progress");
    assert.equal(byTaskId.get("todo-second"), "in_progress");
    assert.equal(byTaskId.get("unassigned"), "todo");

    const runs = await readTaskHeartbeatRuns(5);
    assert(runs.count >= 1);
    assert.equal(runs.runs[0].mode, "live");
  } finally {
    await restoreOptionalFile(TASKS_PATH, tasksBefore);
    await restoreOptionalFile(TASK_HEARTBEAT_LOG_PATH, logBefore);
  }
});

function buildTask(input: {
  projectId: string;
  taskId: string;
  owner: string;
  status?: "todo" | "in_progress" | "blocked" | "done";
  dueAt?: string;
  updatedAt?: string;
}): ProjectTask {
  return {
    projectId: input.projectId,
    taskId: input.taskId,
    title: input.taskId,
    status: input.status ?? "todo",
    owner: input.owner,
    dueAt: input.dueAt,
    definitionOfDone: [],
    artifacts: [],
    rollback: {
      strategy: "manual",
      steps: [],
    },
    sessionKeys: [],
    budget: {},
    updatedAt: input.updatedAt ?? "2026-03-01T00:00:00.000Z",
  };
}

async function writeTaskStoreFixture(tasks: ProjectTask[]): Promise<void> {
  const store: TaskStoreSnapshot = {
    tasks,
    agentBudgets: [],
    updatedAt: "2026-03-01T00:00:00.000Z",
  };
  await mkdir(dirname(TASKS_PATH), { recursive: true });
  await writeFile(TASKS_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

async function readOptionalFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

async function restoreOptionalFile(path: string, content: string | undefined): Promise<void> {
  if (content === undefined) {
    await rm(path, { force: true });
    return;
  }
  await writeFile(path, content, "utf8");
}
