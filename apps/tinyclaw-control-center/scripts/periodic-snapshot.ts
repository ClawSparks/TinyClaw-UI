import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { buildHealthSnapshot } from "./health-snapshot";

interface SnapshotPointer {
  updatedAt: string;
  snapshotId: string;
  latest: string;
}

function buildSnapshotId(now = new Date()): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const min = String(now.getUTCMinutes()).padStart(2, "0");
  const sec = String(now.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${min}${sec}Z`;
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmp, path);
}

async function readJson<T>(path: string): Promise<T> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as T;
}

async function main(): Promise<void> {
  const runtimeDir = resolve(process.argv[2] ?? join(process.cwd(), "runtime"));
  const healthDir = resolve(runtimeDir, "health");
  const evidenceDir = resolve(runtimeDir, "evidence");
  const evidenceLatestPath = resolve(evidenceDir, "latest.json");

  const now = new Date();
  const snapshotId = buildSnapshotId(now);
  const healthSnapshotPath = resolve(healthDir, "snapshots", `${snapshotId}.json`);
  const evidenceSnapshotPath = resolve(evidenceDir, "snapshots", `${snapshotId}.json`);
  const healthLatestPath = resolve(healthDir, "latest.json");
  const healthPointerPath = resolve(healthDir, "latest.pointer.json");
  const evidencePointerPath = resolve(evidenceDir, "latest.pointer.json");

  const healthSnapshot = await buildHealthSnapshot(runtimeDir);
  const evidenceSnapshot = await readJson<Record<string, unknown>>(evidenceLatestPath);

  const healthPointer: SnapshotPointer = {
    updatedAt: now.toISOString(),
    snapshotId,
    latest: healthSnapshotPath,
  };
  const evidencePointer: SnapshotPointer & { sourceLatest: string } = {
    updatedAt: now.toISOString(),
    snapshotId,
    latest: evidenceSnapshotPath,
    sourceLatest: evidenceLatestPath,
  };

  await writeJsonAtomic(healthSnapshotPath, healthSnapshot);
  await writeJsonAtomic(evidenceSnapshotPath, evidenceSnapshot);
  await writeJsonAtomic(healthLatestPath, healthSnapshot);
  await writeJsonAtomic(healthPointerPath, healthPointer);
  await writeJsonAtomic(evidencePointerPath, evidencePointer);

  console.log(
    `PERIODIC_SNAPSHOT_OK id=${snapshotId} health=${healthSnapshotPath} evidence=${evidenceSnapshotPath}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
