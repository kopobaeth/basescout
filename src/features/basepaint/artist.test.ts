import assert from "node:assert/strict";
import { isBasePaintArtistResponse, normalizeBasePaintArtist } from "./artist";

const address = "0x1111111111111111111111111111111111111111";
const artist = normalizeBasePaintArtist(
  {
    data: {
      account: {
        id: address,
        totalPixels: 12500,
        totalWithdrawn: "25000000000000000",
        totalEarned: "40000000000000000",
        streak: 4,
        longestStreak: 12,
        lastPaintedDay: 1086,
        totalDaysPainted: 33
      },
      contributions: {
        items: [
          { canvasId: 1084, pixelsCount: 420 },
          { canvasId: 1086, pixelsCount: 600 },
          { canvasId: 1086, pixelsCount: 999 },
          { canvasId: 9999, pixelsCount: 10 },
          { canvasId: 1085, pixelsCount: 0 }
        ]
      },
      brushs: {
        items: [
          {
            id: 7,
            strength: 250,
            streak: 4,
            lastUsedDay: 1086,
            lastUsedTimestamp: 2_000_000
          },
          {
            id: 5,
            strength: 500,
            streak: 8,
            lastUsedDay: 1085,
            lastUsedTimestamp: 1_999_000
          }
        ]
      }
    }
  },
  address,
  1086,
  2_000_100_000
);

assert.ok(artist);
assert.equal(isBasePaintArtistResponse(artist), true);
assert.equal(artist.totalPixels, 12500);
assert.equal(artist.totalDaysPainted, 33);
assert.equal(artist.totalEarnedWei, "40000000000000000");
assert.deepEqual(artist.recentContributions, [
  { day: 1086, pixelsCount: 600 },
  { day: 1084, pixelsCount: 420 }
]);
assert.equal(artist.brushes[0].id, 5);
assert.equal(artist.brushes[0].strength, 500);
assert.equal(artist.brushes[1].lastUsedAt, 2_000_000_000);

assert.equal(normalizeBasePaintArtist({ data: { account: null } }, address, 1086), null);
assert.equal(
  normalizeBasePaintArtist(
    { data: { account: { id: "0x2222222222222222222222222222222222222222" } } },
    address,
    1086
  ),
  null
);
assert.equal(isBasePaintArtistResponse({ source: "basepaint" }), false);

console.log("BasePaint artist tests passed");
