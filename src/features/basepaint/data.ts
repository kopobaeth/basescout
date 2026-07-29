import type { BasePaintCanvas, BasePaintOverviewResponse, BasePaintTheme } from "./types";

export const BASEPAINT_DAY_ONE_START_MS = 1_691_599_315_000;
export const BASEPAINT_DAY_DURATION_MS = 86_400_000;
export const BASEPAINT_MAX_GALLERY_ITEMS = 20;

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

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

function positiveInteger(value: unknown, fallback: number) {
  const parsed = finiteInteger(value, fallback);
  return parsed > 0 ? parsed : fallback;
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function integerString(value: unknown) {
  const text = typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
  return /^\d+$/.test(text) ? text : "0";
}

export function currentBasePaintDay(nowMs = Date.now()) {
  return Math.max(1, Math.floor((nowMs - BASEPAINT_DAY_ONE_START_MS) / BASEPAINT_DAY_DURATION_MS) + 1);
}

export function basePaintPhaseEndsAt(day: number) {
  return BASEPAINT_DAY_ONE_START_MS + Math.max(1, Math.trunc(day)) * BASEPAINT_DAY_DURATION_MS;
}

export function normalizeBasePaintPalette(value: unknown) {
  const entries = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return entries
    .map((color) => (typeof color === "string" ? color.trim() : ""))
    .filter((color, index, colors) => HEX_COLOR_PATTERN.test(color) && colors.indexOf(color) === index)
    .slice(0, 32);
}

export function normalizeBasePaintTheme(value: unknown, day: number): BasePaintTheme | null {
  if (!isRecord(value)) return null;

  const theme = textValue(value.theme);
  const size = positiveInteger(value.size, day >= 366 ? 256 : 144);
  const palette = normalizeBasePaintPalette(value.palette);
  if (!theme || !palette.length) return null;

  return {
    day,
    theme,
    proposer: textValue(value.proposer),
    size,
    palette
  };
}

export function normalizeBasePaintCanvas(value: unknown, currentDay: number): BasePaintCanvas | null {
  if (!isRecord(value)) return null;

  const day = finiteInteger(value.id);
  if (day < 1 || day > currentDay) return null;

  const size = positiveInteger(value.size, day >= 366 ? 256 : 144);
  return {
    day,
    name: textValue(value.name),
    proposer: textValue(value.proposer),
    size,
    palette: normalizeBasePaintPalette(value.palette),
    totalArtists: finiteInteger(value.totalArtists),
    pixelsCount: finiteInteger(value.pixelsCount),
    totalMints: finiteInteger(value.totalMints),
    totalBurns: finiteInteger(value.totalBurns),
    totalEarnedWei: integerString(value.totalEarned),
    totalEarnedUsd8: integerString(value.totalEarnedUsd8)
  };
}

export function normalizeBasePaintCanvases(value: unknown, currentDay: number) {
  if (!isRecord(value) || !isRecord(value.data) || !isRecord(value.data.canvass)) return [];
  const items = Array.isArray(value.data.canvass.items) ? value.data.canvass.items : [];
  const seen = new Set<number>();

  return items
    .map((item) => normalizeBasePaintCanvas(item, currentDay))
    .filter((canvas): canvas is BasePaintCanvas => {
      if (!canvas || seen.has(canvas.day)) return false;
      seen.add(canvas.day);
      return true;
    })
    .sort((a, b) => b.day - a.day)
    .slice(0, BASEPAINT_MAX_GALLERY_ITEMS);
}

export function basePaintArtworkUrl(day: number) {
  return `https://basepaint.net/v3/${String(Math.max(1, Math.trunc(day))).padStart(4, "0")}.png`;
}

export function basePaintCanvasUrl(day: number) {
  return `https://basepaint.xyz/canvas/${Math.max(1, Math.trunc(day))}`;
}

export function basePaintArtistUrl(address: string) {
  return `/basepaint/artist/${encodeURIComponent(address)}`;
}

export function basePaintArtistRouteAddress(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 3 || segments[0] !== "basepaint" || segments[1] !== "artist") {
    return undefined;
  }

  try {
    return decodeURIComponent(segments[2]);
  } catch {
    return "";
  }
}

export function isBasePaintOverviewResponse(value: unknown): value is BasePaintOverviewResponse {
  if (!isRecord(value) || value.source !== "basepaint") return false;
  if (!Number.isInteger(value.currentDay) || !Number.isFinite(value.generatedAt) || !Number.isFinite(value.phaseEndsAt)) {
    return false;
  }
  if (!isRecord(value.providers) || !Array.isArray(value.canvases)) return false;
  return value.canvases.every((canvas) => isRecord(canvas) && Number.isInteger(canvas.day));
}
