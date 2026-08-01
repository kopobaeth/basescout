import type { IncomingMessage, ServerResponse } from "node:http";
import { getAddress, type Address, zeroAddress } from "viem";
import {
  collectorHoldingDays,
  normalizeBasePaintCollector
} from "../src/features/basepaint/collector.js";
import { currentBasePaintDay } from "../src/features/basepaint/data.js";
import type {
  BasePaintCollectorResponse,
  BasePaintErrorResponse
} from "../src/features/basepaint/types.js";

const BASEPAINT_GRAPHQL_ENDPOINT = "https://graphql.basepaint.xyz";
const BASEPAINT_CONTRACT = "0xBa5e05cb26b78eDa3A2f8e3b3814726305dcAc83";
const BASEPAINT_TIMEOUT_MS = 7_000;
const BASEPAINT_COLLECTOR_CACHE_MS = 60_000;
const BASEPAINT_COLLECTOR_STALE_MS = 5 * 60_000;
const BASEPAINT_COLLECTOR_CACHE_LIMIT = 100;
export const BASEPAINT_COLLECTOR_SAMPLE_LIMIT = 48;
const SUCCESS_CACHE_CONTROL = "public, max-age=0, s-maxage=60, stale-while-revalidate=300";
const ERROR_CACHE_CONTROL = "private, no-store";

const COLLECTOR_QUERY = `
  query BaseScoutBasePaintCollector($address: String!, $contract: String!, $limit: Int!) {
    holdings: balances(
      where: { ownerId: $address, contract: $contract, value_gt: 0 }
      orderBy: "tokenId"
      orderDirection: "desc"
      limit: $limit
    ) {
      items { tokenId value }
      totalCount
      pageInfo { hasNextPage }
    }
    oldest: balances(
      where: { ownerId: $address, contract: $contract, value_gt: 0 }
      orderBy: "tokenId"
      orderDirection: "asc"
      limit: 1
    ) {
      items { tokenId }
    }
    totalBalances(
      where: { ownerId: $address, contract: $contract, value_gt: 0 }
      limit: 1
    ) {
      items { value }
    }
  }
`;

const COLLECTOR_CANVASES_QUERY = `
  query BaseScoutBasePaintCollectorCanvases($days: [Int!]!, $limit: Int!) {
    canvass(
      where: { id_in: $days }
      orderBy: "id"
      orderDirection: "desc"
      limit: $limit
    ) {
      items {
        id
        name
        palette
        proposer
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

const collectorCache = new Map<
  string,
  {
    expiresAt: number;
    staleUntil: number;
    value: BasePaintCollectorResponse;
  }
>();

class BasePaintCollectorProviderError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function checksummedCollectorAddress(value: string | null) {
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value)) return null;
  try {
    const address = getAddress(value.toLowerCase() as Address);
    return address === zeroAddress ? null : address;
  } catch {
    return null;
  }
}

function collectorAddressFromRequest(request: IncomingMessage) {
  const url = new URL(request.url ?? "/api/basepaint-collector", "http://localhost");
  return checksummedCollectorAddress(url.searchParams.get("address"));
}

function safeProviderReason(error: unknown) {
  if (error instanceof BasePaintCollectorProviderError) return error.message;
  return "BasePaint collector data is temporarily unavailable.";
}

async function fetchGraphqlPayload(
  query: string,
  variables: Record<string, unknown>,
  signal: AbortSignal
) {
  const response = await fetch(BASEPAINT_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query, variables }),
    signal
  });

  if (!response.ok) {
    throw new BasePaintCollectorProviderError(`BasePaint indexer returned HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as unknown;
  if (isRecord(payload) && Array.isArray(payload.errors) && payload.errors.length) {
    throw new BasePaintCollectorProviderError("BasePaint indexer rejected the collector query.");
  }
  return payload;
}

async function fetchCollectorPayloads(address: string, currentDay: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BASEPAINT_TIMEOUT_MS);

  try {
    const summary = await fetchGraphqlPayload(
      COLLECTOR_QUERY,
      {
        address,
        contract: BASEPAINT_CONTRACT,
        limit: BASEPAINT_COLLECTOR_SAMPLE_LIMIT
      },
      controller.signal
    );
    const days = collectorHoldingDays(summary, currentDay, BASEPAINT_COLLECTOR_SAMPLE_LIMIT).map(
      (holding) => holding.day
    );
    const canvases = days.length
      ? await fetchGraphqlPayload(
          COLLECTOR_CANVASES_QUERY,
          { days, limit: BASEPAINT_COLLECTOR_SAMPLE_LIMIT },
          controller.signal
        )
      : { data: { canvass: { items: [] } } };
    return { summary, canvases };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new BasePaintCollectorProviderError("BasePaint collector request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function buildBasePaintCollector(address: string, now = Date.now()) {
  const currentDay = currentBasePaintDay(now);
  const { summary, canvases } = await fetchCollectorPayloads(address, currentDay);
  const collector = normalizeBasePaintCollector(
    summary,
    canvases,
    address,
    currentDay,
    BASEPAINT_COLLECTOR_SAMPLE_LIMIT,
    now
  );
  if (!collector) {
    throw new BasePaintCollectorProviderError("BasePaint indexer returned an unexpected collector response.");
  }
  return collector;
}

function trimCollectorCache() {
  while (collectorCache.size >= BASEPAINT_COLLECTOR_CACHE_LIMIT) {
    const oldestKey = collectorCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    collectorCache.delete(oldestKey);
  }
}

async function getBasePaintCollector(address: string, now = Date.now()) {
  const key = address.toLowerCase();
  const cached = collectorCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  try {
    const value = await buildBasePaintCollector(address, now);
    trimCollectorCache();
    collectorCache.set(key, {
      expiresAt: now + BASEPAINT_COLLECTOR_CACHE_MS,
      staleUntil: now + BASEPAINT_COLLECTOR_STALE_MS,
      value
    });
    return value;
  } catch (error) {
    if (cached?.staleUntil && cached.staleUntil > now) return cached.value;
    throw error;
  }
}

export function cacheControlForBasePaintCollectorStatus(status: number) {
  return status >= 200 && status < 300 ? SUCCESS_CACHE_CONTROL : ERROR_CACHE_CONTROL;
}

export function clearBasePaintCollectorCacheForTests() {
  collectorCache.clear();
}

function sendJson(
  response: ServerResponse,
  status: number,
  payload: BasePaintCollectorResponse | BasePaintErrorResponse
) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", cacheControlForBasePaintCollectorStatus(status));
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

  const address = collectorAddressFromRequest(request);
  if (!address) {
    sendJson(response, 400, {
      error: "Enter a valid non-zero Base address.",
      errorCode: "invalid_address"
    });
    return;
  }

  try {
    sendJson(response, 200, await getBasePaintCollector(address));
  } catch (error) {
    console.error("[BaseScout] BasePaint collector API failed", error);
    sendJson(response, 502, {
      error: safeProviderReason(error),
      errorCode: "provider_error"
    });
  }
}
