import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import type { CommanderExceptionsFeed } from "../src/types";

const RUNTIME_DIR = join(process.cwd(), "runtime");
const EXPORTS_DIR = join(RUNTIME_DIR, "exports");
const TIMELINE_LOG_PATH = join(RUNTIME_DIR, "timeline.log");

test("replay index applies optional from/to filters", async () => {
  const { loadReplayIndex } = await import("../src/runtime/replay-index");

  await mkdir(EXPORTS_DIR, { recursive: true });

  const now = Date.now();
  const outsideAt = new Date(now - 6 * 60 * 60 * 1000).toISOString();
  const insideAt = new Date(now - 10 * 60 * 1000).toISOString();
  const from = new Date(now - 30 * 60 * 1000).toISOString();
  const to = new Date(now + 60 * 1000).toISOString();

  const outsideFile = `zzzz-phase13-outside-${Date.now()}.json`;
  const insideFile = `zzzz-phase13-inside-${Date.now()}.json`;
  const outsidePath = join(EXPORTS_DIR, outsideFile);
  const insidePath = join(EXPORTS_DIR, insideFile);

  await writeFile(
    outsidePath,
    `${JSON.stringify({ exportedAt: outsideAt, projects: { projects: [] }, tasks: { tasks: [] }, sessions: [], exceptionsFeed: { items: [] } }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    insidePath,
    `${JSON.stringify({ exportedAt: insideAt, projects: { projects: [] }, tasks: { tasks: [] }, sessions: [], exceptionsFeed: { items: [] } }, null, 2)}\n`,
    "utf8",
  );

  let timelineExisted = true;
  let timelineBefore = "";
  try {
    timelineBefore = await readFile(TIMELINE_LOG_PATH, "utf8");
  } catch {
    timelineExisted = false;
  }

  const markerOutside = `phase13-outside-${Date.now()}`;
  const markerInside = `phase13-inside-${Date.now()}`;
  await writeFile(
    TIMELINE_LOG_PATH,
    `${timelineBefore}${timelineBefore.endsWith("\n") || timelineBefore === "" ? "" : "\n"}${outsideAt} | ${markerOutside}\n${insideAt} | ${markerInside}\n`,
    "utf8",
  );

  try {
    const replay = await loadReplayIndex({
      timelineLimit: 400,
      digestLimit: 200,
      exportLimit: 200,
      from,
      to,
    });
    assert.equal(replay.window?.from, from);
    assert.equal(replay.window?.to, to);
    assert(replay.exportBundles.some((entry) => entry.fileName === insideFile));
    assert(!replay.exportBundles.some((entry) => entry.fileName === outsideFile));
    assert(replay.timeline.entries.some((entry) => entry.summary.includes(markerInside)));
    assert(!replay.timeline.entries.some((entry) => entry.summary.includes(markerOutside)));
    assert.equal(replay.stats.timeline.total, replay.timeline.totalLines);
    assert.equal(replay.stats.timeline.returned, replay.timeline.entries.length);
    assert.equal(replay.stats.exportBundles.returned, replay.exportBundles.length);
    assert(replay.stats.timeline.filteredOut >= 1);
    assert(replay.stats.exportBundles.filteredOut >= 1);
    assert(replay.stats.timeline.latencyMs >= 0);
    assert(replay.stats.digests.latencyMs >= 0);
    assert(replay.stats.exportSnapshots.latencyMs >= 0);
    assert(replay.stats.exportBundles.latencyMs >= 0);
    assert(replay.stats.timeline.latencyBucketsMs.p50 >= 0);
    assert(replay.stats.timeline.latencyBucketsMs.p95 >= replay.stats.timeline.latencyBucketsMs.p50);
    assert(replay.stats.digests.latencyBucketsMs.p50 >= 0);
    assert(replay.stats.digests.latencyBucketsMs.p95 >= replay.stats.digests.latencyBucketsMs.p50);
    assert(replay.stats.exportSnapshots.latencyBucketsMs.p50 >= 0);
    assert(
      replay.stats.exportSnapshots.latencyBucketsMs.p95 >=
        replay.stats.exportSnapshots.latencyBucketsMs.p50,
    );
    assert(replay.stats.exportBundles.latencyBucketsMs.p50 >= 0);
    assert(
      replay.stats.exportBundles.latencyBucketsMs.p95 >= replay.stats.exportBundles.latencyBucketsMs.p50,
    );
    assert(replay.stats.total.latencyBucketsMs.p50 >= 0);
    assert(replay.stats.total.latencyBucketsMs.p95 >= replay.stats.total.latencyBucketsMs.p50);
    assert(replay.stats.timeline.totalSizeBytes >= replay.stats.timeline.returnedSizeBytes);
    assert(replay.stats.digests.totalSizeBytes >= replay.stats.digests.returnedSizeBytes);
    assert(replay.stats.exportSnapshots.totalSizeBytes >= replay.stats.exportSnapshots.returnedSizeBytes);
    assert(replay.stats.exportBundles.totalSizeBytes >= replay.stats.exportBundles.returnedSizeBytes);
    assert.equal(
      replay.stats.total.returned,
      replay.stats.timeline.returned +
        replay.stats.digests.returned +
        replay.stats.exportSnapshots.returned +
        replay.stats.exportBundles.returned,
    );
    assert.equal(
      replay.stats.total.returnedSizeBytes,
      replay.stats.timeline.returnedSizeBytes +
        replay.stats.digests.returnedSizeBytes +
        replay.stats.exportSnapshots.returnedSizeBytes +
        replay.stats.exportBundles.returnedSizeBytes,
    );
    assert.equal(
      replay.stats.total.totalSizeBytes,
      replay.stats.timeline.totalSizeBytes +
        replay.stats.digests.totalSizeBytes +
        replay.stats.exportSnapshots.totalSizeBytes +
        replay.stats.exportBundles.totalSizeBytes,
    );
  } finally {
    await rm(outsidePath, { force: true });
    await rm(insidePath, { force: true });
    if (timelineExisted) {
      await writeFile(TIMELINE_LOG_PATH, timelineBefore, "utf8");
    } else {
      await rm(TIMELINE_LOG_PATH, { force: true });
    }
  }
});

test("action queue acknowledgements support ttl and expire as inactive", async () => {
  const { ACKS_PATH, acknowledgeActionQueueItem, actionQueueItemId, buildNotificationCenter } =
    await import("../src/runtime/notification-center");

  const feed: CommanderExceptionsFeed = {
    generatedAt: new Date().toISOString(),
    items: [
      {
        level: "action-required",
        code: "TASK_DUE",
        source: "task",
        sourceId: "task-1",
        message: "task due now",
        route: "action-queue",
        occurredAt: new Date().toISOString(),
      },
    ],
    counts: {
      info: 0,
      warn: 0,
      actionRequired: 1,
    },
  };

  const itemId = actionQueueItemId(feed.items[0]);
  const center = buildNotificationCenter(feed, {
    acks: [],
    updatedAt: new Date().toISOString(),
  });

  let acksExisted = true;
  let acksBefore = "";
  try {
    acksBefore = await readFile(ACKS_PATH, "utf8");
  } catch {
    acksExisted = false;
  }

  try {
    const result = await acknowledgeActionQueueItem({ itemId, ttlMinutes: 5 }, center);
    assert.equal(result.ack.itemId, itemId);
    assert.equal(typeof result.ack.expiresAt, "string");
    assert(Date.parse(result.ack.expiresAt ?? "") > Date.parse(result.ack.ackedAt));
  } finally {
    if (acksExisted) {
      await writeFile(ACKS_PATH, acksBefore, "utf8");
    } else {
      await rm(ACKS_PATH, { force: true });
    }
  }

  const futureAckCenter = buildNotificationCenter(feed, {
    acks: [
      {
        itemId,
        ackedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    ],
    updatedAt: new Date().toISOString(),
  });
  assert.equal(futureAckCenter.queue[0]?.acknowledged, true);
  assert.equal(typeof futureAckCenter.queue[0]?.ackExpiresAt, "string");

  const expiredAckCenter = buildNotificationCenter(feed, {
    acks: [
      {
        itemId,
        ackedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      },
    ],
    updatedAt: new Date().toISOString(),
  });
  assert.equal(expiredAckCenter.queue[0]?.acknowledged, false);
});

test("stale ack prune preview returns counts only and does not mutate ack store", async () => {
  const { ACKS_PATH, previewStaleAcksPrune } = await import("../src/runtime/notification-center");

  let acksExisted = true;
  let acksBefore = "";
  try {
    acksBefore = await readFile(ACKS_PATH, "utf8");
  } catch {
    acksExisted = false;
  }

  const nowMs = Date.now();
  const expiredItemId = `phase15-preview-expired-${nowMs}`;
  const activeItemId = `phase15-preview-active-${nowMs}`;
  const fixture = {
    acks: [
      {
        itemId: expiredItemId,
        ackedAt: new Date(nowMs - 2 * 60_000).toISOString(),
        expiresAt: new Date(nowMs - 60_000).toISOString(),
      },
      {
        itemId: activeItemId,
        ackedAt: new Date(nowMs - 2 * 60_000).toISOString(),
        expiresAt: new Date(nowMs + 5 * 60_000).toISOString(),
      },
    ],
    updatedAt: new Date(nowMs).toISOString(),
  };
  await writeFile(ACKS_PATH, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");

  try {
    const preview = await previewStaleAcksPrune({ nowMs });
    assert.equal(preview.dryRun, true);
    assert.equal(preview.before, 2);
    assert.equal(preview.removed, 1);
    assert.equal(preview.after, 1);
    assert.equal(Object.prototype.hasOwnProperty.call(preview, "removedItemIds"), false);

    const afterRaw = await readFile(ACKS_PATH, "utf8");
    const after = JSON.parse(afterRaw) as { acks?: Array<{ itemId?: string }> };
    const itemIds = (after.acks ?? []).map((item) => item.itemId).filter(Boolean);
    assert(itemIds.includes(expiredItemId), "Preview must not mutate runtime/acks.json.");
    assert(itemIds.includes(activeItemId));
  } finally {
    if (acksExisted) {
      await writeFile(ACKS_PATH, acksBefore, "utf8");
    } else {
      await rm(ACKS_PATH, { force: true });
    }
  }
});
