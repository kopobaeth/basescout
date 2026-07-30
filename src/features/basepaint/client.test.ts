import assert from "node:assert/strict";
import { apiErrorMessage } from "./client";

assert.equal(
  apiErrorMessage({ error: "Provider unavailable." }, "Fallback"),
  "Provider unavailable."
);
assert.equal(
  apiErrorMessage({ error: { message: "Function invocation failed." } }, "Fallback"),
  "Function invocation failed."
);
assert.equal(apiErrorMessage({ error: { code: "INTERNAL" } }, "Fallback"), "Fallback");
assert.equal(apiErrorMessage(null, "Fallback"), "Fallback");

console.log("BasePaint client error tests passed");
