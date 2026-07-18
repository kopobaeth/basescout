import assert from "node:assert/strict";
import reportHandler from "../api/v1/report";
import {
  buildVersionedReportError,
  buildVersionedRiskReport,
  REPORT_SCHEMA_VERSION
} from "../api/_lib/report";
import { RISK_SCORE_VERSION } from "../api/_lib/riskEngine";
import {
  isVersionedReportError,
  isVersionedRiskReport,
  parseReportApiResponse,
  reportToScanResult
} from "./reportContract";
import { CURRENT_RISK_SCORE_VERSION } from "./riskPresentation";
import type { ScanApiResponse } from "../api/scan";

const NOW = Date.UTC(2026, 6, 18, 12);
const TOKEN = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";

const scan: ScanApiResponse = {
  address: TOKEN.toUpperCase().replace("0X", "0x"),
  pair: {
    chainId: "base",
    dexId: "aerodrome",
    pairAddress: "0x2222222222222222222222222222222222222222",
    pairCreatedAt: NOW - 100 * 86_400_000,
    baseToken: { address: TOKEN, name: "Test Token", symbol: "TEST" },
    quoteToken: { address: "0x3333333333333333333333333333333333333333", symbol: "WETH" },
    liquidity: { usd: 1_000_000 },
    volume: { h24: 100_000 },
    priceChange: { h24: 2 },
    txns: { h24: { buys: 1_200, sells: 1_100 } },
    marketCap: 10_000_000
  },
  pairs: [],
  baseScan: {
    status: "unavailable",
    reason: "missing-key",
    verificationStatus: "unknown",
    note: "BaseScan API key is not configured."
  },
  security: {
    status: "unavailable",
    provider: "goplus",
    checkedAt: NOW,
    checks: [],
    unavailableChecks: [],
    criticalCount: 0,
    warningCount: 0,
    note: "Security provider unavailable."
  }
};
scan.pairs = [scan.pair!];

const report = buildVersionedRiskReport(scan, "request-test", NOW);
assert.equal(REPORT_SCHEMA_VERSION, "1.0.0");
assert.equal(report.schemaVersion, "1.0.0");
assert.equal(report.address, TOKEN);
assert.equal(report.chainId, 8453);
assert.equal(report.scoreVersion, RISK_SCORE_VERSION);
assert.equal(CURRENT_RISK_SCORE_VERSION, RISK_SCORE_VERSION);
assert.equal(report.sources.map((source) => source.id).join(","), "dexscreener,etherscan,goplus");
assert.equal(report.sources.find((source) => source.id === "etherscan")?.status, "unavailable");
assert.equal(isVersionedRiskReport(report), true);
assert.equal(parseReportApiResponse(report), report);

const reconstructed = reportToScanResult(report);
assert.equal(reconstructed.score, report.risk.score);
assert.equal(reconstructed.breakdown.market, report.risk.market);
assert.equal(reconstructed.findings.length, report.evidence.market.length + report.evidence.contract.length + report.evidence.confidence.length);

const incompatible = { ...report, schemaVersion: "2.0.0" };
assert.equal(parseReportApiResponse(incompatible), undefined);
const malformedMarkets = { ...report, markets: { primary: { chainId: 8453 }, all: report.markets.all } };
assert.equal(parseReportApiResponse(malformedMarkets), undefined);
assert.equal(parseReportApiResponse({ ...report, sources: report.sources.slice(0, 2) }), undefined);

const typedError = buildVersionedReportError(502, "api_timeout", "Provider timed out.", "request-error", NOW);
assert.equal(isVersionedReportError(typedError), true);
assert.equal(typedError.error.retryable, true);
assert.equal(parseReportApiResponse(typedError), typedError);

function responseDouble() {
  return {
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
}

const invalidAddressResponse = responseDouble();
await reportHandler(
  { method: "GET", url: "/api/v1/report?address=not-an-address", headers: { host: "basescout.local" } } as never,
  invalidAddressResponse as never
);
const invalidAddressPayload = JSON.parse(invalidAddressResponse.body);
assert.equal(invalidAddressResponse.statusCode, 400);
assert.equal(invalidAddressResponse.headers["Cache-Control"], "private, no-store");
assert.equal(typeof invalidAddressResponse.headers["X-Request-Id"], "string");
assert.equal(invalidAddressPayload.schemaVersion, "1.0.0");
assert.equal(invalidAddressPayload.error.code, "invalid_address");

const methodResponse = responseDouble();
await reportHandler(
  { method: "POST", url: "/api/v1/report", headers: { host: "basescout.local" } } as never,
  methodResponse as never
);
const methodPayload = JSON.parse(methodResponse.body);
assert.equal(methodResponse.statusCode, 405);
assert.equal(methodResponse.headers.Allow, "GET");
assert.equal(methodPayload.error.code, "method_not_allowed");
assert.equal(methodPayload.error.retryable, false);
