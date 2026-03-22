import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

interface RunLock {
  runId: string;
  owner: string;
  leaseUntil: string;
}

interface WorkerProgressArtifact {
  generatedAt: string;
  runId: string;
  owner: string;
  cycle: number;
  state: "running" | "waiting" | "done";
  lastStep: {
    id: string;
    command: string;
    startedAt: string;
    finishedAt: string;
    exitCode: number | null;
    stdoutTail: string;
    stderrTail: string;
  };
  dod: {
    passed: boolean;
    statusPath: string;
  };
}

interface WorkerHeartbeatArtifact {
  generatedAt: string;
  runId: string;
  owner: string;
  pid: number;
  cycle: number;
  state: "running" | "waiting" | "done";
  stepId: string;
  stepExitCode: number | null;
  dodPassed: boolean;
}

function getNpmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function parseSteps(raw: string): string[] {
  const steps = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return steps.length > 0 ? steps : ["goal-gate"];
}

function getStepCommand(
  stepId: string,
  runtimeDir: string,
): { command: string; args: string[]; label: string } {
  const npm = getNpmCommand();
  if (stepId === "build") return { command: npm, args: ["run", "build"], label: "npm run build" };
  if (stepId === "test") return { command: npm, args: ["test"], label: "npm test" };
  if (stepId === "evidence-report") {
    return { command: npm, args: ["run", "evidence:report"], label: "npm run evidence:report" };
  }
  if (stepId === "goal-gate") {
    return {
      command: process.execPath,
      args: ["--import", "tsx", resolve(process.cwd(), "scripts", "goal-gate.ts"), resolve(runtimeDir, "goal-state.json")],
      label: "goal-gate",
    };
  }
  if (stepId === "evidence-validate") {
    return {
      command: process.execPath,
      args: [
        "--import",
        "tsx",
        resolve(process.cwd(), "scripts", "evidence-gate.ts"),
        "validate",
        resolve(runtimeDir, "evidence", "latest.json"),
      ],
      label: "evidence-validate",
    };
  }
  if (stepId === "health-snapshot") {
    return {
      command: process.execPath,
      args: ["--import", "tsx", resolve(process.cwd(), "scripts", "health-snapshot.ts")],
      label: "health-snapshot",
    };
  }
  if (stepId === "codex-patch") {
    const prompt = process.env.WORKER_CODE_PROMPT ??
      "Improve Mission Control product DoD gaps: full Chinese coverage, non-technical copy, middle-school readability, and global visibility for cron/heartbeat/current tasks/tool calls. Make minimal safe code changes.";
    return {
      command: "codex",
      args: ["exec", "--full-auto", prompt],
      label: "codex exec --full-auto",
    };
  }
  throw new Error(`unknown worker step: ${stepId}`);
}

function tail(value: string, maxChars = 2000): string {
  if (value.length <= maxChars) return value;
  return value.slice(value.length - maxChars);
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmp, path);
}

async function runCommand(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
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

async function readLock(path: string): Promise<RunLock | null> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as RunLock;
  } catch {
    return null;
  }
}

function isExpired(lock: RunLock): boolean {
  const expiry = Date.parse(lock.leaseUntil);
  if (Number.isNaN(expiry)) return true;
  return expiry <= Date.now();
}

async function runLockCommand(action: "acquire" | "renew" | "release", lockPath: string, owner: string): Promise<void> {
  const result = await runCommand(
    process.execPath,
    ["--import", "tsx", resolve(process.cwd(), "scripts", "run-lock.ts"), action, lockPath],
    { ...process.env, RUN_OWNER: owner },
  );
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `run-lock ${action} failed`);
  }
}

async function ensureOwnedLock(lockPath: string, owner: string): Promise<void> {
  const existing = await readLock(lockPath);
  if (existing && !isExpired(existing) && existing.owner !== owner) {
    throw new Error(`WORKER_LOCK_CONFLICT expected=${owner} current=${existing.owner} leaseUntil=${existing.leaseUntil}`);
  }
  if (!existing || isExpired(existing)) {
    await runLockCommand("acquire", lockPath, owner);
    return;
  }
  await runLockCommand("renew", lockPath, owner);
}

async function runDoDCheck(runtimeDir: string, statusPath: string): Promise<boolean> {
  const result = await runCommand(process.execPath, [
    "--import",
    "tsx",
    resolve(process.cwd(), "scripts", "dod-check.ts"),
    runtimeDir,
    statusPath,
  ]);
  return result.code === 0;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

async function main(): Promise<void> {
  const runtimeDir = resolve(process.argv[2] ?? join(process.cwd(), "runtime"));
  const owner = process.env.RUN_OWNER ?? "pandas-main";
  const steps = parseSteps(process.env.WORKER_STEPS ?? "codex-patch,test,evidence-report,health-snapshot");
  const intervalMs = Number(process.env.WORKER_INTERVAL_MS ?? 15_000);
  const maxCycles = Number(process.env.WORKER_MAX_CYCLES ?? 0);

  const lockPath = resolve(runtimeDir, "run.lock");
  const heartbeatPath = resolve(runtimeDir, "health", "worker-heartbeat.json");
  const progressPath = resolve(runtimeDir, "evidence", "worker-progress.json");
  const dodStatusPath = resolve(runtimeDir, "evidence", "dod-status.json");
  const runId = randomUUID();

  let cycle = 0;
  try {
    await ensureOwnedLock(lockPath, owner);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  while (true) {
    cycle += 1;
    const stepId = steps[(cycle - 1) % steps.length];
    const step = getStepCommand(stepId, runtimeDir);
    const stepStartedAt = new Date().toISOString();

    const runningHeartbeat: WorkerHeartbeatArtifact = {
      generatedAt: new Date().toISOString(),
      runId,
      owner,
      pid: process.pid,
      cycle,
      state: "running",
      stepId,
      stepExitCode: null,
      dodPassed: false,
    };
    await writeJsonAtomic(heartbeatPath, runningHeartbeat);

    let stepResult: { code: number | null; stdout: string; stderr: string };
    try {
      stepResult = await runCommand(step.command, step.args);
    } catch (error) {
      stepResult = { code: 1, stdout: "", stderr: error instanceof Error ? error.message : String(error) };
    }
    const stepFinishedAt = new Date().toISOString();

    try {
      await ensureOwnedLock(lockPath, owner);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }

    const interimProgress: WorkerProgressArtifact = {
      generatedAt: new Date().toISOString(),
      runId,
      owner,
      cycle,
      state: "waiting",
      lastStep: {
        id: stepId,
        command: step.label,
        startedAt: stepStartedAt,
        finishedAt: stepFinishedAt,
        exitCode: stepResult.code,
        stdoutTail: tail(stepResult.stdout),
        stderrTail: tail(stepResult.stderr),
      },
      dod: {
        passed: false,
        statusPath: dodStatusPath,
      },
    };

    await writeJsonAtomic(progressPath, interimProgress);

    const dodPassed = await runDoDCheck(runtimeDir, dodStatusPath);
    const state: WorkerProgressArtifact["state"] = dodPassed ? "done" : "waiting";
    const progress: WorkerProgressArtifact = {
      ...interimProgress,
      generatedAt: new Date().toISOString(),
      state,
      dod: {
        passed: dodPassed,
        statusPath: dodStatusPath,
      },
    };

    const heartbeat: WorkerHeartbeatArtifact = {
      generatedAt: new Date().toISOString(),
      runId,
      owner,
      pid: process.pid,
      cycle,
      state,
      stepId,
      stepExitCode: stepResult.code,
      dodPassed,
    };

    await writeJsonAtomic(progressPath, progress);
    await writeJsonAtomic(heartbeatPath, heartbeat);

    if (dodPassed) {
      await runLockCommand("release", lockPath, owner).catch(() => {
        // Keep done outcome even if release fails; lock lease expiry is still a safe fallback.
      });
      console.log(`WORKER_DONE cycles=${cycle} dodStatus=${dodStatusPath}`);
      process.exit(0);
    }

    if (maxCycles > 0 && cycle >= maxCycles) {
      console.error(`WORKER_MAX_CYCLES_REACHED cycles=${cycle}`);
      process.exit(1);
    }

    await sleep(intervalMs);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
