import assert from "node:assert/strict";
import test from "node:test";
import { readFile, rm, writeFile } from "node:fs/promises";
import {
  UI_PREFERENCES_PATH,
  defaultUiPreferences,
  loadUiPreferences,
  saveUiPreferences,
} from "../src/runtime/ui-preferences";

test("ui language preference persists after save and reload", async () => {
  const original = await readMaybe(UI_PREFERENCES_PATH);

  try {
    await saveUiPreferences({
      ...defaultUiPreferences(),
      language: "zh",
      updatedAt: new Date().toISOString(),
    });

    const loaded = await loadUiPreferences();
    assert.equal(loaded.preferences.language, "zh");
  } finally {
    if (original === undefined) {
      await rm(UI_PREFERENCES_PATH, { force: true });
    } else {
      await writeFile(UI_PREFERENCES_PATH, original, "utf8");
    }
  }
});

async function readMaybe(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "ENOENT"
    ) {
      return undefined;
    }
    throw error;
  }
}
