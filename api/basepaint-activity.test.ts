import assert from "node:assert/strict";
import {
  cacheControlForBasePaintActivityStatus,
  clearBasePaintActivityCacheForTests
} from "./basepaint-activity";

assert.match(cacheControlForBasePaintActivityStatus(200), /s-maxage=20/);
assert.match(cacheControlForBasePaintActivityStatus(200), /stale-while-revalidate=120/);
assert.equal(cacheControlForBasePaintActivityStatus(400), "private, no-store");
assert.equal(cacheControlForBasePaintActivityStatus(502), "private, no-store");

clearBasePaintActivityCacheForTests();

console.log("BasePaint activity API tests passed");
