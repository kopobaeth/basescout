import assert from "node:assert/strict";
import handler, {
  clearTrendingCacheForTests,
  normalizeGeckoTrendingResponse,
  providerErrorPayload,
  selectScannableTokens
} from "../api/trending";
import { loadTrendingPools } from "./trendingClient";
import type { TrendingApiResponse, TrendingStatus } from "./types";

const sampleResponse = {
  data: [
    {
      id: "base_0xpool",
      type: "pool",
      attributes: {
        name: "AERO / USDC",
        address: "0xpool",
        base_token_price_usd: "1.23",
        price_change_percentage: { h24: "4.5" },
        volume_usd: { h24: "123456" },
        reserve_in_usd: "789000",
        transactions: { h24: { buys: 120, sells: "80" } },
        pool_created_at: "2024-01-01T00:00:00Z"
      },
      relationships: {
        base_token: { data: { id: "base_0x940181a94a35a4569e4529a3cdfb74e38fd98631", type: "token" } },
        quote_token: { data: { id: "base_0x833589fcD6eDb6E08f4c7C32D4f71b54bdA02913", type: "token" } },
        dex: { data: { id: "aerodrome", type: "dex" } }
      }
    }
  ],
  included: [
    {
      id: "base_0x940181a94a35a4569e4529a3cdfb74e38fd98631",
      type: "token",
      attributes: {
        address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631",
        name: "Aerodrome",
        symbol: "AERO"
      }
    },
    {
      id: "base_0x833589fcD6eDb6E08f4c7C32D4f71b54bdA02913",
      type: "token",
      attributes: {
        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        name: "USD Coin",
        symbol: "USDC"
      }
    },
    {
      id: "aerodrome",
      type: "dex",
      attributes: {
        name: "Aerodrome"
      }
    }
  ]
};

const normalized = normalizeGeckoTrendingResponse(sampleResponse, 1);
assert.equal(normalized.source, "geckoterminal");
assert.equal(normalized.attribution, "Data by GeckoTerminal");
assert.equal(normalized.cacheSeconds, 60);
assert.equal(normalized.pools.length, 1);
assert.equal(normalized.pools[0].pairName, "AERO / USDC");
assert.equal(normalized.pools[0].dexName, "Aerodrome");
assert.equal(normalized.pools[0].priceUsd, "1.23");
assert.equal(normalized.pools[0].priceChangeH24, 4.5);
assert.equal(normalized.pools[0].volumeH24Usd, 123456);
assert.equal(normalized.pools[0].liquidityUsd, 789000);
assert.equal(normalized.pools[0].buysH24, 120);
assert.equal(normalized.pools[0].sellsH24, 80);
assert.equal(normalized.pools[0].poolCreatedAt, Date.parse("2024-01-01T00:00:00Z"));

const missingFields = normalizeGeckoTrendingResponse(
  {
    data: [
      {
        id: "base_missing",
        type: "pool",
        attributes: {
          name: null,
          base_token_price_usd: null,
          price_change_percentage: null,
          volume_usd: null,
          reserve_in_usd: null,
          transactions: null,
          pool_created_at: null
        },
        relationships: {}
      }
    ],
    included: []
  },
  2
);

assert.equal(missingFields.pools.length, 1);
assert.equal(missingFields.pools[0].pairName, "Unknown pair");
assert.equal(missingFields.pools[0].priceUsd, undefined);
assert.equal(missingFields.pools[0].priceChangeH24, undefined);
assert.equal(missingFields.pools[0].volumeH24Usd, undefined);
assert.equal(missingFields.pools[0].liquidityUsd, undefined);
assert.equal(missingFields.pools[0].buysH24, undefined);
assert.equal(missingFields.pools[0].sellsH24, undefined);

const choices = selectScannableTokens(normalized.pools[0]);
assert.equal(choices.length, 2);
assert.equal(choices[0].side, "base");
assert.equal(choices[1].side, "quote");

const nativeOnlyChoices = selectScannableTokens({
  baseToken: { side: "base", symbol: "ETH", address: "eth", scannable: false },
  quoteToken: {
    side: "quote",
    symbol: "USDC",
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    scannable: true
  }
});
assert.equal(nativeOnlyChoices.length, 1);
assert.equal(nativeOnlyChoices[0].symbol, "USDC");

assert.deepEqual(providerErrorPayload(new Error("provider unavailable")), {
  error: "Provider error. provider unavailable",
  errorCode: "provider_error"
});

clearTrendingCacheForTests();
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error("provider unavailable");
};
const originalConsoleError = console.error;
console.error = () => undefined;

const request = { method: "GET" };
const response = {
  statusCode: 0,
  headers: {} as Record<string, string | number | readonly string[]>,
  setHeader(key: string, value: string | number | readonly string[]) {
    this.headers[key] = value;
  },
  end(body: string) {
    this.body = body;
  },
  body: ""
};

await handler(request as never, response as never);
assert.equal(response.statusCode, 502);
assert.equal(JSON.parse(response.body).errorCode, "provider_error");

globalThis.fetch = originalFetch;
console.error = originalConsoleError;

function transitionHandlers(statuses: TrendingStatus[]) {
  let data: TrendingApiResponse | null = null;
  let error = "";

  return {
    handlers: {
      setData(nextData: TrendingApiResponse | null) {
        data = nextData;
      },
      setError(nextError: string) {
        error = nextError;
      },
      setStatus(nextStatus: TrendingStatus) {
        statuses.push(nextStatus);
      }
    },
    getData() {
      return data;
    },
    getError() {
      return error;
    }
  };
}

const successStatuses: TrendingStatus[] = [];
const success = transitionHandlers(successStatuses);
await loadTrendingPools({
  ...success.handlers,
  fetcher: async () =>
    new Response(
      JSON.stringify({
        source: "geckoterminal",
        attribution: "Data by GeckoTerminal",
        updatedAt: 123,
        cacheSeconds: 60,
        pools: []
      }),
      {
        headers: { "content-type": "application/json" },
        status: 200
      }
    ),
  signal: new AbortController().signal,
  timeoutMs: 1000
});
assert.deepEqual(successStatuses, ["loading", "success"]);
assert.equal(success.getData()?.updatedAt, 123);
assert.equal(success.getError(), "");

const errorStatuses: TrendingStatus[] = [];
const failure = transitionHandlers(errorStatuses);
await loadTrendingPools({
  ...failure.handlers,
  fetcher: async () =>
    new Response("not json", {
      headers: { "content-type": "application/json" },
      status: 200
    }),
  signal: new AbortController().signal,
  timeoutMs: 1000
});
assert.deepEqual(errorStatuses, ["loading", "error"]);
assert.equal(failure.getData(), null);
assert.match(failure.getError(), /invalid|JSON|Unexpected/i);
