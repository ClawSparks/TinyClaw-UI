import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export interface EvidenceBundle {
  generatedAt: string;
  itemId: string;
  completed: string;
  filesChanged: string[];
  verification: string;
  visibleMarker: string;
}

const cmd = (process.argv[2] ?? "validate").toLowerCase();
const targetPath = resolve(process.argv[3] ?? join(process.cwd(), "runtime", "evidence", "latest.json"));

export function validateBundle(bundle: Partial<EvidenceBundle>): string[] {
  const errors: string[] = [];
  if (!bundle.itemId || bundle.itemId.trim().length === 0) errors.push("missing itemId");
  if (!bundle.completed || bundle.completed.trim().length === 0) errors.push("missing completed");
  if (!Array.isArray(bundle.filesChanged) || bundle.filesChanged.length === 0) errors.push("missing filesChanged[]");
  if (!bundle.verification || bundle.verification.trim().length === 0) errors.push("missing verification");
  if (!bundle.visibleMarker || bundle.visibleMarker.trim().length === 0) errors.push("missing visibleMarker");
  return errors;
}

async function emit(path: string): Promise<number> {
  const files = (process.env.EVIDENCE_FILES ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  const bundle: EvidenceBundle = {
    generatedAt: new Date().toISOString(),
    itemId: process.env.EVIDENCE_ITEM_ID ?? "",
    completed: process.env.EVIDENCE_COMPLETED ?? "",
    filesChanged: files,
    verification: process.env.EVIDENCE_VERIFICATION ?? "",
    visibleMarker: process.env.EVIDENCE_VISIBLE_MARKER ?? "",
  };

  const errors = validateBundle(bundle);
  if (errors.length > 0) {
    console.error(`EVIDENCE_INVALID ${errors.join("; ")}`);
    return 1;
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
  console.log(`EVIDENCE_EMITTED ${path}`);
  return 0;
}

async function validate(path: string): Promise<number> {
  try {
    const raw = await readFile(path, "utf8");
    const bundle = JSON.parse(raw) as Partial<EvidenceBundle>;
    const errors = validateBundle(bundle);
    if (errors.length > 0) {
      console.error(`EVIDENCE_INVALID ${errors.join("; ")}`);
      return 1;
    }
    console.log(`EVIDENCE_VALID item=${bundle.itemId} file=${path}`);
    return 0;
  } catch (error) {
    console.error(`EVIDENCE_READ_ERROR ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

async function main(): Promise<void> {
  const code = cmd === "emit" ? await emit(targetPath) : await validate(targetPath);
  process.exit(code);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
