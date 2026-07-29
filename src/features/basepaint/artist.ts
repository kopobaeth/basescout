import type {
  BasePaintArtistBrush,
  BasePaintArtistContribution,
  BasePaintArtistResponse
} from "./types";

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const MAX_CONTRIBUTIONS = 12;
const MAX_BRUSHES = 6;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function finiteInteger(value: unknown, fallback = 0) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number.parseInt(value, 10)
        : Number.NaN;
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
}

function nullableInteger(value: unknown) {
  if (value === null || value === undefined) return null;
  const parsed = finiteInteger(value);
  return parsed > 0 ? parsed : null;
}

function integerString(value: unknown) {
  const text = typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
  return /^\d+$/.test(text) ? text : "0";
}

function normalizeContributions(value: unknown, currentDay: number): BasePaintArtistContribution[] {
  if (!isRecord(value) || !Array.isArray(value.items)) return [];
  const seen = new Set<number>();

  return value.items
    .map((item): BasePaintArtistContribution | null => {
      if (!isRecord(item)) return null;
      const day = finiteInteger(item.canvasId);
      const pixelsCount = finiteInteger(item.pixelsCount);
      if (day < 1 || day > currentDay || pixelsCount < 1 || seen.has(day)) return null;
      seen.add(day);
      return { day, pixelsCount };
    })
    .filter((item): item is BasePaintArtistContribution => item !== null)
    .sort((left, right) => right.day - left.day)
    .slice(0, MAX_CONTRIBUTIONS);
}

function normalizeBrushes(value: unknown, currentDay: number): BasePaintArtistBrush[] {
  if (!isRecord(value) || !Array.isArray(value.items)) return [];
  const seen = new Set<number>();

  return value.items
    .map((item): BasePaintArtistBrush | null => {
      if (!isRecord(item)) return null;
      const id = finiteInteger(item.id);
      if (id < 1 || seen.has(id)) return null;
      seen.add(id);
      const lastUsedDay = nullableInteger(item.lastUsedDay);

      return {
        id,
        strength: finiteInteger(item.strength),
        streak: finiteInteger(item.streak),
        lastUsedDay: lastUsedDay && lastUsedDay <= currentDay ? lastUsedDay : null,
        lastUsedAt: nullableInteger(item.lastUsedTimestamp)
          ? finiteInteger(item.lastUsedTimestamp) * 1000
          : null
      };
    })
    .filter((item): item is BasePaintArtistBrush => item !== null)
    .sort((left, right) => right.strength - left.strength || left.id - right.id)
    .slice(0, MAX_BRUSHES);
}

export function normalizeBasePaintArtist(
  value: unknown,
  requestedAddress: string,
  currentDay: number,
  nowMs = Date.now()
): BasePaintArtistResponse | null {
  if (!isRecord(value) || !isRecord(value.data) || !isRecord(value.data.account)) return null;
  const account = value.data.account;
  const address = typeof account.id === "string" ? account.id : "";
  if (!ADDRESS_PATTERN.test(address) || address.toLowerCase() !== requestedAddress.toLowerCase()) {
    return null;
  }

  const lastPaintedDay = nullableInteger(account.lastPaintedDay);
  return {
    source: "basepaint",
    attribution: "Public onchain data by BasePaint",
    generatedAt: nowMs,
    currentDay,
    cacheSeconds: 60,
    address,
    totalPixels: finiteInteger(account.totalPixels),
    totalDaysPainted: finiteInteger(account.totalDaysPainted),
    streak: finiteInteger(account.streak),
    longestStreak: finiteInteger(account.longestStreak),
    lastPaintedDay: lastPaintedDay && lastPaintedDay <= currentDay ? lastPaintedDay : null,
    totalEarnedWei: integerString(account.totalEarned),
    totalWithdrawnWei: integerString(account.totalWithdrawn),
    recentContributions: normalizeContributions(value.data.contributions, currentDay),
    brushes: normalizeBrushes(value.data.brushs, currentDay)
  };
}

export function isBasePaintArtistResponse(value: unknown): value is BasePaintArtistResponse {
  if (!isRecord(value) || value.source !== "basepaint") return false;
  return (
    typeof value.address === "string" &&
    ADDRESS_PATTERN.test(value.address) &&
    Number.isInteger(value.currentDay) &&
    Number.isFinite(value.generatedAt) &&
    Number.isInteger(value.totalPixels) &&
    Number.isInteger(value.totalDaysPainted) &&
    Array.isArray(value.recentContributions) &&
    Array.isArray(value.brushes)
  );
}
