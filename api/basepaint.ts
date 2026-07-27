import type { IncomingMessage, ServerResponse } from "node:http";
import {
  BASEPAINT_MAX_GALLERY_ITEMS,
  basePaintPhaseEndsAt,
  currentBasePaintDay,
  normalizeBasePaintCanvases,
  normalizeBasePaintTheme
} from "../src/features/basepaint/data";
import type {
  BasePaintErrorResponse,
  BasePaintOverviewResponse,
  BasePaintProviderState
} from "../src/features/basepaint/types";

const BASEPAINT_GRAPHQL_ENDPOINT = "https://graphql.basepaint.xyz";
const BASEPAINT_THEME_ENDPOINT = "https://basepaint.xyz/api/theme";
const BASEPAINT_TIMEOUT_MS = 7_000;
const BASEPAINT_CACHE_MS = 60_000;
const DEFAULT_GALLERY_ITEMS = 14;
const SUCCESS_CACHE_CONTROL = "public, max-age=0, s-maxage=60, stale-while-revalidate=300";
const ERROR_CACHE_CONTROL = "private, no-store";

const OVERVIEW_QUERY = `
  query BaseScoutBasePaintOverview($limit: Int!) {
    canvass(orderBy: "id", orderDirection: "desc", limit: $limit) {
      items {
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
    }
  }
`;

const overviewCache = new Map<number, { expiresAt: number; value: BasePaintOverviewResponse }>();

class BasePaintProviderError extends Error {
  constructor(message: string) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeProviderReason(error: unknown) {
  if (error instanceof BasePaintProviderError) return error.message;
  if (error instanceof Error && error.name === "AbortError") return "Request timed out.";
  return "Provider request failed.";
}

function providerState(result: PromiseSettledResult<unknown>): BasePaintProviderState {
  return result.status === "fulfilled"
    ? { status: "available" }
    : { status: "unavailable", reason: safeProviderReason(result.reason) };
}

function galleryLimitFromRequest(request: IncomingMessage) {
  const url = new URL(request.url ?? "/api/basepaint", "http://localhost");
  const requested = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  if (!Number.isFinite(requested)) return DEFAULT_GALLERY_ITEMS;
  return Math.min(BASEPAINT_MAX_GALLERY_ITEMS, Math.max(4, requested));
}

async function fetchJson(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BASEPAINT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        ...init?.headers
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new BasePaintProviderError(`Provider returned HTTP ${response.status}.`);
    }

    return (await response.json()) as unknown;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new BasePaintProviderError("Provider request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchBasePaintCanvases(limit: number) {
  const payload = await fetchJson(BASEPAINT_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query: OVERVIEW_QUERY,
      variables: { limit }
    })
  });

  if (
    !isRecord(payload) ||
    !isRecord(payload.data) ||
    !isRecord(payload.data.canvass) ||
    !Array.isArray(payload.data.canvass.items)
  ) {
    throw new BasePaintProviderError("Indexer returned an incomplete response.");
  }

  return payload;
}

function fetchBasePaintTheme(day: number) {
  return fetchJson(`${BASEPAINT_THEME_ENDPOINT}/${day}`);
}

async function buildBasePaintOverview(limit: number, now = Date.now()): Promise<BasePaintOverviewResponse> {
  const currentDay = currentBasePaintDay(now);
  const [indexerResult, themeResult] = await Promise.allSettled([
    fetchBasePaintCanvases(limit),
    fetchBasePaintTheme(currentDay)
  ]);

  if (indexerResult.status === "rejected" && themeResult.status === "rejected") {
    throw new BasePaintProviderError("BasePaint public data providers are currently unavailable.");
  }

  const canvases =
    indexerResult.status === "fulfilled"
      ? normalizeBasePaintCanvases(indexerResult.value, currentDay).slice(0, limit)
      : [];
  const theme =
    themeResult.status === "fulfilled"
      ? normalizeBasePaintTheme(themeResult.value, currentDay)
      : null;

  return {
    source: "basepaint",
    attribution: "Public onchain data by BasePaint",
    artworkLicense: "CC0",
    generatedAt: now,
    currentDay,
    phaseEndsAt: basePaintPhaseEndsAt(currentDay),
    cacheSeconds: Math.floor(BASEPAINT_CACHE_MS / 1000),
    partial: indexerResult.status === "rejected" || themeResult.status === "rejected" || !theme,
    providers: {
      indexer: providerState(indexerResult),
      theme: theme ? providerState(themeResult) : { status: "unavailable", reason: "Theme response was incomplete." }
    },
    theme,
    canvases
  };
}

async function getBasePaintOverview(limit: number) {
  const cached = overviewCache.get(limit);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const value = await buildBasePaintOverview(limit);
  overviewCache.set(limit, {
    expiresAt: Date.now() + BASEPAINT_CACHE_MS,
    value
  });
  return value;
}

export function cacheControlForBasePaintStatus(status: number) {
  return status >= 200 && status < 300 ? SUCCESS_CACHE_CONTROL : ERROR_CACHE_CONTROL;
}

export function clearBasePaintCacheForTests() {
  overviewCache.clear();
}

function sendJson(
  response: ServerResponse,
  status: number,
  payload: BasePaintOverviewResponse | BasePaintErrorResponse
) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", cacheControlForBasePaintStatus(status));
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
    sendJson(response, 200, await getBasePaintOverview(galleryLimitFromRequest(request)));
  } catch (error) {
    console.error("[BaseScout] BasePaint API failed", error);
    sendJson(response, 502, {
      error: safeProviderReason(error),
      errorCode: "provider_error"
    });
  }
}
