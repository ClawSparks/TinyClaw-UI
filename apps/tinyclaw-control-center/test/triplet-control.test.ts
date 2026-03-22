import assert from "node:assert/strict";
import { mkdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

const PROJECT_ROOT = process.cwd();

test("resident worker enforces single-chain lock ownership", async () => {
  const runtimeDir = join(PROJECT_ROOT, "runtime", `zzzz-triplet-lock-${Date.now()}`);
  const lockPath = join(runtimeDir, "run.lock");
  await mkdir(runtimeDir, { recursive: true });
  await writeFile(
    lockPath,
    `${JSON.stringify(
      {
        runId: "lock-1",
        owner: "other-owner",
        startedAt: new Date(Date.now() - 60_000).toISOString(),
        updatedAt: new Date().toISOString(),
        leaseUntil: new Date(Date.now() + 10 * 60_000).toISOString(),
        fencingToken: 1,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  try {
    const run = await runNodeScript(["scripts/resident-worker.ts", runtimeDir], {
      ...process.env,
      RUN_OWNER: "pandas-owner",
      WORKER_MAX_CYCLES: "1",
      WORKER_STEPS: "goal-gate",
    });
    assert.equal(run.code, 1);
    assert(run.stderr.includes("WORKER_LOCK_CONFLICT"), run.stderr);
  } finally {
    await rm(runtimeDir, { recursive: true, force: true });
  }
});

test("resident supervisor restarts worker when heartbeat is stale", async () => {
  const runtimeDir = join(PROJECT_ROOT, "runtime", `zzzz-triplet-supervisor-${Date.now()}`);
  const heartbeatPath = join(runtimeDir, "health", "worker-heartbeat.json");
  const recoveryPath = join(runtimeDir, "recovery", "supervisor-latest.json");
  await mkdir(join(runtimeDir, "health"), { recursive: true });
  await mkdir(join(runtimeDir, "evidence"), { recursive: true });
  await writeFile(
    heartbeatPath,
    `${JSON.stringify(
      {
        generatedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
        pid: 999999,
        state: "waiting",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  const staleTime = new Date(Date.now() - 10 * 60_000);
  await utimes(heartbeatPath, staleTime, staleTime);

  await writeFile(
    join(runtimeDir, "goal-state.json"),
    `${JSON.stringify(
      {
        goalId: "triplet-goal",
        definitionOfDone: ["build", "test"],
        phases: [{ id: "phase-1", status: "done" }],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    join(runtimeDir, "evidence", "latest.json"),
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        itemId: "triplet",
        completed: "worker baseline",
        filesChanged: ["scripts/resident-worker.ts"],
        verification: "test",
        visibleMarker: "runtime/evidence/latest.json",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    join(runtimeDir, "evidence", "product-dod.json"),
    `${JSON.stringify(
      {
        fullChinese: true,
        nonTechnicalCopy: true,
        middleSchoolReadable: true,
        globalVisibility: true,
        appleNativeUI: true,
        realSubscriptionConnected: true,
        tiApproval: false,
        notes: "triplet fixture",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    join(runtimeDir, "subscription-snapshot.json"),
    `${JSON.stringify(
      {
        planLabel: "Provider Pro",
        consumed: 120,
        remaining: 880,
        limit: 1000,
        unit: "USD",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  try {
    const run = await runNodeScript(["scripts/resident-supervisor.ts", runtimeDir], {
      ...process.env,
      RUN_OWNER: "pandas-owner",
      SUPERVISOR_ONCE: "true",
      SUPERVISOR_RESTART_MODE: "sync",
      SUPERVISOR_HEARTBEAT_MAX_AGE_MS: "1000",
      SUPERVISOR_MAX_RESTARTS: "2",
      WORKER_STEPS: "goal-gate",
      WORKER_INTERVAL_MS: "1",
      WORKER_MAX_CYCLES: "3",
    });
    assert.equal(run.code, 0, `supervisor failed\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}`);

    const report = JSON.parse(await readFile(recoveryPath, "utf8")) as {
      status?: string;
      actions?: string[];
      retries?: number;
    };
    assert.equal(report.status, "restarted");
    assert.equal(report.retries, 1);
    assert((report.actions ?? []).includes("restart-worker"));
  } finally {
    await rm(runtimeDir, { recursive: true, force: true });
  }
});

test("dod check emits machine-readable pass/fail status", async () => {
  const runtimeDir = join(PROJECT_ROOT, "runtime", `zzzz-triplet-dod-${Date.now()}`);
  const dodPath = join(runtimeDir, "evidence", "dod-status.json");
  await mkdir(join(runtimeDir, "evidence"), { recursive: true });
  await writeFile(
    join(runtimeDir, "goal-state.json"),
    `${JSON.stringify(
      {
        goalId: "triplet-goal",
        definitionOfDone: [],
        phases: [{ id: "phase-1", status: "done" }],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    join(runtimeDir, "evidence", "latest.json"),
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        itemId: "triplet",
        completed: "baseline",
        filesChanged: ["scripts/dod-check.ts"],
        verification: "test",
        visibleMarker: "runtime/evidence/latest.json",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    join(runtimeDir, "evidence", "product-dod.json"),
    `${JSON.stringify(
      {
        fullChinese: true,
        nonTechnicalCopy: true,
        middleSchoolReadable: true,
        globalVisibility: true,
        appleNativeUI: false,
        realSubscriptionConnected: false,
        tiApproval: false,
        notes: "triplet fixture",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    join(runtimeDir, "evidence", "worker-progress.json"),
    `${JSON.stringify(
      {
        cycle: 1,
        lastStep: {
          id: "build",
          exitCode: 1,
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  try {
    const failed = await runNodeScript(["scripts/dod-check.ts", runtimeDir], process.env);
    assert.equal(failed.code, 1);
    const failStatus = JSON.parse(await readFile(dodPath, "utf8")) as {
      passed?: boolean;
      checks?: Array<{ id?: string; passed?: boolean }>;
    };
    assert.equal(failStatus.passed, false);
    assert.equal(failStatus.checks?.find((check) => check.id === "worker-last-step")?.passed, false);

    await writeFile(
      join(runtimeDir, "evidence", "worker-progress.json"),
      `${JSON.stringify(
        {
          cycle: 2,
          lastStep: {
            id: "build",
            exitCode: 0,
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const stillFailed = await runNodeScript(["scripts/dod-check.ts", runtimeDir], process.env);
    assert.equal(stillFailed.code, 1);
    const productGateStatus = JSON.parse(await readFile(dodPath, "utf8")) as {
      passed?: boolean;
      checks?: Array<{ id?: string; passed?: boolean }>;
    };
    assert.equal(productGateStatus.passed, false);
    assert.equal(productGateStatus.checks?.find((check) => check.id === "product-apple-native-ui")?.passed, false);
    assert.equal(
      productGateStatus.checks?.find((check) => check.id === "product-real-subscription-connected")?.passed,
      false,
    );

    await writeFile(
      join(runtimeDir, "evidence", "product-dod.json"),
      `${JSON.stringify(
        {
          fullChinese: true,
          nonTechnicalCopy: true,
          middleSchoolReadable: true,
          globalVisibility: true,
          appleNativeUI: true,
          realSubscriptionConnected: true,
          tiApproval: false,
          notes: "triplet fixture",
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await writeFile(
      join(runtimeDir, "subscription-snapshot.json"),
      `${JSON.stringify(
        {
          planLabel: "Provider Pro",
          consumed: 120,
          remaining: 880,
          limit: 1000,
          unit: "USD",
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const passed = await runNodeScript(["scripts/dod-check.ts", runtimeDir], process.env);
    assert.equal(passed.code, 0, `dod pass failed\nstdout:\n${passed.stdout}\nstderr:\n${passed.stderr}`);
    const passStatus = JSON.parse(await readFile(dodPath, "utf8")) as { passed?: boolean };
    assert.equal(passStatus.passed, true);
  } finally {
    await rm(runtimeDir, { recursive: true, force: true });
  }
});

async function runNodeScript(
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, ["--import", "tsx", ...args.map((value) => resolve(PROJECT_ROOT, value))], {
      cwd: PROJECT_ROOT,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      resolvePromise({ code, stdout, stderr });
    });
  });
}
