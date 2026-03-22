import type { SessionStatusSnapshot } from "../types";

export function parseSessionStatusText(sessionKey: string, raw: string): SessionStatusSnapshot {
  const model = matchOne(raw, /Model:\s*([^·\n]+)/)?.trim();
  const tokensIn = toInt(matchOne(raw, /Tokens:\s*(\d+)\s*in/i));
  const tokensOut = toInt(matchOne(raw, /in\s*\/\s*(\d+)\s*out/i));
  const cost = toFloat(
    matchOne(raw, /Cost:\s*\$?\s*([0-9]+(?:\.[0-9]+)?)/i) ??
      matchOne(raw, /Total\s+Cost:\s*\$?\s*([0-9]+(?:\.[0-9]+)?)/i),
  );

  return {
    sessionKey,
    model,
    tokensIn,
    tokensOut,
    cost,
    updatedAt: new Date().toISOString(),
  };
}

function matchOne(text: string, re: RegExp): string | undefined {
  const m = text.match(re);
  return m?.[1];
}

function toInt(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? undefined : n;
}

function toFloat(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number.parseFloat(v);
  return Number.isNaN(n) ? undefined : n;
}
