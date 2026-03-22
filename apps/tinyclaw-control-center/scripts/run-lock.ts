import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

interface RunLock {
  runId: string;
  owner: string;
  startedAt: string;
  updatedAt: string;
  leaseUntil: string;
  fencingToken: number;
  pid?: number;
}

const runtimeDir = resolve(process.cwd(), "runtime");
const lockPath = resolve(process.argv[3] ?? join(runtimeDir, "run.lock"));
const cmd = (process.argv[2] ?? "status").toLowerCase();
const owner = process.env.RUN_OWNER || "pandas-main";
const leaseMs = Number(process.env.RUN_LEASE_MS ?? 10 * 60 * 1000);

async function readLock(path: string): Promise<RunLock | null> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as RunLock;
  } catch {
    return null;
  }
}

function isExpired(lock: RunLock, now = Date.now()): boolean {
  const expiry = Date.parse(lock.leaseUntil);
  if (Number.isNaN(expiry)) return true;
  return expiry <= now;
}

async function writeLock(path: string, lock: RunLock): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
  await rename(tmp, path);
}

async function acquire(path: string): Promise<number> {
  const now = Date.now();
  const current = await readLock(path);

  if (current && !isExpired(current, now)) {
    console.error(`LOCKED runId=${current.runId} owner=${current.owner} leaseUntil=${current.leaseUntil}`);
    return 1;
  }

  const nextToken = (current?.fencingToken ?? 0) + 1;
  const runId = randomUUID();
  const lock: RunLock = {
    runId,
    owner,
    startedAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    leaseUntil: new Date(now + leaseMs).toISOString(),
    fencingToken: nextToken,
    pid: process.pid,
  };

  await writeLock(path, lock);
  console.log(`ACQUIRED runId=${lock.runId} fencingToken=${lock.fencingToken} leaseUntil=${lock.leaseUntil}`);
  return 0;
}

async function renew(path: string): Promise<number> {
  const now = Date.now();
  const lock = await readLock(path);
  if (!lock) {
    console.error("MISSING_LOCK");
    return 1;
  }
  if (isExpired(lock, now)) {
    console.error(`EXPIRED runId=${lock.runId}`);
    return 1;
  }
  if (lock.owner !== owner) {
    console.error(`NOT_OWNER expected=${owner} current=${lock.owner}`);
    return 1;
  }

  const next: RunLock = {
    ...lock,
    updatedAt: new Date(now).toISOString(),
    leaseUntil: new Date(now + leaseMs).toISOString(),
    pid: process.pid,
  };
  await writeLock(path, next);
  console.log(`RENEWED runId=${next.runId} leaseUntil=${next.leaseUntil}`);
  return 0;
}

async function release(path: string): Promise<number> {
  const lock = await readLock(path);
  if (!lock) {
    console.log("RELEASED noop=no-lock");
    return 0;
  }
  if (lock.owner !== owner && !isExpired(lock)) {
    console.error(`NOT_OWNER expected=${owner} current=${lock.owner}`);
    return 1;
  }
  await rm(path, { force: true });
  console.log(`RELEASED runId=${lock.runId}`);
  return 0;
}

async function status(path: string): Promise<number> {
  const lock = await readLock(path);
  if (!lock) {
    console.log("STATUS unlocked");
    return 0;
  }
  const expired = isExpired(lock);
  console.log(`STATUS ${expired ? "expired" : "locked"} runId=${lock.runId} owner=${lock.owner} leaseUntil=${lock.leaseUntil} fencingToken=${lock.fencingToken}`);
  return expired ? 2 : 0;
}

async function main(): Promise<void> {
  // quick sanity: parent runtime dir should be writable once
  await mkdir(dirname(lockPath), { recursive: true });
  try {
    await stat(dirname(lockPath));
  } catch {
    // ignore
  }

  let code = 0;
  if (cmd === "acquire") code = await acquire(lockPath);
  else if (cmd === "renew") code = await renew(lockPath);
  else if (cmd === "release") code = await release(lockPath);
  else code = await status(lockPath);

  process.exit(code);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
