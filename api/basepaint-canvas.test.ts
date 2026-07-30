import assert from "node:assert/strict";
import {
  cacheControlForBasePaintCanvasStatus,
  clearBasePaintCanvasCacheForTests
} from "./basepaint-canvas";

assert.match(cacheControlForBasePaintCanvasStatus(200), /s-maxage=60/);
assert.match(cacheControlForBasePaintCanvasStatus(200), /stale-while-revalidate=300/);
assert.equal(cacheControlForBasePaintCanvasStatus(400), "private, no-store");
assert.equal(cacheControlForBasePaintCanvasStatus(404), "private, no-store");
assert.equal(cacheControlForBasePaintCanvasStatus(502), "private, no-store");

clearBasePaintCanvasCacheForTests();

console.log("BasePaint canvas API tests passed");
