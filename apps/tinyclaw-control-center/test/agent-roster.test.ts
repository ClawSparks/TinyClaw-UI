import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("agent roster treats openclaw.json as the current-project source of truth", async () => {
  const home = await mkdtemp(join(tmpdir(), "control-center-roster-"));
  const originalHome = process.env.OPENCLAW_HOME;
  const originalConfigPath = process.env.OPENCLAW_CONFIG_PATH;

  try {
    await mkdir(join(home, "agents", "pandas"), { recursive: true });
    await mkdir(join(home, "agents", "otter"), { recursive: true });
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

    process.env.OPENCLAW_HOME = home;
    delete process.env.OPENCLAW_CONFIG_PATH;

    const { loadBestEffortAgentRoster } = await import("../src/runtime/agent-roster");
    const roster = await loadBestEffortAgentRoster();

    assert.equal(roster.status, "connected");
    assert.equal(roster.entries.length, 2);
    assert(roster.entries.some((entry) => entry.agentId === "main"));
    assert(roster.entries.some((entry) => entry.agentId === "pandas"));
    assert(!roster.entries.some((entry) => entry.agentId === "otter"));
    assert(roster.detail.includes("source of truth"));
  } finally {
    if (originalHome === undefined) delete process.env.OPENCLAW_HOME;
    else process.env.OPENCLAW_HOME = originalHome;
    if (originalConfigPath === undefined) delete process.env.OPENCLAW_CONFIG_PATH;
    else process.env.OPENCLAW_CONFIG_PATH = originalConfigPath;
    await rm(home, { recursive: true, force: true });
  }
});

test("agent roster stays connected from runtime when openclaw.json is missing", async () => {
  const home = await mkdtemp(join(tmpdir(), "control-center-roster-runtime-"));
  const originalHome = process.env.OPENCLAW_HOME;
  const originalConfigPath = process.env.OPENCLAW_CONFIG_PATH;

  try {
    await mkdir(join(home, "agents", "monkey"), { recursive: true });
    await mkdir(join(home, "agents", "tiger"), { recursive: true });

    process.env.OPENCLAW_HOME = home;
    delete process.env.OPENCLAW_CONFIG_PATH;

    const { loadBestEffortAgentRoster } = await import("../src/runtime/agent-roster");
    const roster = await loadBestEffortAgentRoster();

    assert.equal(roster.status, "connected");
    assert.equal(roster.entries.length, 2);
    assert(roster.entries.some((entry) => entry.agentId === "monkey"));
    assert(roster.entries.some((entry) => entry.agentId === "tiger"));
  } finally {
    if (originalHome === undefined) delete process.env.OPENCLAW_HOME;
    else process.env.OPENCLAW_HOME = originalHome;
    if (originalConfigPath === undefined) delete process.env.OPENCLAW_CONFIG_PATH;
    else process.env.OPENCLAW_CONFIG_PATH = originalConfigPath;
    await rm(home, { recursive: true, force: true });
  }
});
