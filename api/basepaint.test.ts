import assert from "node:assert/strict";
import { cacheControlForBasePaintStatus, clearBasePaintCacheForTests } from "./basepaint";

assert.match(cacheControlForBasePaintStatus(200), /s-maxage=60/);
assert.match(cacheControlForBasePaintStatus(200), /stale-while-revalidate=300/);
assert.equal(cacheControlForBasePaintStatus(400), "private, no-store");
assert.equal(cacheControlForBasePaintStatus(502), "private, no-store");

clearBasePaintCacheForTests();

console.log("BasePaint API tests passed");
