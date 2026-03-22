import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";

type HealStatus = "healthy" | "stalled" | "healed" | "failed";

interface HealReport {
  generatedAt: string;
  status: HealStatus;
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

const runtimeDir = resolve(process.cwd(), "runtime");
const evidencePath = resolve(process.argv[2] ?? join(runtimeDir, "evidence", "latest.json"));
const lockPath = resolve(process.argv[3] ?? join(runtimeDir, "run.lock"));
const reportPath = resolve(process.argv[4] ?? join(runtimeDir, "recovery", "latest.json"));
const auditPath = resolve(process.argv[5] ?? join(dirname(reportPath), "audit.log"));

const evidenceMaxAgeMs = Number(process.env.STALL_EVIDENCE_MAX_AGE_MS ?? 30 * 60 * 1000);
const lockMaxAgeMs = Number(process.env.STALL_LOCK_MAX_AGE_MS ?? 30 * 60 * 1000);
const owner = process.env.RUN_OWNER ?? "pandas-main";

async function mtimeAgeMs(path: string): Promise<number | undefined> {
  try {
    const s = await stat(path);
    return Date.now() - s.mtimeMs;
  } catch {
    return undefined;
  }
}

function runReleaseLock(): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const child = spawn("npm", ["run", "lock:release"], {
      cwd: process.cwd(),
      env: { ...process.env, RUN_OWNER: owner },
      stdio: "ignore",
    });
    child.on("exit", (code) => resolvePromise(code === 0));
  });
}

async function appendRecoveryAudit(line: string): Promise<void> {
  await mkdir(dirname(auditPath), { recursive: true });
  let old = "";
  try {
    old = await readFile(auditPath, "utf8");
  } catch {
    old = "";
  }
  await writeFile(auditPath, `${old}${line}\n`, "utf8");
}

async function main(): Promise<void> {
  const evidenceAgeMs = await mtimeAgeMs(evidencePath);
  const lockAgeMs = await mtimeAgeMs(lockPath);

  const stalledByEvidence = evidenceAgeMs === undefined || evidenceAgeMs > evidenceMaxAgeMs;
  const stalledByLock = lockAgeMs !== undefined && lockAgeMs > lockMaxAgeMs;

  const actions: string[] = [];
  let status: HealStatus = "healthy";
  let reason = "within-threshold";

  if (stalledByEvidence || stalledByLock) {
    status = "stalled";
    reason = `${stalledByEvidence ? "evidence-stale" : ""}${stalledByEvidence && stalledByLock ? "+" : ""}${stalledByLock ? "lock-stale" : ""}`;

    const released = await runReleaseLock();
    actions.push(released ? "release-lock-ok" : "release-lock-failed");

    if (released) {
      status = "healed";
      actions.push("restart-chain-required");
    } else {
      status = "failed";
    }
  }

  const report: HealReport = {
    generatedAt: new Date().toISOString(),
    status,
    reason,
    thresholds: { evidenceMaxAgeMs, lockMaxAgeMs },
    observed: { evidenceAgeMs, lockAgeMs },
    actions,
  };

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await appendRecoveryAudit(`${report.generatedAt} | ${report.status} | ${report.reason} | actions=${actions.join(",") || "none"}`);

  console.log(`AUTO_HEAL_${report.status.toUpperCase()} reason=${report.reason} actions=${actions.join(",") || "none"}`);
  process.exit(report.status === "failed" ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
