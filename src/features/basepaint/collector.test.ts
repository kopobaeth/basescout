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
        { tokenId: "608", value: 1 },
        { tokenId: "607", value: 1 },
        { tokenId: "604", value: 1 },
        { tokenId: "604", value: 99 },
        { tokenId: "nope", value: 1 },
        { tokenId: "700", value: 0 }
      ],
      totalCount: 8,
      pageInfo: { hasNextPage: true }
    },
    oldest: { items: [{ tokenId: "1" }] },
    totalBalances: { items: [{ value: 7 }] }
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
          proposer: "0x1111111111111111111111111111111111111111",
          totalArtists: 20,
          pixelsCount: 300,
          totalMints: 12,
          totalBurns: 1
        },
        {
          id: 608,
          name: "Blue room",
          palette: "#0052FF,#FFFFFF",
          proposer: "0x1111111111111111111111111111111111111111",
          totalArtists: 19,
          pixelsCount: 290,
          totalMints: 10,
          totalBurns: 0
        },
        {
          id: 607,
          name: "Night signal",
          palette: "#0052FF,#000000",
          proposer: "0x2222222222222222222222222222222222222222",
          totalArtists: 16,
          pixelsCount: 250,
          totalMints: 7,
          totalBurns: 0
        },
        {
          id: 604,
          name: "Sun room",
          palette: "#FDE047,#FFFFFF",
          proposer: "0x1111111111111111111111111111111111111111",
          totalArtists: 18,
          pixelsCount: 280,
          totalMints: 9,
          totalBurns: 0
        }
      ]
    },
    recent: {
      items: [
        {
          id: 611,
          name: "Painting today",
          palette: "#0052FF,#EF4444",
          proposer: "0x3333333333333333333333333333333333333333"
        },
        {
          id: 610,
          name: "Collecting now",
          palette: "#0052FF,#000000",
          proposer: "0x2222222222222222222222222222222222222222"
        },
        {
          id: 609,
          name: "Already held",
          palette: "#0052FF"
        },
        {
          id: 606,
          name: "Near the run",
          palette: "#0052FF,#FDE047",
          proposer: "0x3333333333333333333333333333333333333333"
        }
      ]
    }
  }
};

assert.deepEqual(collectorHoldingDays(summary, 611, 48), [
  { day: 609, editions: 2 },
  { day: 608, editions: 1 },
  { day: 607, editions: 1 },
  { day: 604, editions: 1 }
]);

const collector = normalizeBasePaintCollector(summary, canvases, address, 611, 48, 1234);
assert.ok(collector);
assert.equal(isBasePaintCollectorResponse(collector), true);
assert.equal(collector.totalCanvasDays, 8);
assert.equal(collector.totalEditions, 7);
assert.equal(collector.earliestHeldDay, 1);
assert.equal(collector.latestHeldDay, 609);
assert.equal(collector.sampledCanvasDays, 4);
assert.equal(collector.truncated, true);
assert.deepEqual(collector.dominantPalette[0], {
  color: "#0052FF",
  canvasCount: 3,
  percentage: 75
});
assert.deepEqual(collector.coverage, {
  sampledCanvasDays: 4,
  totalCanvasDays: 8,
  samplePercentage: 50,
  paletteMetadataDays: 4,
  proposerMetadataDays: 4,
  confidence: "medium"
});
assert.equal(collector.signals.longestHeldDayRun, 3);
assert.equal(collector.signals.multipleEditionDays, 1);
assert.deepEqual(collector.signals.periods, [
  {
    label: "BasePaint year 2",
    startDay: 366,
    endDay: 730,
    canvasCount: 4,
    percentage: 100
  }
]);
assert.deepEqual(collector.signals.themeProposers[0], {
  proposer: "0x1111111111111111111111111111111111111111",
  canvasCount: 3,
  percentage: 75
});
assert.equal(collector.recommendations.length, 3);
assert.equal(collector.recommendations[0].day, 610);
assert.equal(collector.recommendations[0].phase, "collecting");
assert.equal(collector.recommendations[0].matchScore, 95);
assert.deepEqual(
  collector.recommendations[0].evidence.map((entry) => entry.code),
  ["palette_match", "theme_proposer_match", "near_held_day", "collecting_now"]
);
assert.equal(collector.recommendations.some((entry) => entry.day === 609), false);
assert.equal(collector.collection[0].name, "Blue hour");
assert.equal(collector.collection[0].proposer, "0x1111111111111111111111111111111111111111");

const empty = normalizeBasePaintCollector(
  {
    data: {
      holdings: { items: [], totalCount: 0, pageInfo: { hasNextPage: false } },
      oldest: { items: [] },
      totalBalances: { items: [] }
    }
  },
  { data: { canvass: { items: [] }, recent: { items: [] } } },
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
assert.equal(empty.coverage.confidence, "low");
assert.equal(empty.signals.longestHeldDayRun, 0);
assert.deepEqual(empty.recommendations, []);
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
