import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";

interface RunLock {
  owner: string;
  leaseUntil: string;
}

interface WorkerHeartbeat {
  generatedAt: string;
  pid?: number;
  state?: string;
}

interface SupervisorReport {
  generatedAt: string;
  status: "healthy" | "restarted" | "failed" | "done";
  reason: string;
  retries: number;
  maxRetries: number;
  observed: {
    heartbeatAgeMs?: number;
    heartbeatState?: string;
    workerPid?: number;
    workerDead?: boolean;
  };
  actions: string[];
}

function isExpired(lock: RunLock): boolean {
  const expiry = Date.parse(lock.leaseUntil);
  if (Number.isNaN(expiry)) return true;
  return expiry <= Date.now();
}

async function readLock(path: string): Promise<RunLock | null> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as RunLock;
  } catch {
    return null;
  }
}

async function readHeartbeat(path: string): Promise<WorkerHeartbeat | null> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as WorkerHeartbeat;
  } catch {
    return null;
  }
}

async function ageMs(path: string): Promise<number | undefined> {
  try {
    const fileStat = await stat(path);
    return Math.max(0, Date.now() - fileStat.mtimeMs);
  } catch {
    return undefined;
  }
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

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmp, path);
}

async function appendAudit(path: string, line: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  let existing = "";
  try {
    existing = await readFile(path, "utf8");
  } catch {
    existing = "";
  }
  await writeFile(path, `${existing}${line}\n`, "utf8");
}

async function runNodeScript(
  scriptPath: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
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

async function runLockCommand(action: "acquire" | "renew" | "release", lockPath: string, owner: string): Promise<void> {
  const result = await runNodeScript(resolve(process.cwd(), "scripts", "run-lock.ts"), [action, lockPath], {
    ...process.env,
    RUN_OWNER: owner,
  });
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `run-lock ${action} failed`);
  }
}

async function runDoDCheck(runtimeDir: string, statusPath: string): Promise<boolean> {
  const result = await runNodeScript(resolve(process.cwd(), "scripts", "dod-check.ts"), [runtimeDir, statusPath]);
  return result.code === 0;
}

async function startWorker(
  workerEntry: string,
  runtimeDir: string,
  mode: "detached" | "sync",
): Promise<{ ok: boolean; detail: string }> {
  if (mode === "sync") {
    const run = await runNodeScript(resolve(workerEntry), [runtimeDir], process.env);
    if (run.code !== 0) {
      const combined = `${run.stdout}\n${run.stderr}`;
      if (combined.includes("WORKER_MAX_CYCLES_REACHED")) {
        return { ok: true, detail: "worker restarted (sync bounded cycles)" };
      }
      return { ok: false, detail: run.stderr.trim() || run.stdout.trim() || "worker restart failed" };
    }
    return { ok: true, detail: "worker restarted (sync)" };
  }

  return await new Promise((resolvePromise) => {
    const child = spawn(process.execPath, ["--import", "tsx", resolve(workerEntry), runtimeDir], {
      cwd: process.cwd(),
      env: process.env,
      detached: true,
      stdio: "ignore",
    });
    child.on("error", (error) => {
      resolvePromise({ ok: false, detail: error instanceof Error ? error.message : String(error) });
    });
    child.unref();
    resolvePromise({ ok: true, detail: "worker restarted (detached)" });
  });
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

async function main(): Promise<void> {
  const runtimeDir = resolve(process.argv[2] ?? join(process.cwd(), "runtime"));
  const owner = process.env.RUN_OWNER ?? "pandas-main";
  const once = (process.env.SUPERVISOR_ONCE ?? "false").toLowerCase() === "true";
  const pollMs = Number(process.env.SUPERVISOR_POLL_MS ?? 15_000);
  const maxRetries = Number(process.env.SUPERVISOR_MAX_RESTARTS ?? 3);
  const heartbeatMaxAgeMs = Number(process.env.SUPERVISOR_HEARTBEAT_MAX_AGE_MS ?? 120_000);
  const restartMode = (process.env.SUPERVISOR_RESTART_MODE ?? "detached") === "sync" ? "sync" : "detached";
  const workerEntry = resolve(process.env.SUPERVISOR_WORKER_ENTRY ?? join(process.cwd(), "scripts", "resident-worker.ts"));

  const lockPath = resolve(runtimeDir, "run.lock");
  const heartbeatPath = resolve(runtimeDir, "health", "worker-heartbeat.json");
  const dodStatusPath = resolve(runtimeDir, "evidence", "dod-status.json");
  const supervisorLockPath = resolve(runtimeDir, "health", "supervisor-lock.json");

  const existingSupervisor = await readHeartbeat(supervisorLockPath);
  const existingPid = existingSupervisor?.pid;
  if (existingPid && existingPid !== process.pid && isPidAlive(existingPid)) {
    console.log(`SUPERVISOR_ALREADY_RUNNING pid=${existingPid}`);
    process.exit(0);
  }
  await writeJsonAtomic(supervisorLockPath, {
    generatedAt: new Date().toISOString(),
    pid: process.pid,
    state: "running",
  });
  const reportPath = resolve(runtimeDir, "recovery", "supervisor-latest.json");
  const auditPath = resolve(runtimeDir, "recovery", "supervisor-audit.log");

  let retries = 0;

  while (true) {
    const actions: string[] = [];
    const heartbeat = await readHeartbeat(heartbeatPath);
    const heartbeatAgeMs = await ageMs(heartbeatPath);
    const workerPid = heartbeat?.pid;
    const workerDead = workerPid !== undefined ? !isPidAlive(workerPid) : false;
    const stale = heartbeatAgeMs === undefined || heartbeatAgeMs > heartbeatMaxAgeMs;
    const dead = workerDead;

    let status: SupervisorReport["status"] = "healthy";
    let reason = stale ? "worker-heartbeat-stale" : "worker-healthy";

    if (heartbeat?.state === "done") {
      const dodPassed = await runDoDCheck(runtimeDir, dodStatusPath);
      actions.push(`dod-check-${dodPassed ? "pass" : "fail"}`);
      if (dodPassed) {
        status = "done";
        reason = "dod-pass";
      } else {
        reason = "worker-done-but-dod-failed";
      }
    }

    if (status !== "done" && (stale || dead)) {
      if (retries >= maxRetries) {
        status = "failed";
        reason = "max-retries-exhausted";
        actions.push("restart-skipped-max-retries");
      } else {
        const lock = await readLock(lockPath);
        if (lock && !isExpired(lock) && lock.owner !== owner) {
          status = "failed";
          reason = `lock-conflict owner=${lock.owner}`;
          actions.push("restart-blocked-lock-conflict");
        } else {
          if (lock && !isExpired(lock) && lock.owner === owner) {
            await runLockCommand("release", lockPath, owner).catch(() => {
              // best-effort release before restart
            });
            actions.push("released-existing-owner-lock");
          }
          await runLockCommand("acquire", lockPath, owner).catch(() => {
            // worker can also acquire after restart; keep attempting restart.
          });
          actions.push("acquired-supervisor-lock");

          const started = await startWorker(workerEntry, runtimeDir, restartMode);
          if (!started.ok) {
            retries += 1;
            status = retries >= maxRetries ? "failed" : "healthy";
            reason = `restart-failed: ${started.detail}`;
            actions.push("restart-worker-failed");
          } else {
            retries += 1;
            status = "restarted";
            reason = stale && dead ? "worker-stale-and-dead" : stale ? "worker-stale" : "worker-dead";
            actions.push("restart-worker");
          }
        }
      }
    }

    const report: SupervisorReport = {
      generatedAt: new Date().toISOString(),
      status,
      reason,
      retries,
      maxRetries,
      observed: {
        heartbeatAgeMs,
        heartbeatState: heartbeat?.state,
        workerPid,
        workerDead,
      },
      actions,
    };

    await writeJsonAtomic(reportPath, report);
    await appendAudit(
      auditPath,
      `${report.generatedAt} | ${status} | ${reason} | retries=${retries}/${maxRetries} | actions=${actions.join(",") || "none"}`,
    );

    if (status === "failed") {
      console.error(`SUPERVISOR_FAILED report=${reportPath}`);
      process.exit(1);
    }
    if (status === "done") {
      console.log(`SUPERVISOR_DONE report=${reportPath}`);
      process.exit(0);
    }
    if (once) {
      console.log(`SUPERVISOR_ONCE status=${status} report=${reportPath}`);
      process.exit(0);
    }

    await sleep(pollMs);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
