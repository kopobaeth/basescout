import type { IncomingMessage, ServerResponse } from "node:http";
import { createPublicClient, formatUnits, http, parseAbi } from "viem";
import { base } from "viem/chains";
import {
  findStock,
  STOCK_API_SOURCE,
  type Stock,
  type StockSnapshot,
} from "../src/features/stocks/catalog.js";

const abi = parseAbi(["function multiplier() view returns (uint256)"]);
const cache = new Map<string, StockSnapshot>();
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}
function number(value: unknown): number | undefined {
  if ((typeof value !== "string" && typeof value !== "number") || value === "")
    return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function normalizeOfficialStock(
  value: unknown,
  address: string,
): StockSnapshot["reference"] {
  const tokens = record(value).tokens;
  if (!Array.isArray(tokens)) throw new Error("Invalid stock reference response");
  const token = tokens
    .map(record)
    .find(
      (candidate) =>
        text(candidate.contract_address)?.toLowerCase() === address.toLowerCase(),
    );
  if (!token) return { status: "not-listed", pausedFeatures: [] };
  const pausedFeatures = Array.isArray(token.paused_features)
    ? token.paused_features
        .map(number)
        .filter((feature): feature is number => feature !== undefined)
        .filter((feature) => Number.isInteger(feature) && feature >= 0 && feature <= 3)
    : [];
  const navPriceUpdatedAt = text(token.nav_price_updated_at);
  return {
    status: "available",
    navPrice: number(token.nav_price),
    navPriceUpdatedAt:
      navPriceUpdatedAt && Number.isFinite(Date.parse(navPriceUpdatedAt))
        ? navPriceUpdatedAt
        : undefined,
    totalSupply: number(token.total_supply),
    multiplier: number(token.multiplier),
    isin: text(token.isin),
    pausedFeatures: [...new Set(pausedFeatures)].sort((a, b) => a - b),
  };
}

export function calculateDexToNavPercent(
  dexPrice?: number,
  navPrice?: number,
): number | undefined {
  if (
    dexPrice === undefined ||
    navPrice === undefined ||
    !Number.isFinite(dexPrice) ||
    !Number.isFinite(navPrice) ||
    dexPrice < 0 ||
    navPrice <= 0
  )
    return undefined;
  return ((dexPrice - navPrice) / navPrice) * 100;
}
export function normalizeStockMarket(
  value: unknown,
  address: string,
): StockSnapshot["market"] {
  const pairs = record(value).pairs;
  if (!Array.isArray(pairs) && pairs !== null)
    throw new Error("Invalid market response");
  const matches = (pairs ?? [])
    .map(record)
    .filter(
      (p) =>
        p.chainId === "base" &&
        String(record(p.baseToken).address).toLowerCase() ===
          address.toLowerCase(),
    );
  // DEX Screener priceUsd is the BASE side's price. Never reuse it for a quote-side match.
  matches.sort(
    (a, b) =>
      (number(record(b.liquidity).usd) ?? 0) -
      (number(record(a.liquidity).usd) ?? 0),
  );
  const pair = matches[0];
  if (!pair) return { status: "no-data" };
  return {
    status: "available",
    price: number(pair.priceUsd),
    liquidity: number(record(pair.liquidity).usd),
    volume: number(record(pair.volume).h24),
    dex: typeof pair.dexId === "string" ? pair.dexId : undefined,
    pairAddress:
      typeof pair.pairAddress === "string" &&
      /^0x[0-9a-f]{40}$/i.test(pair.pairAddress)
        ? pair.pairAddress
        : undefined,
  };
}
export async function getStockSnapshot(stock: Stock): Promise<StockSnapshot> {
  const existing = cache.get(stock.address);
  if (existing && Date.now() - existing.fetchedAt < 30_000) return existing;
  const client = createPublicClient({
    chain: base,
    transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org", {
      timeout: 7000,
      retryCount: 0,
    }),
  });
  const [marketResult, chainResult, referenceResult] = await Promise.allSettled([
    (async () => {
      const response = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${stock.address}`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (!response.ok) throw new Error("Market provider unavailable");
      return normalizeStockMarket(await response.json(), stock.address);
    })(),
    (async () => {
      const block = await client.getBlockNumber();
      const multiplier = await client.readContract({
        address: stock.address,
        abi,
        functionName: "multiplier",
        blockNumber: block,
      });
      if (multiplier <= 0n) throw new Error("Invalid multiplier");
      return {
        status: "available" as const,
        multiplier: formatUnits(multiplier, 18),
        block: block.toString(),
      };
    })(),
    (async () => {
      const response = await fetch(STOCK_API_SOURCE, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error("Stock reference provider unavailable");
      return normalizeOfficialStock(await response.json(), stock.address);
    })(),
  ]);
  const market: StockSnapshot["market"] =
    marketResult.status === "fulfilled"
      ? marketResult.value
      : { status: "unavailable" };
  const reference: StockSnapshot["reference"] =
    referenceResult.status === "fulfilled"
      ? referenceResult.value
      : { status: "unavailable", pausedFeatures: [] };
  const snapshot: StockSnapshot = {
    address: stock.address,
    fetchedAt: Date.now(),
    market,
    chain:
      chainResult.status === "fulfilled"
        ? chainResult.value
        : { status: "unavailable" },
    reference,
    comparison: {
      dexToNavPercent: calculateDexToNavPercent(
        market.price,
        reference.navPrice,
      ),
    },
  };
  cache.set(stock.address, snapshot);
  return snapshot;
}
export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.statusCode = 405;
    res.end(JSON.stringify({ error: "Use GET." }));
    return;
  }
  const stock = findStock(
    new URL(req.url ?? "/", "http://localhost").searchParams.get("address") ??
      "",
  );
  if (!stock) {
    res.statusCode = 404;
    res.end(
      JSON.stringify({
        error: "Address is not in the supported stock catalog.",
      }),
    );
    return;
  }
  try {
    res.end(JSON.stringify(await getStockSnapshot(stock)));
  } catch {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: "Stock data unavailable. Please retry." }));
  }
}
