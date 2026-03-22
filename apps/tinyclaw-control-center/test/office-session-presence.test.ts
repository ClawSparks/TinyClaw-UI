import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("office session presence parses nested session stores and second-based timestamps", async () => {
  const home = await mkdtemp(join(tmpdir(), "control-center-office-presence-"));
  const originalHome = process.env.OPENCLAW_HOME;

  try {
    const sessionsDir = join(home, "agents", "pandas", "sessions");
    await mkdir(sessionsDir, { recursive: true });
    const nowSeconds = Math.floor(Date.now() / 1000);
    await writeFile(
      join(sessionsDir, "sessions.json"),
      JSON.stringify(
        {
          sessions: {
            "agent:pandas:1": {
              sessionId: "session-1",
              updatedAt: nowSeconds,
              state: "running",
            },
            "agent:pandas:2": {
              sessionId: "session-2",
              updatedAt: String(nowSeconds - 10),
              active: true,
            },
            "agent:pandas:3": {
              sessionId: "session-3",
              updatedAt: nowSeconds,
              state: "idle",
            },
          },
          meta: {
            generatedAt: nowSeconds,
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    process.env.OPENCLAW_HOME = home;
    const { loadBestEffortOfficeSessionPresence } = await import("../src/runtime/office-session-presence");
    const snapshot = await loadBestEffortOfficeSessionPresence();

    assert.equal(snapshot.status, "connected");
    assert.equal(snapshot.totalActiveSessions, 2);
    assert.equal(snapshot.activeSessionsByAgent.get("pandas"), 2);
  } finally {
    if (originalHome === undefined) delete process.env.OPENCLAW_HOME;
    else process.env.OPENCLAW_HOME = originalHome;
    await rm(home, { recursive: true, force: true });
  }
});

test("office session presence parses array-shaped stores with acp state", async () => {
  const home = await mkdtemp(join(tmpdir(), "control-center-office-presence-array-"));
  const originalHome = process.env.OPENCLAW_HOME;

  try {
    const sessionsDir = join(home, "agents", "otter", "sessions");
    await mkdir(sessionsDir, { recursive: true });
    const nowIso = new Date().toISOString();
    await writeFile(
      join(sessionsDir, "sessions.json"),
      JSON.stringify(
        [
          {
            sessionId: "session-a",
            updatedAt: nowIso,
            acp: {
              state: "processing",
            },
          },
          {
            sessionId: "session-b",
            updatedAt: nowIso,
            acp: {
              state: "completed",
            },
          },
        ],
        null,
        2,
      ),
      "utf8",
    );

    process.env.OPENCLAW_HOME = home;
    const { loadBestEffortOfficeSessionPresence } = await import("../src/runtime/office-session-presence");
    const snapshot = await loadBestEffortOfficeSessionPresence();

    assert.equal(snapshot.status, "connected");
    assert.equal(snapshot.totalActiveSessions, 1);
    assert.equal(snapshot.activeSessionsByAgent.get("otter"), 1);
  } finally {
    if (originalHome === undefined) delete process.env.OPENCLAW_HOME;
    else process.env.OPENCLAW_HOME = originalHome;
    await rm(home, { recursive: true, force: true });
  }
});

test("office session presence auto-expands recency window when initial pass is all-zero", async () => {
  const home = await mkdtemp(join(tmpdir(), "control-center-office-presence-fallback-"));
  const originalHome = process.env.OPENCLAW_HOME;

  try {
    const sessionsDir = join(home, "agents", "main", "sessions");
    await mkdir(sessionsDir, { recursive: true });
    const updatedAtIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    await writeFile(
      join(sessionsDir, "sessions.json"),
      JSON.stringify(
        {
          sessions: {
            "agent:main:1": {
              sessionId: "session-1",
              updatedAt: updatedAtIso,
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    process.env.OPENCLAW_HOME = home;
    const { loadBestEffortOfficeSessionPresence } = await import("../src/runtime/office-session-presence");
    const snapshot = await loadBestEffortOfficeSessionPresence();

    assert.equal(snapshot.status, "connected");
    assert.equal(snapshot.totalActiveSessions, 1);
    assert.equal(snapshot.activeSessionsByAgent.get("main"), 1);
    assert(snapshot.detail.includes("Window auto-expanded"), "Expected adaptive fallback detail in snapshot.");
  } finally {
    if (originalHome === undefined) delete process.env.OPENCLAW_HOME;
    else process.env.OPENCLAW_HOME = originalHome;
    await rm(home, { recursive: true, force: true });
  }
});

test("office session presence filters to current configured agents when openclaw.json is present", async () => {
  const home = await mkdtemp(join(tmpdir(), "control-center-office-presence-roster-"));
  const originalHome = process.env.OPENCLAW_HOME;

  try {
    const pandasDir = join(home, "agents", "pandas", "sessions");
    const legacyDir = join(home, "agents", "codex", "sessions");
    await mkdir(pandasDir, { recursive: true });
    await mkdir(legacyDir, { recursive: true });
    const nowIso = new Date().toISOString();
    await writeFile(
      join(home, "openclaw.json"),
      JSON.stringify(
        {
          agents: {
            list: [
              { id: "main", name: "main" },
              { id: "pandas", name: "pandas" },
            ],
          },
        },
        null,
        2,
      ),
      "utf8",
    );
    await writeFile(
      join(pandasDir, "sessions.json"),
      JSON.stringify(
        {
          sessions: {
            "agent:pandas:1": {
              sessionId: "session-1",
              updatedAt: nowIso,
              state: "running",
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );
    await writeFile(
      join(legacyDir, "sessions.json"),
      JSON.stringify(
        {
          sessions: {
            "agent:codex:1": {
              sessionId: "session-2",
              updatedAt: nowIso,
              state: "running",
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    process.env.OPENCLAW_HOME = home;
    const { loadBestEffortOfficeSessionPresence } = await import("../src/runtime/office-session-presence");
    const snapshot = await loadBestEffortOfficeSessionPresence();

    assert.equal(snapshot.status, "connected");
    assert.equal(snapshot.totalActiveSessions, 1);
    assert.equal(snapshot.activeSessionsByAgent.get("pandas"), 1);
    assert.equal(snapshot.activeSessionsByAgent.has("codex"), false);
  } finally {
    if (originalHome === undefined) delete process.env.OPENCLAW_HOME;
    else process.env.OPENCLAW_HOME = originalHome;
    await rm(home, { recursive: true, force: true });
  }
});
