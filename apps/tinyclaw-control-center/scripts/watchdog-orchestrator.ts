import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";

interface RunLock {
  runId: string;
  owner: string;
  startedAt: string;
  updatedAt: string;
  leaseUntil: string;
  fencingToken: number;
  pid?: number;
}

interface RecoveryReport {
  generatedAt: string;
  status: "healthy" | "stalled" | "healed" | "failed";
  reason: string;
  thresholds: {
    evidenceMaxAgeMs: number;
    lockMaxAgeMs: number;
  };
  observed: {
    evidenceAgeMs?: number;
    lockAgeMs?: number;
  };
  actions: string[];
}

interface DoDStatus {
  status?: "DONE" | "NOT_DONE";
  passed?: boolean;
}

interface WorkerHeartbeat {
  pid?: number;
}

function isExpired(lock: RunLock, nowMs = Date.now()): boolean {
  const expiry = Date.parse(lock.leaseUntil);
  if (Number.isNaN(expiry)) return true;
  return expiry <= nowMs;
}

function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "EPERM") return true;
    return false;
  }
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function readLock(path: string): Promise<RunLock | null> {
  return await readJson<RunLock>(path);
}

async function runNodeScript(
  scriptPath: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, ["--import", "tsx", scriptPath, ...args], {
      cwd: process.cwd(),
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
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
  });
}

async function readRecovery(path: string): Promise<RecoveryReport | null> {
  return await readJson<RecoveryReport>(path);
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmp, path);
}

async function inspectWorker(runtimeDir: string): Promise<{ active: boolean; detail: string }> {
  const heartbeatPath = resolve(runtimeDir, "health", "worker-heartbeat.json");
  const hb = await readJson<WorkerHeartbeat>(heartbeatPath);
  const active = hb?.pid !== undefined && isPidAlive(hb.pid);
  if (active) {
    return { active: true, detail: `worker-alive pid=${hb?.pid}` };
  }
  return { active: false, detail: "worker-not-alive" };
}

async function main(): Promise<void> {
  const runtimeDir = resolve(process.cwd(), "runtime");
  const owner = process.env.RUN_OWNER ?? "pandas-main";
  const lockPath = resolve(process.argv[2] ?? join(runtimeDir, "run.lock"));
  const evidencePath = resolve(process.argv[3] ?? join(runtimeDir, "evidence", "latest.json"));
  const recoveryPath = resolve(process.argv[4] ?? join(runtimeDir, "recovery", "latest.json"));
  const reportPath = resolve(process.argv[5] ?? join(dirname(recoveryPath), "watchdog-latest.json"));
  const dodStatusPath = resolve(runtimeDir, "evidence", "dod-status.json");

  const lockBefore = await readLock(lockPath);
  const lockExpired = lockBefore ? isExpired(lockBefore) : true;

  const actions: string[] = [];
  let lockAction = "none";

  if (lockBefore && !lockExpired && lockBefore.owner !== owner) {
    console.error(
      `WATCHDOG_LOCK_CONFLICT expected=${owner} current=${lockBefore.owner} leaseUntil=${lockBefore.leaseUntil}`,
    );
    process.exit(1);
  }

  const runLockScript = resolve(process.cwd(), "scripts", "run-lock.ts");
  if (!lockBefore || lockExpired) {
    lockAction = "acquire";
    const acquire = await runNodeScript(runLockScript, ["acquire", lockPath], {
      ...process.env,
      RUN_OWNER: owner,
    });
    if (acquire.code !== 0) {
      console.error(`WATCHDOG_LOCK_ACQUIRE_FAILED ${acquire.stderr.trim() || acquire.stdout.trim()}`);
      process.exit(1);
    }
    actions.push("lock-acquire");
  } else {
    lockAction = "renew";
    const renew = await runNodeScript(runLockScript, ["renew", lockPath], {
      ...process.env,
      RUN_OWNER: owner,
    });
    if (renew.code !== 0) {
      console.error(`WATCHDOG_LOCK_RENEW_FAILED ${renew.stderr.trim() || renew.stdout.trim()}`);
      process.exit(1);
    }
    actions.push("lock-renew");
  }

  const healScript = resolve(process.cwd(), "scripts", "stall-auto-heal.ts");
  const heal = await runNodeScript(healScript, [evidencePath, lockPath, recoveryPath], {
    ...process.env,
    RUN_OWNER: owner,
  });
  if (heal.code !== 0) {
    console.error(`WATCHDOG_HEAL_FAILED ${heal.stderr.trim() || heal.stdout.trim()}`);
    process.exit(1);
  }
  actions.push("heal-check");

  const dod = await readJson<DoDStatus>(dodStatusPath);
  const isNotDone = dod?.status === "NOT_DONE" || dod?.passed === false || dod == null;
  if (isNotDone) {
    const worker = await inspectWorker(runtimeDir);
    actions.push(worker.detail);
    // Single starter rule: watchdog never starts worker directly.
    // Supervisor is the only component allowed to (re)start resident worker.
    if (!worker.active) {
      actions.push("restart-delegated-to-supervisor");
    }
  } else {
    actions.push("dod-done");
  }

  const lockAfter = await readLock(lockPath);
  const recovery = await readRecovery(recoveryPath);
  const outcome =
    recovery?.status === "healed" ? "healed" : recovery?.status === "failed" ? "failed" : "healthy";

  const report = {
    generatedAt: new Date().toISOString(),
    owner,
    lockPath,
    lockAction,
    lock: lockAfter,
    evidencePath,
    recoveryPath,
    recovery,
    dodStatus: dod?.status ?? "UNKNOWN",
    outcome,
    actions,
  };
  await writeJsonAtomic(reportPath, report);

  if (outcome === "failed") {
    console.error(`WATCHDOG_FAILED report=${reportPath}`);
    process.exit(1);
  }

  console.log(`WATCHDOG_OK outcome=${outcome} action=${lockAction} report=${reportPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
