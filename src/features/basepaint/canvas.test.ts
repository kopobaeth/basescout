import assert from "node:assert/strict";
import { normalizeBasePaintCanvasDetail, isBasePaintCanvasResponse } from "./canvas";
import { basePaintPhaseEndsAt } from "./data";

const artist = "0x1111111111111111111111111111111111111111";
const secondArtist = "0x2222222222222222222222222222222222222222";
const transaction = `0x${"a".repeat(64)}`;
const canvas = normalizeBasePaintCanvasDetail(
  {
    data: {
      canvas: {
        id: 1086,
        name: "Medieval Cats",
        proposer: artist,
        size: 256,
        palette: "#101010,#19363F,#413B2F",
        totalArtists: 73,
        pixelsCount: 138225,
        totalMints: 30,
        totalBurns: 2,
        totalEarned: "70200000000000000",
        totalEarnedUsd8: "13275963783"
      },
      contributions: {
        items: [
          { accountId: artist, pixelsCount: 7000 },
          { accountId: secondArtist, pixelsCount: 6800 },
          { accountId: `${artist.slice(0, 2)}${artist.slice(2).toUpperCase()}`, pixelsCount: 1 },
          { accountId: "invalid", pixelsCount: 9000 }
        ]
      },
      strokes: {
        items: [
          {
            id: "4931926300261",
            accountId: artist,
            brushId: 2853,
            pixels: 53,
            tx: transaction,
            timestamp: 1_785_427_873
          },
          {
            id: "4931926300260",
            accountId: secondArtist,
            brushId: 3,
            pixels: 14,
            tx: transaction.replace(/a$/, "b"),
            timestamp: 1_785_427_000
          }
        ]
      }
    }
  },
  1086,
  1086,
  1_785_428_000_000
);

assert.ok(canvas);
assert.equal(isBasePaintCanvasResponse(canvas), true);
assert.equal(canvas.canvas.name, "Medieval Cats");
assert.equal(canvas.canvas.palette.length, 3);
assert.equal(canvas.phase, "painting");
assert.equal(canvas.phaseEndsAt, basePaintPhaseEndsAt(1086));
assert.equal(canvas.topContributors.length, 2);
assert.equal(canvas.topContributors[0].pixelsCount, 7000);
assert.equal(canvas.recentStrokes[0].brushId, 2853);
assert.equal(canvas.recentStrokes[0].paintedAt, 1_785_427_873_000);

assert.equal(
  normalizeBasePaintCanvasDetail({ data: { canvas: null } }, 1086, 1086),
  null
);
assert.equal(
  normalizeBasePaintCanvasDetail(
    { data: { canvas: { id: 1085 } } },
    1086,
    1086
  ),
  null
);
assert.equal(isBasePaintCanvasResponse({ source: "basepaint" }), false);

console.log("BasePaint canvas tests passed");
