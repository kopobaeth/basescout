import assert from "node:assert/strict";
import { analyticsPreferenceFromSearch } from "./analytics";

assert.equal(analyticsPreferenceFromSearch(""), null);
assert.equal(analyticsPreferenceFromSearch("?analytics=off"), true);
assert.equal(analyticsPreferenceFromSearch("?analytics=OFF"), true);
assert.equal(analyticsPreferenceFromSearch("?analytics=on"), false);
assert.equal(analyticsPreferenceFromSearch("?analytics=unknown"), null);
assert.equal(analyticsPreferenceFromSearch("?token=analytics%3Doff"), null);

console.log("Analytics preference tests passed");
