import assert from "node:assert/strict";
import { isBasePaintPulseResponse, normalizeBasePaintPulse } from "./pulse";

const currentDay = 1084;
const nowSeconds = 2_000_000;
const artistA = "0x1111111111111111111111111111111111111111";
const artistB = "0x2222222222222222222222222222222222222222";

const pulse = normalizeBasePaintPulse(
  {
    data: {
      strokes: {
        items: [
          {
            canvasId: currentDay,
            accountId: artistA,
            data: "0x000001ff7f02",
            timestamp: nowSeconds - 60
          },
          {
            canvasId: currentDay,
            accountId: artistA,
            data: "0x808003",
            timestamp: nowSeconds - 10 * 60
          },
          {
            canvasId: currentDay,
            accountId: artistB,
            data: "0x404004",
            timestamp: nowSeconds - 50 * 60
          },
          {
            canvasId: currentDay - 1,
            accountId: artistB,
            data: "0x101001",
            timestamp: nowSeconds - 10
          },
          {
            canvasId: currentDay,
            accountId: "not-an-address",
            data: "0x101001",
            timestamp: nowSeconds - 10
          }
        ]
      }
    }
  },
  currentDay,
  256,
  nowSeconds * 1000
);

assert.ok(pulse);
assert.equal(isBasePaintPulseResponse(pulse), true);
assert.deepEqual(pulse.windows, [
  { minutes: 5, artists: 1, strokes: 1, pixels: 2 },
  { minutes: 30, artists: 1, strokes: 2, pixels: 3 },
  { minutes: 60, artists: 2, strokes: 3, pixels: 4 }
]);
assert.equal(pulse.topArtists[0].address, artistA);
assert.equal(pulse.topArtists[0].pixels, 3);
assert.equal(pulse.topArtists[1].pixels, 1);
assert.equal(pulse.heatmap.cells.reduce((total, cell) => total + cell.pixels, 0), 4);
assert.equal(pulse.dominantPaletteIndex, 1);
assert.equal(pulse.latestStrokeAt, (nowSeconds - 60) * 1000);
assert.equal(pulse.truncated, false);

assert.equal(normalizeBasePaintPulse({ data: {} }, currentDay, 256, nowSeconds * 1000), null);
assert.equal(isBasePaintPulseResponse({ source: "basepaint" }), false);

console.log("BasePaint pulse tests passed");
