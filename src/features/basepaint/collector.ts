import { basePaintCanvasPhase, normalizeBasePaintCanvas } from "./data.js";
import type {
  BasePaintCanvas,
  BasePaintCollectorCoverage,
  BasePaintCollectorHolding,
  BasePaintCollectorPaletteColor,
  BasePaintCollectorPeriod,
  BasePaintCollectorRecommendation,
  BasePaintCollectorRecommendationEvidence,
  BasePaintCollectorSignals,
  BasePaintCollectorThemeProposer,
  BasePaintCollectorResponse
} from "./types";

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const MAX_PALETTE_COLORS = 8;
const MAX_THEME_PROPOSERS = 5;
const MAX_RECOMMENDATIONS = 3;
const BASEPAINT_YEAR_DAYS = 365;

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

function percentage(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function dominantPalette(collection: BasePaintCollectorHolding[]): BasePaintCollectorPaletteColor[] {
  const counts = new Map<string, number>();
  const paletteMetadataDays = collection.filter((holding) => holding.palette.length > 0).length;
  for (const holding of collection) {
    for (const color of new Set(holding.palette)) {
      counts.set(color, (counts.get(color) ?? 0) + 1);
    }
  }

  return [...counts]
    .map(([color, canvasCount]) => ({
      color,
      canvasCount,
      percentage: percentage(canvasCount, paletteMetadataDays)
    }))
    .sort((a, b) => b.canvasCount - a.canvasCount || a.color.localeCompare(b.color))
    .slice(0, MAX_PALETTE_COLORS);
}

function collectorPeriods(collection: BasePaintCollectorHolding[]): BasePaintCollectorPeriod[] {
  const counts = new Map<number, number>();
  for (const holding of collection) {
    const year = Math.floor((holding.day - 1) / BASEPAINT_YEAR_DAYS) + 1;
    counts.set(year, (counts.get(year) ?? 0) + 1);
  }

  return [...counts]
    .map(([year, canvasCount]) => ({
      label: `BasePaint year ${year}`,
      startDay: (year - 1) * BASEPAINT_YEAR_DAYS + 1,
      endDay: year * BASEPAINT_YEAR_DAYS,
      canvasCount,
      percentage: percentage(canvasCount, collection.length)
    }))
    .sort((a, b) => b.canvasCount - a.canvasCount || b.startDay - a.startDay);
}

function themeProposers(
  collection: BasePaintCollectorHolding[]
): BasePaintCollectorThemeProposer[] {
  const counts = new Map<string, number>();
  const proposerMetadataDays = collection.filter((holding) => holding.proposer).length;
  for (const holding of collection) {
    if (!holding.proposer) continue;
    const key = holding.proposer.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts]
    .map(([proposer, canvasCount]) => ({
      proposer,
      canvasCount,
      percentage: percentage(canvasCount, proposerMetadataDays)
    }))
    .sort((a, b) => b.canvasCount - a.canvasCount || a.proposer.localeCompare(b.proposer))
    .slice(0, MAX_THEME_PROPOSERS);
}

function longestHeldDayRun(collection: BasePaintCollectorHolding[]) {
  const days = [...new Set(collection.map((holding) => holding.day))].sort((a, b) => a - b);
  let longest = 0;
  let current = 0;
  let previous: number | null = null;
  for (const day of days) {
    current = previous !== null && day === previous + 1 ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = day;
  }
  return longest;
}

function heldRunDays(collection: BasePaintCollectorHolding[]) {
  const days = [...new Set(collection.map((holding) => holding.day))].sort((a, b) => a - b);
  const runDays = new Set<number>();
  for (let index = 0; index < days.length; index += 1) {
    const day = days[index];
    if (days[index - 1] === day - 1 || days[index + 1] === day + 1) runDays.add(day);
  }
  return [...runDays];
}

function collectorCoverage(
  collection: BasePaintCollectorHolding[],
  totalCanvasDays: number
): BasePaintCollectorCoverage {
  const paletteMetadataDays = collection.filter((holding) => holding.palette.length > 0).length;
  const proposerMetadataDays = collection.filter((holding) => holding.proposer).length;
  const samplePercentage = percentage(collection.length, totalCanvasDays);
  const palettePercentage = percentage(paletteMetadataDays, collection.length);
  const proposerPercentage = percentage(proposerMetadataDays, collection.length);
  const confidence =
    collection.length > 0 &&
    samplePercentage >= 80 &&
    palettePercentage >= 80 &&
    proposerPercentage >= 80
      ? "high"
      : collection.length > 0 &&
          samplePercentage >= 40 &&
          (palettePercentage >= 40 || proposerPercentage >= 40)
        ? "medium"
        : "low";

  return {
    sampledCanvasDays: collection.length,
    totalCanvasDays,
    samplePercentage,
    paletteMetadataDays,
    proposerMetadataDays,
    confidence
  };
}

function collectorSignals(collection: BasePaintCollectorHolding[]): BasePaintCollectorSignals {
  return {
    longestHeldDayRun: longestHeldDayRun(collection),
    multipleEditionDays: collection.filter((holding) => holding.editions > 1).length,
    periods: collectorPeriods(collection),
    themeProposers: themeProposers(collection)
  };
}

function recommendationEvidence(
  candidate: BasePaintCanvas,
  collection: BasePaintCollectorHolding[],
  palette: BasePaintCollectorPaletteColor[],
  proposers: BasePaintCollectorThemeProposer[],
  currentDay: number
) {
  const evidence: BasePaintCollectorRecommendationEvidence[] = [];
  const dominantColors = new Set(palette.slice(0, 4).map((entry) => entry.color));
  const overlap = candidate.palette.filter((color) => dominantColors.has(color)).length;
  if (overlap > 0) {
    evidence.push({
      code: "palette_match",
      label: "Held-palette match",
      detail: `${overlap} ${overlap === 1 ? "color overlaps" : "colors overlap"} with the four leading sampled colors.`,
      weight: Math.min(40, overlap * 15)
    });
  }

  const proposer = candidate.proposer?.toLowerCase();
  const proposerMatch = proposer
    ? proposers.find((entry) => entry.proposer === proposer)
    : undefined;
  if (proposerMatch) {
    evidence.push({
      code: "theme_proposer_match",
      label: "Recurring theme proposer",
      detail: `${proposerMatch.canvasCount} sampled held ${proposerMatch.canvasCount === 1 ? "canvas has" : "canvases have"} the same theme proposer.`,
      weight: 30
    });
  }

  const nearestDistance = heldRunDays(collection).reduce(
    (nearest, day) => Math.min(nearest, Math.abs(day - candidate.day)),
    Number.POSITIVE_INFINITY
  );
  if (nearestDistance > 0 && nearestDistance <= 7) {
    evidence.push({
      code: "near_held_day",
      label: "Near a held-day run",
      detail: `Day #${candidate.day} is ${nearestDistance} ${nearestDistance === 1 ? "day" : "days"} from a consecutive sampled held-day run.`,
      weight: 15
    });
  }

  if (basePaintCanvasPhase(candidate.day, currentDay) === "collecting") {
    evidence.push({
      code: "collecting_now",
      label: "Collecting now",
      detail: "This is the latest completed canvas and is currently in BasePaint’s collecting phase.",
      weight: 20
    });
  }

  return evidence;
}

function collectorRecommendations(
  candidates: BasePaintCanvas[],
  collection: BasePaintCollectorHolding[],
  palette: BasePaintCollectorPaletteColor[],
  proposers: BasePaintCollectorThemeProposer[],
  currentDay: number
): BasePaintCollectorRecommendation[] {
  if (!collection.length) return [];
  const heldDays = new Set(collection.map((holding) => holding.day));

  return candidates
    .filter((candidate) => !heldDays.has(candidate.day))
    .map((candidate) => {
      const evidence = recommendationEvidence(candidate, collection, palette, proposers, currentDay);
      return {
        day: candidate.day,
        name: candidate.name,
        proposer: candidate.proposer,
        palette: candidate.palette,
        phase: basePaintCanvasPhase(candidate.day, currentDay),
        matchScore: Math.min(100, evidence.reduce((total, entry) => total + entry.weight, 0)),
        evidence
      };
    })
    .filter((candidate) => candidate.evidence.length > 0)
    .sort((a, b) => b.matchScore - a.matchScore || b.day - a.day)
    .slice(0, MAX_RECOMMENDATIONS);
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

  const recentCandidates = isRecord(canvases.recent)
    ? connectionItems(canvases.recent)
        .map((value) => normalizeBasePaintCanvas(value, currentDay))
        .filter((canvas): canvas is BasePaintCanvas => Boolean(canvas))
    : [];

  const collection = holdings.map<BasePaintCollectorHolding>((holding) => {
    const canvas = canvasByDay.get(holding.day);
    return {
      day: holding.day,
      editions: holding.editions,
      name: canvas?.name,
      proposer: canvas?.proposer,
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
  const palette = dominantPalette(collection);
  const signals = collectorSignals(collection);
  const coverage = collectorCoverage(collection, totalCanvasDays);

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
    coverage,
    signals,
    dominantPalette: palette,
    recommendations: collectorRecommendations(
      recentCandidates,
      collection,
      palette,
      signals.themeProposers,
      currentDay
    ),
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
    !isRecord(value.coverage) ||
    !isRecord(value.signals) ||
    !Array.isArray(value.dominantPalette) ||
    !Array.isArray(value.recommendations) ||
    !Array.isArray(value.collection)
  ) {
    return false;
  }


  if (
    !Number.isInteger(value.coverage.sampledCanvasDays) ||
    !Number.isInteger(value.coverage.totalCanvasDays) ||
    !Number.isInteger(value.coverage.samplePercentage) ||
    !Number.isInteger(value.coverage.paletteMetadataDays) ||
    !Number.isInteger(value.coverage.proposerMetadataDays) ||
    !["high", "medium", "low"].includes(String(value.coverage.confidence)) ||
    !Number.isInteger(value.signals.longestHeldDayRun) ||
    !Number.isInteger(value.signals.multipleEditionDays) ||
    !Array.isArray(value.signals.periods) ||
    !Array.isArray(value.signals.themeProposers)
  ) {
    return false;
  }

  const validRecommendations = value.recommendations.every(
    (recommendation) =>
      isRecord(recommendation) &&
      Number.isInteger(recommendation.day) &&
      Number.isInteger(recommendation.matchScore) &&
      ["painting", "collecting", "complete"].includes(String(recommendation.phase)) &&
      Array.isArray(recommendation.palette) &&
      Array.isArray(recommendation.evidence) &&
      recommendation.evidence.every(
        (evidence) =>
          isRecord(evidence) &&
          typeof evidence.code === "string" &&
          typeof evidence.label === "string" &&
          typeof evidence.detail === "string" &&
          Number.isInteger(evidence.weight)
      )
  );
  if (!validRecommendations) return false;

  return value.collection.every(
    (holding) =>
      isRecord(holding) &&
      Number.isInteger(holding.day) &&
      Number.isInteger(holding.editions) &&
      Array.isArray(holding.palette)
  );
}
