import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";

import {
  STAFF_AVATARS,
  centerSprite,
  extractSpriteRuntime,
  getSpriteBounds,
  renderSpritePng,
  renderSpriteSvg,
} from "../scripts/export-staff-avatars";

test("embedded avatar runtime can be extracted from ui server", async () => {
  const serverPath = path.join(process.cwd(), "src/ui/server.ts");
  const source = await import("node:fs/promises").then((fs) => fs.readFile(serverPath, "utf8"));
  const runtime = extractSpriteRuntime(source);

  assert.equal(runtime.spriteSize, 44);
  assert.equal(typeof runtime.spriteFactory.monkey, "function");
  assert.equal(typeof runtime.spriteFactory.otter, "function");
  assert.equal(runtime.spriteVisualSpanCompensation.lion, 0.92);
  assert.equal(runtime.spriteVisualSpanCompensation.otter, 0.9);
});

test("staff avatar exporter covers every configured staff member", async () => {
  const serverPath = path.join(process.cwd(), "src/ui/server.ts");
  const source = await import("node:fs/promises").then((fs) => fs.readFile(serverPath, "utf8"));
  const runtime = extractSpriteRuntime(source);

  for (const item of STAFF_AVATARS) {
    const sprite = runtime.spriteFactory[item.animal]();
    assert.equal(sprite.length, runtime.spriteSize);
    assert.ok(sprite.some((row) => row.some(Boolean)), `${item.agentId} sprite should not be empty`);
  }
});

test("sprite svg export keeps crisp pixel rects", () => {
  const svg = renderSpriteSvg([
    ["#000000", ""],
    ["", "#ffffff"],
  ]);

  assert.match(svg, /shape-rendering="crispEdges"/);
  assert.match(svg, /<rect x="16" y="16" width="8" height="8" fill="#000000"/);
  assert.match(svg, /<rect x="24" y="24" width="8" height="8" fill="#ffffff"/);
});

test("centerSprite recenters off-axis content into a square canvas", () => {
  const centered = centerSprite([
    ["", "", ""],
    ["", "#111111", ""],
    ["", "", "#222222"],
  ], 1);
  const bounds = getSpriteBounds(centered);

  assert.equal(centered.length, centered[0]?.length);
  assert.deepEqual(bounds, {
    minX: 1,
    minY: 1,
    maxX: 2,
    maxY: 2,
    width: 2,
    height: 2,
    span: 2,
  });
});

test("sprite png export writes a valid PNG signature", () => {
  const png = renderSpritePng([
    ["#000000", ""],
    ["", "#ffffff"],
  ], 4);

  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
});
