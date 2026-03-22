import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function main(): Promise<void> {
  const previousCwd = process.cwd();
  const tempRoot = await mkdtemp(join(tmpdir(), "cc-task-store-"));

  try {
    process.chdir(tempRoot);
    await mkdir(join(tempRoot, "runtime"), { recursive: true });
    await writeFile(
      join(tempRoot, "runtime", "tasks.json"),
      JSON.stringify(
        {
          tasks: [],
          agentBudgets: [],
          updatedAt: "2026-03-01T00:00:00.000Z",
        },
        null,
        2,
      ),
      "utf8",
    );
    await writeFile(
      join(tempRoot, "runtime", "projects.json"),
      JSON.stringify(
        {
          projects: [
            {
              projectId: "p1",
              title: "Project One",
              status: "active",
              owner: "ops",
              budget: {},
              updatedAt: "2026-03-01T00:00:00.000Z",
            },
          ],
          updatedAt: "2026-03-01T00:00:00.000Z",
        },
        null,
        2,
      ),
      "utf8",
    );

    const taskStore = await import("../src/runtime/task-store");

    const created = await taskStore.createTask({
      projectId: "p1",
      taskId: "task-1",
      title: "Ship endpoint",
      owner: "main",
      dueAt: "2026-03-03T10:00:00.000Z",
      sessionKeys: ["agent:main:main"],
      status: "todo",
    });
    assert.equal(created.projectId, "p1");
    assert.equal(created.task.taskId, "task-1");
    assert.equal(created.task.status, "todo");
    assert.equal(created.task.dueAt, "2026-03-03T10:00:00.000Z");

    const updated = await taskStore.updateTaskStatus({
      taskId: "task-1",
      projectId: "p1",
      status: "blocked",
    });
    assert.equal(updated.task.status, "blocked");

    const store = await taskStore.loadTaskStore();
    const listed = taskStore.listTasks(store);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].taskId, "task-1");
    assert.equal(listed[0].status, "blocked");

    await assert.rejects(
      taskStore.createTask({
        projectId: "missing",
        taskId: "task-2",
        title: "Invalid",
      }),
      (error: unknown) =>
        error instanceof taskStore.TaskStoreValidationError &&
        error.statusCode === 404,
    );

    await assert.rejects(
      taskStore.updateTaskStatus({
        taskId: "task-1",
        projectId: "p1",
        status: "bad-status",
      }),
      (error: unknown) =>
        error instanceof taskStore.TaskStoreValidationError &&
        error.statusCode === 400,
    );

    console.log("validate-task-store: ok");
  } finally {
    process.chdir(previousCwd);
    await rm(tempRoot, { recursive: true, force: true });
  }
}

void main();
