import type { IncomingMessage, ServerResponse } from "node:http";

type GeckoResource = {
  id?: string;
  type?: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: { id?: string; type?: string } | null }>;
};

type GeckoResponse = {
  data?: unknown;
  included?: unknown;
};

export type TrendingTokenSide = "base" | "quote";

export type TrendingToken = {
  side: TrendingTokenSide;
  name?: string;
  symbol?: string;
  address?: string;
  scannable: boolean;
};

export type TrendingPool = {
  id: string;
  pairName: string;
  poolAddress?: string;
  dexName: string;
  priceUsd?: string;
  priceChangeH24?: number;
  volumeH24Usd?: number;
  liquidityUsd?: number;
  buysH24?: number;
  sellsH24?: number;
  poolCreatedAt?: number;
  baseToken: TrendingToken;
  quoteToken: TrendingToken;
};

export type TrendingApiResponse = {
  source: "geckoterminal";
  attribution: "Data by GeckoTerminal";
  updatedAt: number;
  cacheSeconds: number;
  pools: TrendingPool[];
};

type ErrorPayload = {
  error: string;
  errorCode: "provider_error" | "method_not_allowed";
};

const GECKO_TRENDING_ENDPOINT = "https://api.geckoterminal.com/api/v2/networks/base/trending_pools";
const GECKO_ACCEPT_HEADER = "application/json;version=20230203";
const TRENDING_CACHE_MS = 60_000;
const TRENDING_TIMEOUT_MS = 10_000;
const MAX_TRENDING_POOLS = 20;
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

let trendingCache: { expiresAt: number; value: TrendingApiResponse } | undefined;

class TrendingProviderError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function integerValue(value: unknown) {
  const parsed = numberValue(value);
  return parsed === undefined ? undefined : Math.trunc(parsed);
}

function timestampValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return undefined;

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function relationKey(resource: GeckoResource, relationName: string) {
  const data = resource.relationships?.[relationName]?.data;
  if (!data?.type || !data.id) return undefined;
  return `${data.type}:${data.id}`;
}

function includedMap(included: unknown) {
  const map = new Map<string, GeckoResource>();
  if (!Array.isArray(included)) return map;

  for (const item of included) {
    if (!isRecord(item)) continue;
    const resource = item as GeckoResource;
    if (!resource.type || !resource.id) continue;
    map.set(`${resource.type}:${resource.id}`, resource);
  }

  return map;
}

function tokenFromResource(side: TrendingTokenSide, resource: GeckoResource | undefined): TrendingToken {
  const address = stringValue(resource?.attributes?.address);
  return {
    side,
    name: stringValue(resource?.attributes?.name),
    symbol: stringValue(resource?.attributes?.symbol),
    address,
    scannable: Boolean(address && ADDRESS_PATTERN.test(address))
  };
}

function dexNameFromResource(resource: GeckoResource | undefined, fallback?: string) {
  return stringValue(resource?.attributes?.name) ?? fallback ?? "Unknown DEX";
}

export function selectScannableTokens(pool: Pick<TrendingPool, "baseToken" | "quoteToken">) {
  return [pool.baseToken, pool.quoteToken].filter((token) => token.scannable && token.address);
}

export function normalizeGeckoTrendingResponse(value: unknown, updatedAt = Date.now()): TrendingApiResponse {
  const response = isRecord(value) ? (value as GeckoResponse) : {};
  const data = Array.isArray(response.data) ? response.data : [];
  const includes = includedMap(response.included);

  const pools = data
    .map((item): TrendingPool | undefined => {
      if (!isRecord(item)) return undefined;

      const resource = item as GeckoResource;
      const attributes = resource.attributes ?? {};
      const baseToken = tokenFromResource("base", includes.get(relationKey(resource, "base_token") ?? ""));
      const quoteToken = tokenFromResource("quote", includes.get(relationKey(resource, "quote_token") ?? ""));
      const dex = includes.get(relationKey(resource, "dex") ?? "");
      const priceChange = isRecord(attributes.price_change_percentage) ? attributes.price_change_percentage : {};
      const volume = isRecord(attributes.volume_usd) ? attributes.volume_usd : {};
      const transactions = isRecord(attributes.transactions) ? attributes.transactions : {};
      const h24Transactions = isRecord(transactions.h24) ? transactions.h24 : {};

      return {
        id: resource.id ?? stringValue(attributes.address) ?? stringValue(attributes.name) ?? "unknown-pool",
        pairName: stringValue(attributes.name) ?? ([baseToken.symbol, quoteToken.symbol].filter(Boolean).join("/") || "Unknown pair"),
        poolAddress: stringValue(attributes.address),
        dexName: dexNameFromResource(dex, relationKey(resource, "dex")?.split(":")[1]),
        priceUsd: stringValue(attributes.base_token_price_usd) ?? stringValue(attributes.price_usd),
        priceChangeH24: numberValue(priceChange.h24),
        volumeH24Usd: numberValue(volume.h24),
        liquidityUsd: numberValue(attributes.reserve_in_usd),
        buysH24: integerValue(h24Transactions.buys),
        sellsH24: integerValue(h24Transactions.sells),
        poolCreatedAt: timestampValue(attributes.pool_created_at),
        baseToken,
        quoteToken
      };
    })
    .filter((pool): pool is TrendingPool => Boolean(pool))
    .slice(0, MAX_TRENDING_POOLS);

  return {
    source: "geckoterminal",
    attribution: "Data by GeckoTerminal",
    updatedAt,
    cacheSeconds: Math.floor(TRENDING_CACHE_MS / 1000),
    pools
  };
}

export function providerErrorPayload(error: unknown): ErrorPayload {
  const message = error instanceof Error ? error.message : "GeckoTerminal trending pools request failed.";
  return {
    error: `Provider error. ${message}`,
    errorCode: "provider_error"
  };
}

export function clearTrendingCacheForTests() {
  trendingCache = undefined;
}

async function fetchGeckoTrendingJson() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TRENDING_TIMEOUT_MS);
  const url = new URL(GECKO_TRENDING_ENDPOINT);
  url.searchParams.set("include", "base_token,quote_token,dex");

  try {
    const response = await fetch(url, {
      headers: {
        Accept: GECKO_ACCEPT_HEADER
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new TrendingProviderError(`GeckoTerminal returned HTTP ${response.status}`, response.status);
    }

    return (await response.json()) as unknown;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new TrendingProviderError("GeckoTerminal request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function getTrendingResponse() {
  if (trendingCache && trendingCache.expiresAt > Date.now()) return trendingCache.value;

  const json = await fetchGeckoTrendingJson();
  const value = normalizeGeckoTrendingResponse(json);
  trendingCache = {
    expiresAt: Date.now() + TRENDING_CACHE_MS,
    value
  };
  return value;
}

function sendJson(response: ServerResponse, status: number, payload: TrendingApiResponse | ErrorPayload) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=120");
  response.statusCode = status;
  response.end(JSON.stringify(payload));
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  try {
    if (request.method !== "GET") {
      response.setHeader("Allow", "GET");
      sendJson(response, 405, {
        error: "Method not allowed.",
        errorCode: "method_not_allowed"
      });
      return;
    }

    sendJson(response, 200, await getTrendingResponse());
  } catch (error) {
    console.error("[BaseScout] Trending API failed", error);
    sendJson(response, 502, providerErrorPayload(error));
  }
}
