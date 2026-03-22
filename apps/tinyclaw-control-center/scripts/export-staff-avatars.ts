import { promises as fs } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { deflateSync } from "node:zlib";

type Sprite = string[][];

type SpriteRuntime = {
  spriteSize: number;
  spriteFactory: Record<string, () => Sprite>;
  spriteVisualSpanCompensation: Record<string, number>;
};

type StaffAvatarExport = {
  agentId: string;
  animal: string;
  label: string;
  labelZh: string;
};

type SpriteBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  span: number;
};

export const STAFF_AVATARS: StaffAvatarExport[] = [
  { agentId: "codex", animal: "robot", label: "Codex", labelZh: "机器人" },
  { agentId: "coq", animal: "rooster", label: "Coq", labelZh: "公鸡" },
  { agentId: "dolphin", animal: "dolphin", label: "Dolphin", labelZh: "海豚" },
  { agentId: "main", animal: "lion", label: "Main", labelZh: "狮子" },
  { agentId: "monkey", animal: "monkey", label: "Monkey", labelZh: "猴子" },
  { agentId: "otter", animal: "otter", label: "Otter", labelZh: "水獭" },
  { agentId: "pandas", animal: "panda", label: "Pandas", labelZh: "熊猫" },
  { agentId: "tiger", animal: "tiger", label: "Tiger", labelZh: "老虎" },
];

export function extractSpriteRuntime(source: string): SpriteRuntime {
  const start = source.indexOf("const spriteSize = 44;");
  const end = source.indexOf("const motionActors = [];", start);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("Unable to locate embedded staff avatar sprite runtime in src/ui/server.ts");
  }

  const block = source.slice(start, end);
  const runtime = vm.runInNewContext(
    `
      (() => {
        ${block}
        return { spriteSize, spriteFactory, spriteVisualSpanCompensation };
      })()
    `,
    { Math },
  ) as SpriteRuntime;

  if (!runtime || typeof runtime.spriteSize !== "number" || !runtime.spriteFactory || !runtime.spriteVisualSpanCompensation) {
    throw new Error("Failed to evaluate embedded avatar sprite runtime");
  }

  return runtime;
}

export async function loadSpriteRuntime(serverPath: string): Promise<SpriteRuntime> {
  const source = await fs.readFile(serverPath, "utf8");
  return extractSpriteRuntime(source);
}

export function getSpriteBounds(sprite: Sprite): SpriteBounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let y = 0; y < sprite.length; y += 1) {
    for (let x = 0; x < sprite[y].length; x += 1) {
      if (!sprite[y][x]) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 1, height: 1, span: 1 };
  }

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  return { minX, minY, maxX, maxY, width, height, span: Math.max(width, height) };
}

export function centerSprite(sprite: Sprite, padding = 2): Sprite {
  const bounds = getSpriteBounds(sprite);
  const size = bounds.span + padding * 2;
  const centered = Array.from({ length: size }, () => Array(size).fill(""));
  const offsetX = Math.floor((size - bounds.width) / 2);
  const offsetY = Math.floor((size - bounds.height) / 2);

  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const color = sprite[y]?.[x];
      if (!color) continue;
      centered[offsetY + (y - bounds.minY)][offsetX + (x - bounds.minX)] = color;
    }
  }

  return centered;
}

export function renderSpriteSvg(sprite: Sprite, pixelScale = 8): string {
  const centered = centerSprite(sprite);
  const size = centered.length;
  const width = size * pixelScale;
  const rects: string[] = [];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const color = centered[y]?.[x];
      if (!color) continue;
      rects.push(
        `<rect x="${x * pixelScale}" y="${y * pixelScale}" width="${pixelScale}" height="${pixelScale}" fill="${color}" />`,
      );
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${width}" viewBox="0 0 ${width} ${width}" shape-rendering="crispEdges">`,
    `<rect width="${width}" height="${width}" fill="transparent" />`,
    ...rects,
    `</svg>`,
  ].join("\n");
}

export function renderSpriteRgba(sprite: Sprite, pixelScale = 8): { width: number; height: number; data: Buffer } {
  const centered = centerSprite(sprite);
  const size = centered.length;
  const width = size * pixelScale;
  const height = size * pixelScale;
  const data = Buffer.alloc(width * height * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const color = centered[y]?.[x];
      for (let py = 0; py < pixelScale; py += 1) {
        for (let px = 0; px < pixelScale; px += 1) {
          const idx = ((y * pixelScale + py) * width + (x * pixelScale + px)) * 4;
          if (!color) {
            data[idx + 0] = 0;
            data[idx + 1] = 0;
            data[idx + 2] = 0;
            data[idx + 3] = 0;
            continue;
          }
          const rgb = hexToRgb(color);
          data[idx + 0] = rgb.r;
          data[idx + 1] = rgb.g;
          data[idx + 2] = rgb.b;
          data[idx + 3] = 255;
        }
      }
    }
  }

  return { width, height, data };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const safe = hex.trim().replace(/^#/, "");
  if (safe.length !== 6) {
    throw new Error(`Unsupported color "${hex}"`);
  }
  return {
    r: Number.parseInt(safe.slice(0, 2), 16),
    g: Number.parseInt(safe.slice(2, 4), 16),
    b: Number.parseInt(safe.slice(4, 6), 16),
  };
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = crcTable[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcBuffer = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcBuffer), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

export function renderSpritePng(sprite: Sprite, pixelScale = 8): Buffer {
  const rgba = renderSpriteRgba(sprite, pixelScale);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(rgba.width, 0);
  ihdr.writeUInt32BE(rgba.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = rgba.width * 4;
  const raw = Buffer.alloc((stride + 1) * rgba.height);
  for (let y = 0; y < rgba.height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    rgba.data.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }

  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

export function renderPreviewHtml(items: StaffAvatarExport[]): string {
  const cards = items
    .map(
      (item) => `<article class="card">
  <img src="./${item.agentId}.png" alt="${item.label}" width="176" height="176" />
  <div class="meta">
    <h2>${item.label}</h2>
    <p>${item.labelZh}</p>
    <code>${item.agentId}</code>
  </div>
</article>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Staff Avatar Exports</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f5f7;
      --panel: #ffffff;
      --border: rgba(17, 24, 39, 0.08);
      --text: #1d1d1f;
      --muted: #6e6e73;
      --shadow: 0 18px 40px rgba(15, 23, 42, 0.06);
      font-family: "SF Pro Display", "SF Pro Text", "Helvetica Neue", sans-serif;
    }
    body {
      margin: 0;
      background: linear-gradient(180deg, #fbfbfd 0%, var(--bg) 100%);
      color: var(--text);
      padding: 40px;
    }
    h1 {
      margin: 0 0 12px;
      font-size: 34px;
      line-height: 1.05;
    }
    p.lead {
      margin: 0 0 28px;
      color: var(--muted);
      font-size: 17px;
      line-height: 1.5;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 18px;
    }
    .card {
      background: rgba(255,255,255,0.88);
      border: 1px solid var(--border);
      border-radius: 24px;
      padding: 18px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(20px);
    }
    img {
      display: block;
      width: 176px;
      height: 176px;
      margin: 0 auto 12px;
      image-rendering: pixelated;
    }
    h2 {
      margin: 0;
      font-size: 22px;
    }
    .meta p,
    .meta code {
      margin: 6px 0 0;
      color: var(--muted);
      font-size: 14px;
      display: block;
    }
  </style>
</head>
<body>
  <h1>Staff Avatar Exports</h1>
  <p class="lead">Exported from the current pixel avatar definitions embedded in <code>src/ui/server.ts</code>.</p>
  <section class="grid">
    ${cards}
  </section>
</body>
</html>`;
}

export async function exportStaffAvatars(outputDir: string, serverPath: string): Promise<string[]> {
  const runtime = await loadSpriteRuntime(serverPath);
  await fs.mkdir(outputDir, { recursive: true });

  const written: string[] = [];

  for (const item of STAFF_AVATARS) {
    const renderer = runtime.spriteFactory[item.animal];
    if (!renderer) {
      throw new Error(`Missing renderer for animal "${item.animal}"`);
    }
    const sprite = renderer();

    const svg = renderSpriteSvg(sprite);
    const svgPath = path.join(outputDir, `${item.agentId}.svg`);
    await fs.writeFile(svgPath, svg, "utf8");
    written.push(svgPath);

    const png = renderSpritePng(sprite);
    const pngPath = path.join(outputDir, `${item.agentId}.png`);
    await fs.writeFile(pngPath, png);
    written.push(pngPath);
  }

  const manifestPath = path.join(outputDir, "manifest.json");
  await fs.writeFile(
    manifestPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: "src/ui/server.ts",
        count: STAFF_AVATARS.length,
        avatars: STAFF_AVATARS.map((item) => ({
          agentId: item.agentId,
          animal: item.animal,
          label: item.label,
          labelZh: item.labelZh,
          svg: `${item.agentId}.svg`,
          png: `${item.agentId}.png`,
        })),
      },
      null,
      2,
    ),
    "utf8",
  );
  written.push(manifestPath);

  const previewPath = path.join(outputDir, "index.html");
  await fs.writeFile(previewPath, renderPreviewHtml(STAFF_AVATARS), "utf8");
  written.push(previewPath);

  return written;
}

async function main(): Promise<void> {
  const repoRoot = process.cwd();
  const serverPath = path.join(repoRoot, "src/ui/server.ts");
  const outputDir = path.join(repoRoot, "runtime/exports/staff-avatars");
  const written = await exportStaffAvatars(outputDir, serverPath);
  process.stdout.write(`Exported ${written.length} staff avatar files to ${outputDir}\n`);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
