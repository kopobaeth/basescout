import type { IncomingMessage, ServerResponse } from "node:http";
import { getAddress, type Address, zeroAddress } from "viem";
import { normalizeBasePaintArtist } from "../src/features/basepaint/artist.js";
import { currentBasePaintDay } from "../src/features/basepaint/data.js";
import type {
  BasePaintArtistResponse,
  BasePaintErrorResponse
} from "../src/features/basepaint/types.js";

const BASEPAINT_GRAPHQL_ENDPOINT = "https://graphql.basepaint.xyz";
const BASEPAINT_TIMEOUT_MS = 7_000;
const BASEPAINT_ARTIST_CACHE_MS = 60_000;
const BASEPAINT_ARTIST_STALE_MS = 5 * 60_000;
const BASEPAINT_ARTIST_CACHE_LIMIT = 100;
const BASEPAINT_CONTRIBUTION_LIMIT = 12;
const BASEPAINT_BRUSH_LIMIT = 6;
const SUCCESS_CACHE_CONTROL = "public, max-age=0, s-maxage=60, stale-while-revalidate=300";
const ERROR_CACHE_CONTROL = "private, no-store";

const ARTIST_QUERY = `
  query BaseScoutBasePaintArtist($address: String!, $contributionLimit: Int!, $brushLimit: Int!) {
    account(id: $address) {
      id
      totalPixels
      totalWithdrawn
      totalEarned
      streak
      longestStreak
      lastPaintedDay
      totalDaysPainted
    }
    contributions(
      where: { accountId: $address }
      orderBy: "canvasId"
      orderDirection: "desc"
      limit: $contributionLimit
    ) {
      items {
        canvasId
        pixelsCount
      }
    }
    brushs(
      where: { ownerId: $address }
      orderBy: "strength"
      orderDirection: "desc"
      limit: $brushLimit
    ) {
      items {
        id
        strength
        streak
        lastUsedDay
        lastUsedTimestamp
      }
    }
  }
`;

const artistCache = new Map<
  string,
  {
    expiresAt: number;
    staleUntil: number;
    value: BasePaintArtistResponse;
  }
>();

class BasePaintArtistProviderError extends Error {}
class BasePaintArtistNotFoundError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function checksummedAddress(value: string | null) {
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value)) return null;
  try {
    const address = getAddress(value.toLowerCase() as Address);
    return address === zeroAddress ? null : address;
  } catch {
    return null;
  }
}

function artistAddressFromRequest(request: IncomingMessage) {
  const url = new URL(request.url ?? "/api/basepaint-artist", "http://localhost");
  return checksummedAddress(url.searchParams.get("address"));
}

function safeProviderReason(error: unknown) {
  if (error instanceof BasePaintArtistProviderError) return error.message;
  return "BasePaint artist data is temporarily unavailable.";
}

async function fetchArtistPayload(address: string) {
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
        query: ARTIST_QUERY,
        variables: {
          address,
          contributionLimit: BASEPAINT_CONTRIBUTION_LIMIT,
          brushLimit: BASEPAINT_BRUSH_LIMIT
        }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new BasePaintArtistProviderError(`BasePaint indexer returned HTTP ${response.status}.`);
    }

    const payload = (await response.json()) as unknown;
    if (isRecord(payload) && Array.isArray(payload.errors) && payload.errors.length) {
      throw new BasePaintArtistProviderError("BasePaint indexer rejected the artist query.");
    }
    return payload;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new BasePaintArtistProviderError("BasePaint artist request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function buildBasePaintArtist(address: string, now = Date.now()) {
  const payload = await fetchArtistPayload(address);
  const artist = normalizeBasePaintArtist(payload, address, currentBasePaintDay(now), now);
  if (!artist) {
    throw new BasePaintArtistNotFoundError("No BasePaint artist was found for this address.");
  }
  return artist;
}

function trimArtistCache() {
  while (artistCache.size >= BASEPAINT_ARTIST_CACHE_LIMIT) {
    const oldestKey = artistCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    artistCache.delete(oldestKey);
  }
}

async function getBasePaintArtist(address: string, now = Date.now()) {
  const key = address.toLowerCase();
  const cached = artistCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  try {
    const value = await buildBasePaintArtist(address, now);
    trimArtistCache();
    artistCache.set(key, {
      expiresAt: now + BASEPAINT_ARTIST_CACHE_MS,
      staleUntil: now + BASEPAINT_ARTIST_STALE_MS,
      value
    });
    return value;
  } catch (error) {
    if (!(error instanceof BasePaintArtistNotFoundError) && cached?.staleUntil && cached.staleUntil > now) {
      return cached.value;
    }
    throw error;
  }
}

export function cacheControlForBasePaintArtistStatus(status: number) {
  return status >= 200 && status < 300 ? SUCCESS_CACHE_CONTROL : ERROR_CACHE_CONTROL;
}

export function clearBasePaintArtistCacheForTests() {
  artistCache.clear();
}

function sendJson(
  response: ServerResponse,
  status: number,
  payload: BasePaintArtistResponse | BasePaintErrorResponse
) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", cacheControlForBasePaintArtistStatus(status));
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

  const address = artistAddressFromRequest(request);
  if (!address) {
    sendJson(response, 400, {
      error: "Enter a valid non-zero Base address.",
      errorCode: "invalid_address"
    });
    return;
  }

  try {
    sendJson(response, 200, await getBasePaintArtist(address));
  } catch (error) {
    if (error instanceof BasePaintArtistNotFoundError) {
      sendJson(response, 404, {
        error: error.message,
        errorCode: "artist_not_found"
      });
      return;
    }

    console.error("[BaseScout] BasePaint artist API failed", error);
    sendJson(response, 502, {
      error: safeProviderReason(error),
      errorCode: "provider_error"
    });
  }
}
