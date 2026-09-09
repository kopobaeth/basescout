import assert from "node:assert/strict";
import { STOCKS, findStock } from "./catalog";
import { normalizeStockMarket, getStockSnapshot } from "../../../api/stocks";
assert.equal(new Set(STOCKS.map((s) => s.address)).size, 13);
for (const s of STOCKS) {
  assert.match(s.address, /^0x[0-9a-f]{40}$/);
  assert.equal(findStock(s.address.toUpperCase()), s);
}
assert.equal(findStock("AAPLc"), undefined);
assert.equal(
  findStock("0x0000000000000000000000000000000000000000"),
  undefined,
);
const address = STOCKS[0].address;
const pair = (chainId: string, baseAddress: string, usd: number) => ({
  chainId,
  baseToken: { address: baseAddress },
  quoteToken: { address },
  liquidity: { usd },
  priceUsd: "125.50",
  volume: { h24: 0 },
});
const market = normalizeStockMarket(
  {
    pairs: [
      pair("ethereum", address, 1e9),
      pair("base", "0x1234", 1e8),
      pair("base", address, 500),
    ],
  },
  address,
);
assert.equal(market.liquidity, 500);
assert.equal(market.price, 125.5);
assert.equal(market.volume, 0);
assert.equal(
  normalizeStockMarket({ pairs: [pair("base", "0x1234", 1e8)] }, address)
    .status,
  "no-data",
);
assert.equal(normalizeStockMarket({ pairs: null }, address).status, "no-data");
assert.throws(() => normalizeStockMarket({}, address));
assert.equal(
  normalizeStockMarket(
    { pairs: [{ ...pair("base", address, 0), priceUsd: "NaN" }] },
    address,
  ).price,
  undefined,
);
// Provider failures must be explicit, not fabricated zeros or a 1:1 multiplier.
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error("offline");
};
try {
  const result = await getStockSnapshot(STOCKS[1]);
  assert.equal(result.market.status, "unavailable");
  assert.equal(result.chain.status, "unavailable");
  assert.equal(result.market.price, undefined);
  assert.equal(result.chain.multiplier, undefined);
} finally {
  globalThis.fetch = originalFetch;
}
console.log(
  "Stock identity, market orientation, malformed data and provider failure tests passed.",
);
const { scanTokenData, STOCK_ADDRESSES } = await import("../../../api/scan");
const rejectedScore = await scanTokenData(STOCKS[0].address);
assert.equal(rejectedScore.status, 422);
assert.equal(rejectedScore.payload.errorCode, "unsupported_asset");
assert.equal(rejectedScore.payload.pair, null);
console.log("B20 assets cannot receive generic ERC-20 risk scores.");

assert.deepEqual([...STOCK_ADDRESSES].sort(), STOCKS.map(s => s.address).sort());
