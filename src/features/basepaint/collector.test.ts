import assert from "node:assert/strict";
import {
  basePaintCollectorRouteAddress,
  collectorHoldingDays,
  isBasePaintCollectorResponse,
  normalizeBasePaintCollector
} from "./collector";

const address = "0x000488429Af0fe9B62F61e3F33638d3970a3CeC9";
const summary = {
  data: {
    holdings: {
      items: [
        { tokenId: "609", value: 2 },
        { tokenId: "604", value: 1 },
        { tokenId: "604", value: 99 },
        { tokenId: "nope", value: 1 },
        { tokenId: "700", value: 0 }
      ],
      totalCount: 252,
      pageInfo: { hasNextPage: true }
    },
    oldest: { items: [{ tokenId: "1" }] },
    totalBalances: { items: [{ value: 410 }] }
  }
};
const canvases = {
  data: {
    canvass: {
      items: [
        {
          id: 609,
          name: "Blue hour",
          palette: "#0052FF,#FDE047,#0052FF",
          totalArtists: 20,
          pixelsCount: 300,
          totalMints: 12,
          totalBurns: 1
        },
        {
          id: 604,
          name: "Sun room",
          palette: "#FDE047,#FFFFFF",
          totalArtists: 18,
          pixelsCount: 280,
          totalMints: 9,
          totalBurns: 0
        }
      ]
    }
  }
};

assert.deepEqual(collectorHoldingDays(summary, 610, 48), [
  { day: 609, editions: 2 },
  { day: 604, editions: 1 }
]);

const collector = normalizeBasePaintCollector(summary, canvases, address, 610, 48, 1234);
assert.ok(collector);
assert.equal(isBasePaintCollectorResponse(collector), true);
assert.equal(collector.totalCanvasDays, 252);
assert.equal(collector.totalEditions, 410);
assert.equal(collector.earliestHeldDay, 1);
assert.equal(collector.latestHeldDay, 609);
assert.equal(collector.sampledCanvasDays, 2);
assert.equal(collector.truncated, true);
assert.deepEqual(collector.dominantPalette[0], { color: "#FDE047", canvasCount: 2 });
assert.equal(collector.collection[0].name, "Blue hour");

const empty = normalizeBasePaintCollector(
  {
    data: {
      holdings: { items: [], totalCount: 0, pageInfo: { hasNextPage: false } },
      oldest: { items: [] },
      totalBalances: { items: [] }
    }
  },
  { data: { canvass: { items: [] } } },
  address,
  610,
  48,
  1234
);
assert.ok(empty);
assert.equal(empty.totalCanvasDays, 0);
assert.equal(empty.totalEditions, 0);
assert.equal(empty.earliestHeldDay, null);
assert.equal(empty.latestHeldDay, null);
assert.equal(empty.truncated, false);
assert.deepEqual(empty.collection, []);

assert.equal(
  basePaintCollectorRouteAddress(`/basepaint/collector/${address}`),
  address
);
assert.equal(basePaintCollectorRouteAddress("/basepaint"), undefined);
assert.equal(basePaintCollectorRouteAddress("/basepaint/collector/%E0%A4%A"), "");
assert.equal(normalizeBasePaintCollector({}, canvases, address, 610, 48), null);
assert.equal(isBasePaintCollectorResponse({ source: "basepaint" }), false);

console.log("BasePaint collector tests passed");
