import assert from "node:assert/strict";
import {
  BASEPAINT_DAY_DURATION_MS,
  BASEPAINT_DAY_ONE_START_MS,
  basePaintArtworkUrl,
  basePaintCanvasUrl,
  basePaintPhaseEndsAt,
  currentBasePaintDay,
  normalizeBasePaintCanvases,
  normalizeBasePaintPalette,
  normalizeBasePaintTheme
} from "./data";

assert.equal(currentBasePaintDay(BASEPAINT_DAY_ONE_START_MS), 1);
assert.equal(currentBasePaintDay(BASEPAINT_DAY_ONE_START_MS + BASEPAINT_DAY_DURATION_MS - 1), 1);
assert.equal(currentBasePaintDay(BASEPAINT_DAY_ONE_START_MS + BASEPAINT_DAY_DURATION_MS), 2);
assert.equal(basePaintPhaseEndsAt(1), BASEPAINT_DAY_ONE_START_MS + BASEPAINT_DAY_DURATION_MS);

assert.deepEqual(
  normalizeBasePaintPalette(["#0042E0", "javascript:alert(1)", "#fffcee", "#0042E0"]),
  ["#0042E0", "#fffcee"]
);

assert.deepEqual(
  normalizeBasePaintTheme(
    {
      theme: "Guardian of the Chain",
      proposer: "artist.eth",
      size: 256,
      palette: ["#000000", "#ffffff"]
    },
    1083
  ),
  {
    day: 1083,
    theme: "Guardian of the Chain",
    proposer: "artist.eth",
    size: 256,
    palette: ["#000000", "#ffffff"]
  }
);
assert.equal(normalizeBasePaintTheme({ theme: "Missing palette", palette: [] }, 1083), null);

const canvases = normalizeBasePaintCanvases(
  {
    data: {
      canvass: {
        items: [
          {
            id: 1083,
            name: "Guardian of the Chain",
            size: 256,
            palette: "#000000,#ffffff",
            totalArtists: 67,
            pixelsCount: 128853,
            totalMints: 0,
            totalBurns: 0,
            totalEarned: "0",
            totalEarnedUsd8: "0"
          },
          {
            id: 1082,
            name: "Riverside Autumn Village",
            size: 256,
            palette: "#DF7955,#FF9C55",
            totalArtists: 71,
            pixelsCount: 133585,
            totalMints: 75,
            totalBurns: 2,
            totalEarned: "175500000000000000",
            totalEarnedUsd8: "32749309429"
          },
          {
            id: 9999,
            name: "Future data must be ignored"
          }
        ]
      }
    }
  },
  1083
);

assert.equal(canvases.length, 2);
assert.equal(canvases[0].day, 1083);
assert.equal(canvases[1].totalMints, 75);
assert.equal(basePaintArtworkUrl(7), "https://basepaint.net/v3/0007.png");
assert.equal(basePaintCanvasUrl(1077), "https://basepaint.xyz/canvas/1077");

console.log("BasePaint data tests passed");
