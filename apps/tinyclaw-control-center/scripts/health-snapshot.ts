import { mkdir, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export interface HealthSnapshot {
  generatedAt: string;
  files: {
    lock: { path: string; ageMs: number | null };
    evidence: { path: string; ageMs: number | null };
    recovery: { path: string; ageMs: number | null };
  };
}

async function ageMs(path: string): Promise<number | null> {
  try {
    const s = await stat(path);
    return Math.max(0, Date.now() - s.mtimeMs);
  } catch {
    return null;
  }
}

export async function buildHealthSnapshot(runtimeDir = resolve(process.cwd(), "runtime")): Promise<HealthSnapshot> {
  return {
    generatedAt: new Date().toISOString(),
    files: {
      lock: {
        path: join(runtimeDir, "run.lock"),
        ageMs: await ageMs(join(runtimeDir, "run.lock")),
      },
      evidence: {
        path: join(runtimeDir, "evidence", "latest.json"),
        ageMs: await ageMs(join(runtimeDir, "evidence", "latest.json")),
      },
      recovery: {
        path: join(runtimeDir, "recovery", "latest.json"),
        ageMs: await ageMs(join(runtimeDir, "recovery", "latest.json")),
      },
    },
  };
}

async function main() {
  const runtime = resolve(process.cwd(), "runtime");
  const out = resolve(runtime, "health", "latest.json");
  const snapshot = await buildHealthSnapshot(runtime);
  await mkdir(resolve(runtime, "health"), { recursive: true });
  await writeFile(out, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
  console.log(`HEALTH_SNAPSHOT_WRITTEN ${out}`);
}

if ((process.argv[1] ?? "").endsWith("health-snapshot.ts")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
