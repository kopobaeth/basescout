import assert from "node:assert/strict";
import {
  cacheControlForBasePaintArtistStatus,
  clearBasePaintArtistCacheForTests
} from "./basepaint-artist";

assert.match(cacheControlForBasePaintArtistStatus(200), /s-maxage=60/);
assert.match(cacheControlForBasePaintArtistStatus(200), /stale-while-revalidate=300/);
assert.equal(cacheControlForBasePaintArtistStatus(400), "private, no-store");
assert.equal(cacheControlForBasePaintArtistStatus(404), "private, no-store");
assert.equal(cacheControlForBasePaintArtistStatus(502), "private, no-store");

clearBasePaintArtistCacheForTests();

console.log("BasePaint artist API tests passed");
