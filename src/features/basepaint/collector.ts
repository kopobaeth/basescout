import { normalizeBasePaintCanvas } from "./data";
import type {
  BasePaintCollectorHolding,
  BasePaintCollectorPaletteColor,
  BasePaintCollectorResponse
} from "./types";

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const MAX_PALETTE_COLORS = 8;

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

function connectionItems(value: unknown) {
  return isRecord(value) && Array.isArray(value.items) ? value.items : [];
}

function dataRecord(value: unknown) {
  return isRecord(value) && isRecord(value.data) ? value.data : null;
}

function holdingFromValue(value: unknown, currentDay: number) {
  if (!isRecord(value)) return null;
  const day = finiteInteger(value.tokenId);
  const editions = finiteInteger(value.value);
  if (day < 1 || day > currentDay || editions < 1) return null;
  return { day, editions };
}

export function collectorHoldingDays(value: unknown, currentDay: number, limit: number) {
  const data = dataRecord(value);
  if (!data || !isRecord(data.holdings)) return [];

  const seen = new Set<number>();
  return connectionItems(data.holdings)
    .map((item) => holdingFromValue(item, currentDay))
    .filter((holding): holding is { day: number; editions: number } => {
      if (!holding || seen.has(holding.day)) return false;
      seen.add(holding.day);
      return true;
    })
    .sort((a, b) => b.day - a.day)
    .slice(0, Math.max(1, Math.trunc(limit)));
}

function dominantPalette(collection: BasePaintCollectorHolding[]): BasePaintCollectorPaletteColor[] {
  const counts = new Map<string, number>();
  for (const holding of collection) {
    for (const color of new Set(holding.palette)) {
      counts.set(color, (counts.get(color) ?? 0) + 1);
    }
  }

  return [...counts]
    .map(([color, canvasCount]) => ({ color, canvasCount }))
    .sort((a, b) => b.canvasCount - a.canvasCount || a.color.localeCompare(b.color))
    .slice(0, MAX_PALETTE_COLORS);
}

function firstHoldingDay(value: unknown, currentDay: number) {
  const first = connectionItems(value)[0];
  if (!isRecord(first)) return null;
  const day = finiteInteger(first.tokenId);
  return day >= 1 && day <= currentDay ? day : null;
}

export function normalizeBasePaintCollector(
  summaryPayload: unknown,
  canvasesPayload: unknown,
  address: string,
  currentDay: number,
  sampleLimit: number,
  generatedAt = Date.now()
): BasePaintCollectorResponse | null {
  if (!ADDRESS_PATTERN.test(address) || currentDay < 1 || sampleLimit < 1) return null;

  const summary = dataRecord(summaryPayload);
  const canvases = dataRecord(canvasesPayload);
  if (
    !summary ||
    !isRecord(summary.holdings) ||
    !isRecord(summary.oldest) ||
    !isRecord(summary.totalBalances) ||
    !canvases ||
    !isRecord(canvases.canvass)
  ) {
    return null;
  }

  const holdings = collectorHoldingDays(summaryPayload, currentDay, sampleLimit);
  const canvasByDay = new Map<number, ReturnType<typeof normalizeBasePaintCanvas>>();
  for (const value of connectionItems(canvases.canvass)) {
    const canvas = normalizeBasePaintCanvas(value, currentDay);
    if (canvas) canvasByDay.set(canvas.day, canvas);
  }

  const collection = holdings.map<BasePaintCollectorHolding>((holding) => {
    const canvas = canvasByDay.get(holding.day);
    return {
      day: holding.day,
      editions: holding.editions,
      name: canvas?.name,
      palette: canvas?.palette ?? [],
      totalArtists: canvas?.totalArtists ?? 0,
      pixelsCount: canvas?.pixelsCount ?? 0,
      totalMints: canvas?.totalMints ?? 0,
      totalBurns: canvas?.totalBurns ?? 0
    };
  });

  const totalCanvasDays = Math.max(
    holdings.length,
    finiteInteger(summary.holdings.totalCount)
  );
  const totalBalanceItem = connectionItems(summary.totalBalances)[0];
  const totalEditions = isRecord(totalBalanceItem)
    ? finiteInteger(totalBalanceItem.value)
    : 0;
  const earliestHeldDay = firstHoldingDay(summary.oldest, currentDay);
  const latestHeldDay = holdings[0]?.day ?? null;
  const hasNextPage =
    isRecord(summary.holdings.pageInfo) && summary.holdings.pageInfo.hasNextPage === true;

  return {
    source: "basepaint",
    attribution: "Public onchain data by BasePaint",
    artworkLicense: "CC0",
    generatedAt,
    currentDay,
    cacheSeconds: 60,
    address,
    totalCanvasDays,
    totalEditions,
    earliestHeldDay,
    latestHeldDay,
    sampledCanvasDays: collection.length,
    sampleLimit: Math.trunc(sampleLimit),
    truncated: hasNextPage || totalCanvasDays > collection.length,
    dominantPalette: dominantPalette(collection),
    collection
  };
}

export function basePaintCollectorUrl(address: string) {
  return `/basepaint/collector/${encodeURIComponent(address)}`;
}

export function basePaintCollectorRouteAddress(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 3 || segments[0] !== "basepaint" || segments[1] !== "collector") {
    return undefined;
  }

  try {
    return decodeURIComponent(segments[2]);
  } catch {
    return "";
  }
}

export function isBasePaintCollectorResponse(value: unknown): value is BasePaintCollectorResponse {
  if (!isRecord(value) || value.source !== "basepaint" || !ADDRESS_PATTERN.test(String(value.address))) {
    return false;
  }
  if (
    !Number.isFinite(value.generatedAt) ||
    !Number.isInteger(value.currentDay) ||
    !Number.isInteger(value.totalCanvasDays) ||
    !Number.isInteger(value.totalEditions) ||
    !Number.isInteger(value.sampledCanvasDays) ||
    !Number.isInteger(value.sampleLimit) ||
    typeof value.truncated !== "boolean" ||
    !Array.isArray(value.dominantPalette) ||
    !Array.isArray(value.collection)
  ) {
    return false;
  }

  return value.collection.every(
    (holding) =>
      isRecord(holding) &&
      Number.isInteger(holding.day) &&
      Number.isInteger(holding.editions) &&
      Array.isArray(holding.palette)
  );
}
