import assert from "node:assert/strict";
import {
  cacheControlForBasePaintCollectorStatus,
  checksummedCollectorAddress,
  clearBasePaintCollectorCacheForTests
} from "./basepaint-collector";

assert.match(cacheControlForBasePaintCollectorStatus(200), /s-maxage=60/);
assert.match(cacheControlForBasePaintCollectorStatus(200), /stale-while-revalidate=300/);
assert.equal(cacheControlForBasePaintCollectorStatus(400), "private, no-store");
assert.equal(cacheControlForBasePaintCollectorStatus(502), "private, no-store");

assert.equal(
  checksummedCollectorAddress("0x000488429af0fe9b62f61e3f33638d3970a3cec9"),
  "0x000488429Af0fe9B62F61e3F33638d3970a3CeC9"
);
assert.equal(checksummedCollectorAddress("0x0000000000000000000000000000000000000000"), null);
assert.equal(checksummedCollectorAddress("not-an-address"), null);

clearBasePaintCollectorCacheForTests();

console.log("BasePaint collector API tests passed");
