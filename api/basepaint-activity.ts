import type { IncomingMessage, ServerResponse } from "node:http";
import { currentBasePaintDay } from "../src/features/basepaint/data.js";
import { normalizeBasePaintPulse } from "../src/features/basepaint/pulse.js";
import type { BasePaintErrorResponse, BasePaintPulseResponse } from "../src/features/basepaint/types.js";

const BASEPAINT_GRAPHQL_ENDPOINT = "https://graphql.basepaint.xyz";
const BASEPAINT_TIMEOUT_MS = 7_000;
const BASEPAINT_ACTIVITY_CACHE_MS = 20_000;
const BASEPAINT_ACTIVITY_STALE_MS = 5 * 60_000;
const BASEPAINT_ACTIVITY_LIMIT = 250;
const SUCCESS_CACHE_CONTROL = "public, max-age=0, s-maxage=20, stale-while-revalidate=120";
const ERROR_CACHE_CONTROL = "private, no-store";

const ACTIVITY_QUERY = `
  query BaseScoutBasePaintActivity($day: Int!, $since: Int!, $limit: Int!) {
    canvas(id: $day) {
      size
    }
    strokes(
      where: { canvasId: $day, timestamp_gte: $since }
      orderBy: "timestamp"
      orderDirection: "desc"
      limit: $limit
    ) {
      items {
        canvasId
        accountId
        data
        timestamp
      }
    }
  }
`;

let activityCache:
  | {
      day: number;
      expiresAt: number;
      staleUntil: number;
      value: BasePaintPulseResponse;
    }
  | undefined;

class BasePaintActivityError extends Error {
  constructor(message: string) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeReason(error: unknown) {
  if (error instanceof BasePaintActivityError) return error.message;
  return "Live BasePaint activity is temporarily unavailable.";
}

function canvasSizeFromPayload(value: unknown, currentDay: number) {
  if (
    isRecord(value) &&
    isRecord(value.data) &&
    isRecord(value.data.canvas) &&
    Number.isFinite(Number(value.data.canvas.size))
  ) {
    const size = Math.trunc(Number(value.data.canvas.size));
    if (size > 0 && size <= 256) return size;
  }
  return currentDay >= 366 ? 256 : 144;
}

function strokeCountFromPayload(value: unknown) {
  if (!isRecord(value) || !isRecord(value.data) || !isRecord(value.data.strokes)) return 0;
  return Array.isArray(value.data.strokes.items) ? value.data.strokes.items.length : 0;
}

async function fetchActivityPayload(day: number, now: number) {
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
        query: ACTIVITY_QUERY,
        variables: {
          day,
          since: Math.floor(now / 1000) - 60 * 60,
          limit: BASEPAINT_ACTIVITY_LIMIT
        }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new BasePaintActivityError(`BasePaint indexer returned HTTP ${response.status}.`);
    }

    const payload = (await response.json()) as unknown;
    if (isRecord(payload) && Array.isArray(payload.errors) && payload.errors.length) {
      throw new BasePaintActivityError("BasePaint indexer rejected the activity query.");
    }
    return payload;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new BasePaintActivityError("BasePaint activity request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function buildBasePaintActivity(now = Date.now()) {
  const currentDay = currentBasePaintDay(now);
  const payload = await fetchActivityPayload(currentDay, now);
  const pulse = normalizeBasePaintPulse(
    payload,
    currentDay,
    canvasSizeFromPayload(payload, currentDay),
    now,
    strokeCountFromPayload(payload) >= BASEPAINT_ACTIVITY_LIMIT
  );
  if (!pulse) {
    throw new BasePaintActivityError("BasePaint indexer returned an incomplete activity response.");
  }
  return pulse;
}

async function getBasePaintActivity(now = Date.now()) {
  const currentDay = currentBasePaintDay(now);
  if (activityCache?.day === currentDay && activityCache.expiresAt > now) {
    return activityCache.value;
  }

  try {
    const value = await buildBasePaintActivity(now);
    activityCache = {
      day: currentDay,
      expiresAt: now + BASEPAINT_ACTIVITY_CACHE_MS,
      staleUntil: now + BASEPAINT_ACTIVITY_STALE_MS,
      value
    };
    return value;
  } catch (error) {
    if (activityCache?.day === currentDay && activityCache.staleUntil > now) {
      return {
        ...activityCache.value,
        generatedAt: now,
        stale: true
      };
    }
    throw error;
  }
}

export function cacheControlForBasePaintActivityStatus(status: number) {
  return status >= 200 && status < 300 ? SUCCESS_CACHE_CONTROL : ERROR_CACHE_CONTROL;
}

export function clearBasePaintActivityCacheForTests() {
  activityCache = undefined;
}

function sendJson(
  response: ServerResponse,
  status: number,
  payload: BasePaintPulseResponse | BasePaintErrorResponse
) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", cacheControlForBasePaintActivityStatus(status));
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

  try {
    sendJson(response, 200, await getBasePaintActivity());
  } catch (error) {
    console.error("[BaseScout] BasePaint activity API failed", error);
    sendJson(response, 502, {
      error: safeReason(error),
      errorCode: "provider_error"
    });
  }
}
