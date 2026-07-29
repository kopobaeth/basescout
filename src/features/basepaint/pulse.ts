import type {
  BasePaintHeatCell,
  BasePaintPulseArtist,
  BasePaintPulseResponse,
  BasePaintPulseWindow
} from "./types";

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const PIXEL_DATA_PATTERN = /^0x(?:[0-9a-fA-F]{6})+$/;
const PULSE_RANGE_MINUTES = 60;
const PULSE_GRID_SIZE = 8;
const MAX_STROKE_PIXELS = 65_536;

type BasePaintStroke = {
  canvasId: number;
  accountId: string;
  data: string;
  timestamp: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function finiteInteger(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number.parseInt(value, 10)
        : Number.NaN;
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function normalizeStroke(value: unknown, currentDay: number): BasePaintStroke | null {
  if (!isRecord(value)) return null;

  const canvasId = finiteInteger(value.canvasId);
  const timestamp = finiteInteger(value.timestamp);
  const accountId = typeof value.accountId === "string" ? value.accountId : "";
  const data = typeof value.data === "string" ? value.data : "";
  const pixelCount = data.startsWith("0x") ? (data.length - 2) / 6 : 0;

  if (
    canvasId !== currentDay ||
    !timestamp ||
    !ADDRESS_PATTERN.test(accountId) ||
    !PIXEL_DATA_PATTERN.test(data) ||
    !Number.isInteger(pixelCount) ||
    pixelCount < 1 ||
    pixelCount > MAX_STROKE_PIXELS
  ) {
    return null;
  }

  return {
    canvasId,
    accountId,
    data,
    timestamp
  };
}

function windowFor(strokes: BasePaintStroke[], minutes: 5 | 30 | 60, nowSeconds: number): BasePaintPulseWindow {
  const threshold = nowSeconds - minutes * 60;
  const matching = strokes.filter((stroke) => stroke.timestamp >= threshold);

  return {
    minutes,
    artists: new Set(matching.map((stroke) => stroke.accountId)).size,
    strokes: matching.length,
    pixels: matching.reduce((total, stroke) => total + (stroke.data.length - 2) / 6, 0)
  };
}

function topArtistsFor(strokes: BasePaintStroke[]): BasePaintPulseArtist[] {
  const artists = new Map<string, BasePaintPulseArtist>();

  for (const stroke of strokes) {
    const existing = artists.get(stroke.accountId);
    const pixels = (stroke.data.length - 2) / 6;
    if (existing) {
      existing.pixels += pixels;
      existing.strokes += 1;
      existing.lastActiveAt = Math.max(existing.lastActiveAt, stroke.timestamp * 1000);
    } else {
      artists.set(stroke.accountId, {
        address: stroke.accountId,
        pixels,
        strokes: 1,
        lastActiveAt: stroke.timestamp * 1000
      });
    }
  }

  return [...artists.values()]
    .sort((left, right) => right.pixels - left.pixels || right.lastActiveAt - left.lastActiveAt)
    .slice(0, 6);
}

function heatmapFor(strokes: BasePaintStroke[], canvasSize: number) {
  const cells = new Map<string, BasePaintHeatCell>();
  const paletteCounts = new Map<number, number>();

  for (const stroke of strokes) {
    for (let offset = 2; offset < stroke.data.length; offset += 6) {
      const x = Number.parseInt(stroke.data.slice(offset, offset + 2), 16);
      const y = Number.parseInt(stroke.data.slice(offset + 2, offset + 4), 16);
      const paletteIndex = Number.parseInt(stroke.data.slice(offset + 4, offset + 6), 16);
      if (x >= canvasSize || y >= canvasSize) continue;

      const cellX = Math.min(PULSE_GRID_SIZE - 1, Math.floor((x / canvasSize) * PULSE_GRID_SIZE));
      const cellY = Math.min(PULSE_GRID_SIZE - 1, Math.floor((y / canvasSize) * PULSE_GRID_SIZE));
      const key = `${cellX}:${cellY}`;
      const existing = cells.get(key);
      if (existing) {
        existing.pixels += 1;
      } else {
        cells.set(key, { x: cellX, y: cellY, pixels: 1 });
      }
      paletteCounts.set(paletteIndex, (paletteCounts.get(paletteIndex) ?? 0) + 1);
    }
  }

  const dominantPaletteIndex =
    [...paletteCounts.entries()].sort((left, right) => right[1] - left[1] || left[0] - right[0])[0]?.[0] ?? null;

  return {
    cells: [...cells.values()].sort((left, right) => left.y - right.y || left.x - right.x),
    dominantPaletteIndex
  };
}

export function normalizeBasePaintPulse(
  value: unknown,
  currentDay: number,
  canvasSize: number,
  nowMs = Date.now(),
  truncated = false
): BasePaintPulseResponse | null {
  if (!isRecord(value) || !isRecord(value.data) || !isRecord(value.data.strokes)) return null;
  const items = Array.isArray(value.data.strokes.items) ? value.data.strokes.items : null;
  if (!items) return null;

  const safeCanvasSize = Math.min(256, Math.max(1, finiteInteger(canvasSize) || 256));
  const nowSeconds = Math.floor(nowMs / 1000);
  const rangeStart = nowSeconds - PULSE_RANGE_MINUTES * 60;
  const strokes = items
    .map((item) => normalizeStroke(item, currentDay))
    .filter(
      (stroke): stroke is BasePaintStroke =>
        stroke !== null && stroke.timestamp >= rangeStart && stroke.timestamp <= nowSeconds + 30
    );
  const heatmap = heatmapFor(strokes, safeCanvasSize);

  return {
    source: "basepaint",
    attribution: "Public onchain data by BasePaint",
    generatedAt: nowMs,
    currentDay,
    rangeMinutes: PULSE_RANGE_MINUTES,
    refreshSeconds: 30,
    stale: false,
    truncated,
    latestStrokeAt: strokes.length ? Math.max(...strokes.map((stroke) => stroke.timestamp)) * 1000 : null,
    dominantPaletteIndex: heatmap.dominantPaletteIndex,
    windows: [
      windowFor(strokes, 5, nowSeconds),
      windowFor(strokes, 30, nowSeconds),
      windowFor(strokes, 60, nowSeconds)
    ],
    topArtists: topArtistsFor(strokes),
    heatmap: {
      gridSize: PULSE_GRID_SIZE,
      canvasSize: safeCanvasSize,
      cells: heatmap.cells
    }
  };
}

export function isBasePaintPulseResponse(value: unknown): value is BasePaintPulseResponse {
  if (!isRecord(value) || value.source !== "basepaint") return false;
  if (
    !Number.isInteger(value.currentDay) ||
    !Number.isFinite(value.generatedAt) ||
    value.rangeMinutes !== 60 ||
    !Array.isArray(value.windows) ||
    value.windows.length !== 3 ||
    !Array.isArray(value.topArtists) ||
    !isRecord(value.heatmap) ||
    !Array.isArray(value.heatmap.cells)
  ) {
    return false;
  }
  return value.windows.every(
    (window) =>
      isRecord(window) &&
      Number.isInteger(window.minutes) &&
      Number.isInteger(window.artists) &&
      Number.isInteger(window.strokes) &&
      Number.isInteger(window.pixels)
  );
}
