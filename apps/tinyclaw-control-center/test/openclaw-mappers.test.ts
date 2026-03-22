import assert from "node:assert/strict";
import test from "node:test";
import { mapSessionsListToSummaries } from "../src/mappers/openclaw-mappers";

test("session list mapping keeps explicit runtime issue states instead of flattening them to active/idle", () => {
  const mapped = mapSessionsListToSummaries({
    sessions: [
      { sessionKey: "sess-blocked", active: true, state: "blocked" },
      { sessionKey: "sess-error", active: false, state: "failed" },
      { sessionKey: "sess-wait", active: true, state: "waiting_approval" },
      { sessionKey: "sess-running", active: true, state: "busy" },
      { sessionKey: "sess-idle", active: true, state: "done" },
      { sessionKey: "sess-fallback", active: true },
    ],
  });

  const byKey = new Map(mapped.map((item) => [item.sessionKey, item.state]));
  assert.equal(byKey.get("sess-blocked"), "blocked");
  assert.equal(byKey.get("sess-error"), "error");
  assert.equal(byKey.get("sess-wait"), "waiting_approval");
  assert.equal(byKey.get("sess-running"), "running");
  assert.equal(byKey.get("sess-idle"), "idle");
  assert.equal(byKey.get("sess-fallback"), "running");
});
