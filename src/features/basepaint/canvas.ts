import {
  basePaintCanvasPhase,
  basePaintPhaseEndsAt,
  normalizeBasePaintCanvas
} from "./data.js";
import type {
  BasePaintCanvasContributor,
  BasePaintCanvasResponse,
  BasePaintCanvasStroke
} from "./types";

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const TRANSACTION_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const INTEGER_PATTERN = /^\d+$/;
const MAX_CONTRIBUTORS = 12;
const MAX_RECENT_STROKES = 16;

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

function normalizeContributors(value: unknown): BasePaintCanvasContributor[] {
  if (!isRecord(value) || !Array.isArray(value.items)) return [];
  const seen = new Set<string>();

  return value.items
    .map((item): BasePaintCanvasContributor | null => {
      if (!isRecord(item)) return null;
      const address = typeof item.accountId === "string" ? item.accountId : "";
      const pixelsCount = finiteInteger(item.pixelsCount);
      const key = address.toLowerCase();
      if (!ADDRESS_PATTERN.test(address) || pixelsCount < 1 || seen.has(key)) return null;
      seen.add(key);
      return { address, pixelsCount };
    })
    .filter((contributor): contributor is BasePaintCanvasContributor => contributor !== null)
    .sort((left, right) => right.pixelsCount - left.pixelsCount)
    .slice(0, MAX_CONTRIBUTORS);
}

function normalizeStrokes(value: unknown): BasePaintCanvasStroke[] {
  if (!isRecord(value) || !Array.isArray(value.items)) return [];
  const seen = new Set<string>();

  return value.items
    .map((item): BasePaintCanvasStroke | null => {
      if (!isRecord(item)) return null;
      const id =
        typeof item.id === "string"
          ? item.id
          : typeof item.id === "number"
            ? String(item.id)
            : "";
      const address = typeof item.accountId === "string" ? item.accountId : "";
      const transactionHash = typeof item.tx === "string" ? item.tx : "";
      const paintedAtSeconds = finiteInteger(item.timestamp);
      const pixelsCount = finiteInteger(item.pixels);
      if (
        !INTEGER_PATTERN.test(id) ||
        seen.has(id) ||
        !ADDRESS_PATTERN.test(address) ||
        !TRANSACTION_PATTERN.test(transactionHash) ||
        paintedAtSeconds < 1 ||
        pixelsCount < 1
      ) {
        return null;
      }

      seen.add(id);
      return {
        id,
        address,
        brushId: finiteInteger(item.brushId),
        pixelsCount,
        transactionHash,
        paintedAt: paintedAtSeconds * 1000
      };
    })
    .filter((stroke): stroke is BasePaintCanvasStroke => stroke !== null)
    .sort((left, right) => right.paintedAt - left.paintedAt)
    .slice(0, MAX_RECENT_STROKES);
}

export function normalizeBasePaintCanvasDetail(
  value: unknown,
  requestedDay: number,
  currentDay: number,
  nowMs = Date.now()
): BasePaintCanvasResponse | null {
  if (!isRecord(value) || !isRecord(value.data)) return null;
  const canvas = normalizeBasePaintCanvas(value.data.canvas, currentDay);
  if (!canvas || canvas.day !== requestedDay) return null;

  const phase = basePaintCanvasPhase(canvas.day, currentDay);
  return {
    source: "basepaint",
    attribution: "Public onchain data by BasePaint",
    artworkLicense: "CC0",
    generatedAt: nowMs,
    currentDay,
    cacheSeconds: 60,
    phase,
    phaseEndsAt:
      phase === "painting"
        ? basePaintPhaseEndsAt(canvas.day)
        : phase === "collecting"
          ? basePaintPhaseEndsAt(canvas.day + 1)
          : null,
    canvas,
    topContributors: normalizeContributors(value.data.contributions),
    recentStrokes: normalizeStrokes(value.data.strokes),
    recentStrokeLimit: MAX_RECENT_STROKES
  };
}

export function isBasePaintCanvasResponse(value: unknown): value is BasePaintCanvasResponse {
  if (!isRecord(value) || value.source !== "basepaint" || !isRecord(value.canvas)) return false;
  return (
    Number.isInteger(value.currentDay) &&
    Number.isFinite(value.generatedAt) &&
    Number.isInteger(value.canvas.day) &&
    Array.isArray(value.topContributors) &&
    Array.isArray(value.recentStrokes) &&
    Number.isInteger(value.recentStrokeLimit) &&
    (value.phase === "painting" || value.phase === "collecting" || value.phase === "complete")
  );
}
