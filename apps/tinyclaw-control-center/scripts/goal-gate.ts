import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

interface GoalState {
  goalId: string;
  definitionOfDone: string[];
  phases: Array<{ id: string; status: string }>;
}

const path = resolve(process.argv[2] ?? "runtime/goal-state.json");

async function main() {
  const raw = await readFile(path, "utf8");
  const state = JSON.parse(raw) as GoalState;

  const inProgress = state.phases.filter((p) => p.status === "in_progress");
  const blocked = state.phases.filter((p) => p.status === "blocked");

  if (blocked.length > 0) {
    console.error(`GATE_BLOCKED phases=${blocked.map((p) => p.id).join(",")}`);
    process.exit(1);
  }

  if (inProgress.length > 1) {
    console.error(`GATE_INVALID multiple_in_progress=${inProgress.map((p) => p.id).join(",")}`);
    process.exit(1);
  }

  const doneCount = state.phases.filter((p) => p.status === "done").length;
  const total = state.phases.length;
  const current = inProgress[0]?.id ?? "none";
  console.log(`GATE_OK goal=${state.goalId} done=${doneCount}/${total} current=${current}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
