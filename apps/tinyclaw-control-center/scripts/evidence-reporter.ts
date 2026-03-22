import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";

interface EvidenceBundle {
  generatedAt: string;
  itemId: string;
  completed: string;
  filesChanged: string[];
  verification: string;
  visibleMarker: string;
}

interface OutboundProgressPayload {
  reportedAt: string;
  evidencePath: string;
  progress: {
    itemId: string;
    completed: string;
    filesChanged: string[];
    verification: string;
    visibleMarker: string;
  };
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

function isCompletionLike(text: string): boolean {
  return /(\bdone\b|\bcompleted\b|完成|已完成|全部完成)/i.test(text);
}

function isFullPassLike(text: string): boolean {
  return /(\bfull\s+pass\b|\ball\s+checks?\s+pass(?:ed)?\b|全部通过|全通过|全量通过|全面通过)/i.test(text);
}

async function runNodeScript(scriptPath: string, args: string[]): Promise<number | null> {
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, ["--import", "tsx", scriptPath, ...args], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "ignore",
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => resolvePromise(code));
  });
}

function validateEvidenceBundle(bundle: Partial<EvidenceBundle>): string[] {
  const errors: string[] = [];
  if (!bundle.itemId || bundle.itemId.trim() === "") errors.push("missing itemId");
  if (!bundle.completed || bundle.completed.trim() === "") errors.push("missing completed");
  if (!Array.isArray(bundle.filesChanged) || bundle.filesChanged.length === 0) errors.push("missing filesChanged[]");
  if (!bundle.verification || bundle.verification.trim() === "") errors.push("missing verification");
  if (!bundle.visibleMarker || bundle.visibleMarker.trim() === "") errors.push("missing visibleMarker");
  return errors;
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmp, path);
}

async function main(): Promise<void> {
  const evidencePath = resolve(process.argv[2] ?? join(process.cwd(), "runtime", "evidence", "latest.json"));
  const outboundDir = resolve(process.argv[3] ?? join(process.cwd(), "runtime", "evidence", "outbound"));

  const raw = await readFile(evidencePath, "utf8");
  const evidence = JSON.parse(raw) as Partial<EvidenceBundle>;
  const errors = validateEvidenceBundle(evidence);
  if (errors.length > 0) {
    console.error(`REPORT_BLOCKED_EVIDENCE ${errors.join("; ")}`);
    process.exit(1);
  }

  const completionText = String(evidence.completed ?? "");
  const requireDodGate = (process.env.REQUIRE_DOD_FOR_COMPLETION ?? "true").toLowerCase() !== "false";
  const claimsCompletion = isCompletionLike(completionText) || isFullPassLike(completionText);
  if ((requireDodGate && claimsCompletion) || isFullPassLike(completionText)) {
    const runtimeDir = resolve(process.cwd(), "runtime");
    const dodCode = await runNodeScript(resolve(process.cwd(), "scripts", "dod-check.ts"), [runtimeDir]);
    if (dodCode !== 0) {
      console.error("REPORT_BLOCKED_DOD NOT_DONE");
      process.exit(1);
    }
  }

  const now = new Date();
  const snapshotId = buildSnapshotId(now);
  const snapshotPath = resolve(outboundDir, `${snapshotId}.json`);
  const latestPath = resolve(outboundDir, "latest.json");
  const pointerPath = resolve(outboundDir, "latest.pointer.json");
  const payload: OutboundProgressPayload = {
    reportedAt: now.toISOString(),
    evidencePath,
    progress: {
      itemId: evidence.itemId ?? "",
      completed: evidence.completed ?? "",
      filesChanged: evidence.filesChanged ?? [],
      verification: evidence.verification ?? "",
      visibleMarker: evidence.visibleMarker ?? "",
    },
  };

  await writeJsonAtomic(snapshotPath, payload);
  await writeJsonAtomic(latestPath, payload);
  await writeJsonAtomic(pointerPath, {
    updatedAt: now.toISOString(),
    snapshotId,
    latest: snapshotPath,
  });

  console.log(`REPORT_EMITTED latest=${latestPath} snapshot=${snapshotPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
