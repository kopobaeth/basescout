import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import scanHandler, {
  cacheControlForScanStatus,
  isTokenContractAddress as isApiTokenContractAddress,
  providerTimeoutWithinDeadline,
  SCAN_DEADLINE_MS
} from "../api/scan";
import { ScanRequestCoordinator } from "./scanRequestCoordinator";
import { isEvmAddress, isTokenContractAddress, ZERO_ADDRESS } from "./tokenAddress";

const tokenAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

for (const entrypoint of ["../api/scan.ts", "../api/trending.ts"]) {
  const source = readFileSync(new URL(entrypoint, import.meta.url), "utf8");
  assert.doesNotMatch(source, /from\s+["']\.\.?\//);
}

const vercelConfig = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
assert.equal(
  vercelConfig.rewrites.some(
    (rewrite: { source?: string; destination?: string }) =>
      rewrite.source === "/api/v1/report" && rewrite.destination === "/api/scan?reportVersion=1"
  ),
  true
);

assert.equal(isEvmAddress(ZERO_ADDRESS), true);
assert.equal(isTokenContractAddress(ZERO_ADDRESS), false);
assert.equal(isApiTokenContractAddress(ZERO_ADDRESS), false);
assert.equal(isTokenContractAddress(tokenAddress), true);
assert.equal(isApiTokenContractAddress(tokenAddress), true);
assert.equal(isTokenContractAddress("eth"), false);

assert.equal(providerTimeoutWithinDeadline(20_000, 8_000, 10_000), 8_000);
assert.equal(providerTimeoutWithinDeadline(15_000, 8_000, 10_000), 5_000);
assert.equal(providerTimeoutWithinDeadline(9_999, 8_000, 10_000), 0);
assert.equal(SCAN_DEADLINE_MS < 15_000, true);

assert.equal(cacheControlForScanStatus(200).startsWith("public"), true);
assert.equal(cacheControlForScanStatus(400), "private, no-store");
assert.equal(cacheControlForScanStatus(502), "private, no-store");

const invalidAddressResponse = {
  statusCode: 0,
  headers: {} as Record<string, string | number | readonly string[]>,
  setHeader(key: string, value: string | number | readonly string[]) {
    this.headers[key] = value;
  },
  end(body: string) {
    this.body = body;
  },
  body: ""
};

await scanHandler(
  { method: "GET", url: `/?address=${ZERO_ADDRESS}`, headers: { host: "basescout.local" } } as never,
  invalidAddressResponse as never
);
assert.equal(invalidAddressResponse.statusCode, 400);
assert.equal(invalidAddressResponse.headers["Cache-Control"], "private, no-store");
assert.equal(JSON.parse(invalidAddressResponse.body).errorCode, "invalid_address");

const coordinator = new ScanRequestCoordinator();
const first = coordinator.start();
assert.equal(coordinator.isCurrent(first), true);

const second = coordinator.start();
assert.equal(first.controller.signal.aborted, true);
assert.equal(coordinator.isCurrent(first), false);
assert.equal(coordinator.isCurrent(second), true);
assert.equal(coordinator.complete(first), false);
assert.equal(coordinator.complete(second), true);

const third = coordinator.start();
assert.equal(coordinator.cancel(), true);
assert.equal(third.controller.signal.aborted, true);
assert.equal(coordinator.isCurrent(third), false);
assert.equal(coordinator.cancel(), false);
