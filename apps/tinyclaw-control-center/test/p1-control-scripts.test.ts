import assert from "node:assert/strict";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

const PROJECT_ROOT = process.cwd();

test("periodic snapshot writes timestamped health/evidence artifacts and latest pointers", async () => {
  const runtimeDir = join(PROJECT_ROOT, "runtime", `zzzz-p1-periodic-${Date.now()}`);
  const evidenceDir = join(runtimeDir, "evidence");
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(
    join(evidenceDir, "latest.json"),
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        itemId: "P1-2",
        completed: "Periodic snapshot baseline",
        filesChanged: ["scripts/periodic-snapshot.ts"],
        verification: "test",
        visibleMarker: "runtime/evidence/latest.json",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  try {
    const run = await runNodeScript(["scripts/periodic-snapshot.ts", runtimeDir], process.env);
    assert.equal(run.code, 0, `periodic snapshot failed\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}`);

    const healthPointer = JSON.parse(await readFile(join(runtimeDir, "health", "latest.pointer.json"), "utf8")) as {
      latest: string;
    };
    const evidencePointer = JSON.parse(
      await readFile(join(runtimeDir, "evidence", "latest.pointer.json"), "utf8"),
    ) as {
      latest: string;
    };

    await stat(join(runtimeDir, "health", "latest.json"));
    await stat(healthPointer.latest);
    await stat(evidencePointer.latest);
  } finally {
    await rm(runtimeDir, { recursive: true, force: true });
  }
});

test("evidence reporter blocks outbound payload when evidence is incomplete", async () => {
  const tempDir = join(PROJECT_ROOT, "runtime", `zzzz-p1-reporter-${Date.now()}`);
  const evidencePath = join(tempDir, "evidence.json");
  const outboundDir = join(tempDir, "outbound");
  await mkdir(tempDir, { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify({ itemId: "P1-3" }, null, 2)}\n`, "utf8");

  try {
    const blocked = await runNodeScript(["scripts/evidence-reporter.ts", evidencePath, outboundDir], process.env);
    assert.equal(blocked.code, 1);
    assert(blocked.stderr.includes("REPORT_BLOCKED_EVIDENCE"));

    await writeFile(
      evidencePath,
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          itemId: "P1-3",
          completed: "Evidence-only reporter wiring",
          filesChanged: ["scripts/evidence-reporter.ts", "test/p1-control-scripts.test.ts"],
          verification: "reporter test",
          visibleMarker: "runtime/evidence/outbound/latest.json",
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const ok = await runNodeScript(["scripts/evidence-reporter.ts", evidencePath, outboundDir], process.env);
    assert.equal(ok.code, 0, `evidence reporter failed\nstdout:\n${ok.stdout}\nstderr:\n${ok.stderr}`);
    await stat(join(outboundDir, "latest.json"));
    const payload = JSON.parse(await readFile(join(outboundDir, "latest.json"), "utf8")) as {
      progress?: { itemId?: string };
    };
    assert.equal(payload.progress?.itemId, "P1-3");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("watchdog orchestrator fails on lock ownership conflict", async () => {
  const tempDir = join(PROJECT_ROOT, "runtime", `zzzz-p1-watchdog-conflict-${Date.now()}`);
  const lockPath = join(tempDir, "run.lock");
  const evidencePath = join(tempDir, "evidence.json");
  const recoveryPath = join(tempDir, "recovery.json");
  const reportPath = join(tempDir, "watchdog.json");
  await mkdir(tempDir, { recursive: true });
  await writeFile(
    evidencePath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        itemId: "P1-3",
        completed: "ready",
        filesChanged: ["x"],
        verification: "ok",
        visibleMarker: "ok",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
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
    const run = await runNodeScript(
      ["scripts/watchdog-orchestrator.ts", lockPath, evidencePath, recoveryPath, reportPath],
      {
        ...process.env,
        RUN_OWNER: "pandas-owner",
        STALL_EVIDENCE_MAX_AGE_MS: "31536000000",
        STALL_LOCK_MAX_AGE_MS: "31536000000",
      },
    );
    assert.equal(run.code, 1);
    assert(run.stderr.includes("WATCHDOG_LOCK_CONFLICT"));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("watchdog orchestrator renews owner lock and runs heal chain", async () => {
  const tempDir = join(PROJECT_ROOT, "runtime", `zzzz-p1-watchdog-ok-${Date.now()}`);
  const lockPath = join(tempDir, "run.lock");
  const evidencePath = join(tempDir, "evidence.json");
  const recoveryPath = join(tempDir, "recovery.json");
  const reportPath = join(tempDir, "watchdog.json");
  await mkdir(tempDir, { recursive: true });
  await writeFile(
    evidencePath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        itemId: "P1-3",
        completed: "ready",
        filesChanged: ["x"],
        verification: "ok",
        visibleMarker: "ok",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    lockPath,
    `${JSON.stringify(
      {
        runId: "lock-2",
        owner: "pandas-owner",
        startedAt: new Date(Date.now() - 60_000).toISOString(),
        updatedAt: new Date().toISOString(),
        leaseUntil: new Date(Date.now() + 10 * 60_000).toISOString(),
        fencingToken: 7,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  try {
    const run = await runNodeScript(
      ["scripts/watchdog-orchestrator.ts", lockPath, evidencePath, recoveryPath, reportPath],
      {
        ...process.env,
        RUN_OWNER: "pandas-owner",
        STALL_EVIDENCE_MAX_AGE_MS: "31536000000",
        STALL_LOCK_MAX_AGE_MS: "31536000000",
      },
    );
    assert.equal(run.code, 0, `watchdog failed\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}`);
    assert(run.stdout.includes("WATCHDOG_OK"));

    const report = JSON.parse(await readFile(reportPath, "utf8")) as {
      outcome?: string;
      lockAction?: string;
    };
    assert.equal(report.outcome, "healthy");
    assert.equal(report.lockAction, "renew");

    const lock = JSON.parse(await readFile(lockPath, "utf8")) as { owner?: string };
    assert.equal(lock.owner, "pandas-owner");
    await stat(recoveryPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
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
