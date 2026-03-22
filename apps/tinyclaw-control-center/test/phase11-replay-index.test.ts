import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const RUNTIME_DIR = join(process.cwd(), "runtime");
const EXPORTS_DIR = join(RUNTIME_DIR, "exports");

test("replay index includes runtime export bundles", async () => {
  const { loadReplayIndex } = await import("../src/runtime/replay-index");

  await mkdir(EXPORTS_DIR, { recursive: true });
  const fileName = `zzzz-phase11-test-${Date.now()}.json`;
  const filePath = join(EXPORTS_DIR, fileName);

  const fixture = {
    exportedAt: new Date().toISOString(),
    snapshotGeneratedAt: new Date().toISOString(),
    requestId: "phase11-replay-test",
    projects: { projects: [{ projectId: "p1" }] },
    tasks: { tasks: [{ taskId: "t1", projectId: "p1" }] },
    sessions: [{ sessionKey: "s1" }],
    exceptionsFeed: { items: [{ code: "X" }] },
  };

  await writeFile(filePath, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");

  try {
    const replay = await loadReplayIndex({ exportLimit: 200 });
    assert(Array.isArray(replay.exportBundles));
    assert(replay.exportBundles.some((entry) => entry.fileName === fileName));
  } finally {
    await rm(filePath, { force: true });
  }
});
