import type { IncomingMessage, ServerResponse } from "node:http";
import { normalizeBasePaintCanvasDetail } from "../src/features/basepaint/canvas.js";
import { currentBasePaintDay } from "../src/features/basepaint/data.js";
import type {
  BasePaintCanvasResponse,
  BasePaintErrorResponse
} from "../src/features/basepaint/types.js";

const BASEPAINT_GRAPHQL_ENDPOINT = "https://graphql.basepaint.xyz";
const BASEPAINT_TIMEOUT_MS = 7_000;
const BASEPAINT_CANVAS_CACHE_MS = 60_000;
const BASEPAINT_CANVAS_STALE_MS = 5 * 60_000;
const BASEPAINT_CANVAS_CACHE_LIMIT = 100;
const BASEPAINT_CONTRIBUTOR_LIMIT = 12;
const BASEPAINT_STROKE_LIMIT = 16;
const SUCCESS_CACHE_CONTROL = "public, max-age=0, s-maxage=60, stale-while-revalidate=300";
const ERROR_CACHE_CONTROL = "private, no-store";

const CANVAS_QUERY = `
  query BaseScoutBasePaintCanvas($day: Int!, $contributorLimit: Int!, $strokeLimit: Int!) {
    canvas(id: $day) {
      id
      name
      proposer
      size
      palette
      totalArtists
      pixelsCount
      totalMints
      totalBurns
      totalEarned
      totalEarnedUsd8
    }
    contributions(
      where: { canvasId: $day }
      orderBy: "pixelsCount"
      orderDirection: "desc"
      limit: $contributorLimit
    ) {
      items {
        accountId
        pixelsCount
      }
    }
    strokes(
      where: { canvasId: $day }
      orderBy: "timestamp"
      orderDirection: "desc"
      limit: $strokeLimit
    ) {
      items {
        id
        accountId
        brushId
        pixels
        tx
        timestamp
      }
    }
  }
`;

const canvasCache = new Map<
  number,
  {
    expiresAt: number;
    staleUntil: number;
    value: BasePaintCanvasResponse;
  }
>();

class BasePaintCanvasProviderError extends Error {}
class BasePaintCanvasNotFoundError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function canvasDayFromRequest(request: IncomingMessage, currentDay: number) {
  const url = new URL(request.url ?? "/api/basepaint-canvas", "http://localhost");
  const value = url.searchParams.get("day") ?? "";
  if (!/^[1-9]\d*$/.test(value)) return null;
  const day = Number(value);
  return Number.isSafeInteger(day) && day <= currentDay ? day : null;
}

function safeProviderReason(error: unknown) {
  if (error instanceof BasePaintCanvasProviderError) return error.message;
  return "BasePaint canvas data is temporarily unavailable.";
}

async function fetchCanvasPayload(day: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BASEPAINT_TIMEOUT_MS);

  try {
    const response = await fetch(BASEPAINT_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query: CANVAS_QUERY,
        variables: {
          day,
          contributorLimit: BASEPAINT_CONTRIBUTOR_LIMIT,
          strokeLimit: BASEPAINT_STROKE_LIMIT
        }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new BasePaintCanvasProviderError(`BasePaint indexer returned HTTP ${response.status}.`);
    }

    const payload = (await response.json()) as unknown;
    if (isRecord(payload) && Array.isArray(payload.errors) && payload.errors.length) {
      throw new BasePaintCanvasProviderError("BasePaint indexer rejected the canvas query.");
    }
    return payload;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new BasePaintCanvasProviderError("BasePaint canvas request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function buildBasePaintCanvas(day: number, now = Date.now()) {
  const currentDay = currentBasePaintDay(now);
  const payload = await fetchCanvasPayload(day);
  const canvas = normalizeBasePaintCanvasDetail(payload, day, currentDay, now);
  if (!canvas) {
    throw new BasePaintCanvasNotFoundError(`BasePaint day #${day} was not found.`);
  }
  return canvas;
}

function trimCanvasCache() {
  while (canvasCache.size >= BASEPAINT_CANVAS_CACHE_LIMIT) {
    const oldestKey = canvasCache.keys().next().value as number | undefined;
    if (oldestKey === undefined) break;
    canvasCache.delete(oldestKey);
  }
}

async function getBasePaintCanvas(day: number, now = Date.now()) {
  const cached = canvasCache.get(day);
  if (cached && cached.expiresAt > now) return cached.value;

  try {
    const value = await buildBasePaintCanvas(day, now);
    trimCanvasCache();
    canvasCache.set(day, {
      expiresAt: now + BASEPAINT_CANVAS_CACHE_MS,
      staleUntil: now + BASEPAINT_CANVAS_STALE_MS,
      value
    });
    return value;
  } catch (error) {
    if (!(error instanceof BasePaintCanvasNotFoundError) && cached?.staleUntil && cached.staleUntil > now) {
      return cached.value;
    }
    throw error;
  }
}

export function cacheControlForBasePaintCanvasStatus(status: number) {
  return status >= 200 && status < 300 ? SUCCESS_CACHE_CONTROL : ERROR_CACHE_CONTROL;
}

export function clearBasePaintCanvasCacheForTests() {
  canvasCache.clear();
}

function sendJson(
  response: ServerResponse,
  status: number,
  payload: BasePaintCanvasResponse | BasePaintErrorResponse
) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", cacheControlForBasePaintCanvasStatus(status));
  response.statusCode = status;
  response.end(JSON.stringify(payload));
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    sendJson(response, 405, {
      error: "Method not allowed.",
      errorCode: "method_not_allowed"
    });
    return;
  }

  const now = Date.now();
  const day = canvasDayFromRequest(request, currentBasePaintDay(now));
  if (!day) {
    sendJson(response, 400, {
      error: "Enter a valid BasePaint day that is not in the future.",
      errorCode: "invalid_day"
    });
    return;
  }

  try {
    sendJson(response, 200, await getBasePaintCanvas(day, now));
  } catch (error) {
    if (error instanceof BasePaintCanvasNotFoundError) {
      sendJson(response, 404, {
        error: error.message,
        errorCode: "canvas_not_found"
      });
      return;
    }

    console.error("[BaseScout] BasePaint canvas API failed", error);
    sendJson(response, 502, {
      error: safeProviderReason(error),
      errorCode: "provider_error"
    });
  }
}
