import assert from "node:assert/strict";
import {
  calculateRiskReport,
  RISK_SCORE_VERSION,
  riskLevelFor,
  riskTone,
  riskVerdict
} from "../api/scan";
import type {
  BaseScanIntelligence,
  DexPair,
  SecurityCheckKey,
  SecurityFinding,
  SecurityIntelligence
} from "./types";

const NOW = Date.UTC(2026, 6, 18);
const TOKEN = "0x1111111111111111111111111111111111111111";
const SECURITY_KEYS: SecurityCheckKey[] = [
  "honeypot",
  "buy_tax",
  "sell_tax",
  "transfer_tax",
  "owner_can_mint",
  "blacklist",
  "whitelist",
  "pausable",
  "trading_restrictions",
  "proxy",
  "ownership_renounced",
  "owner_privileges",
  "verified_contract"
];

function finding(key: SecurityCheckKey, overrides: Partial<SecurityFinding> = {}): SecurityFinding {
  return {
    key,
    label: key,
    status: "pass",
    summary: `${key} passed`,
    explanation: "Evidence: confirmed by provider response.",
    evidence: "confirmed",
    ...overrides
  };
}

function security(checks = SECURITY_KEYS.map((key) => finding(key))): SecurityIntelligence {
  return {
    status: checks.some((check) => check.status === "unknown") ? "partial" : "available",
    provider: "goplus",
    checkedAt: NOW,
    checks,
    unavailableChecks: checks.filter((check) => check.status === "unknown").map((check) => check.key),
    criticalCount: checks.filter((check) => check.status === "critical").length,
    warningCount: checks.filter((check) => check.status === "warning").length
  };
}

function pair(overrides: Partial<DexPair> = {}): DexPair {
  return {
    chainId: "base",
    baseToken: { address: TOKEN, symbol: "TEST" },
    quoteToken: { address: "0x2222222222222222222222222222222222222222", symbol: "WETH" },
    pairCreatedAt: NOW - 100 * 86_400_000,
    liquidity: { usd: 1_000_000 },
    volume: { h24: 100_000 },
    priceChange: { h24: 2 },
    txns: { h24: { buys: 1_200, sells: 1_100 } },
    marketCap: 10_000_000,
    ...overrides
  };
}

function baseScan(overrides: Partial<BaseScanIntelligence> = {}): BaseScanIntelligence {
  return {
    status: "available",
    verificationStatus: "verified",
    deployer: "0x3333333333333333333333333333333333333333",
    createdAt: NOW - 365 * 86_400_000,
    tokenSupply: "1000000",
    holderCount: 5_000,
    ...overrides
  };
}

function report(
  overrides: {
    pair?: DexPair;
    baseScan?: BaseScanIntelligence;
    security?: SecurityIntelligence;
  } = {}
) {
  const selectedPair = overrides.pair ?? pair();
  return calculateRiskReport(
    {
      pair: selectedPair,
      pairs: [selectedPair],
      tokenAddress: TOKEN,
      baseScan: overrides.baseScan ?? baseScan(),
      security: overrides.security ?? security()
    },
    NOW
  );
}

const lowerRisk = report();
assert.equal(lowerRisk.scoreVersion, RISK_SCORE_VERSION);
assert.equal(lowerRisk.riskLevel, "lower");
assert.equal(lowerRisk.verdict, "Lower risk");
assert.equal(lowerRisk.breakdown.confidence.score, 100);
assert.equal(riskTone(lowerRisk.riskLevel), "good");

const levelBoundaries = [
  { score: 24, confidence: 100, level: "lower", verdict: "Lower risk", tone: "good" },
  { score: 25, confidence: 100, level: "moderate", verdict: "Moderate risk", tone: "caution" },
  { score: 50, confidence: 100, level: "high", verdict: "High risk", tone: "bad" },
  { score: 75, confidence: 100, level: "critical", verdict: "Critical risk", tone: "bad" },
  { score: 24, confidence: 28, level: "insufficient", verdict: "Insufficient data", tone: "unknown" }
] as const;
for (const boundary of levelBoundaries) {
  const level = riskLevelFor(boundary.score, boundary.confidence);
  assert.equal(level, boundary.level);
  assert.equal(riskVerdict(level), boundary.verdict);
  assert.equal(riskTone(level), boundary.tone);
}

const riskyMarket = report({
  pair: pair({
    pairCreatedAt: NOW - 86_400_000,
    liquidity: { usd: 10_000 },
    volume: { h24: 200_000 },
    priceChange: { h24: 100 },
    txns: { h24: { buys: 5, sells: 5 } },
    marketCap: 2_000_000
  }),
  baseScan: baseScan({
    verificationStatus: "unverified",
    createdAt: NOW - 86_400_000,
    holderCount: 10
  })
});
assert.equal(riskyMarket.score > lowerRisk.score, true);
assert.equal(["high", "critical"].includes(riskyMarket.riskLevel), true);

const unknownSecurity = security(SECURITY_KEYS.map((key) => finding(key, { status: "unknown", evidence: "unavailable" })));
const noContractData: BaseScanIntelligence = {
  status: "unavailable",
  verificationStatus: "unknown",
  note: "Contract data unavailable."
};
const lowCoverage = report({ baseScan: noContractData, security: unknownSecurity });
assert.equal(lowCoverage.breakdown.confidence.completedChecks.length, 7);
assert.equal(lowCoverage.breakdown.confidence.unavailableChecks.length, 18);
assert.equal(lowCoverage.breakdown.confidence.score, 28);
assert.equal(lowCoverage.riskLevel, "insufficient");

const oneUnknownCheck = security(
  SECURITY_KEYS.map((key) =>
    key === "proxy" ? finding(key, { status: "unknown", evidence: "unavailable" }) : finding(key)
  )
);
const oneUnknownReport = report({ security: oneUnknownCheck });
assert.equal(oneUnknownReport.breakdown.confidence.completedChecks.length, 24);
assert.equal(oneUnknownReport.breakdown.confidence.unavailableChecks.length, 1);
assert.equal(oneUnknownReport.breakdown.confidence.score, 96);

const criticalReport = report({
  security: security(
    SECURITY_KEYS.map((key) =>
      key === "honeypot"
        ? finding(key, { status: "critical", summary: "Honeypot detected" })
        : finding(key)
    )
  )
});
assert.equal(criticalReport.score >= 75, true);
assert.equal(criticalReport.riskLevel, "critical");
assert.equal(criticalReport.verdict, "Critical risk");
assert.equal(criticalReport.breakdown.criticalFloorApplied, true);
assert.equal(riskTone(criticalReport.riskLevel), "bad");

const mintReport = report({
  security: security(
    SECURITY_KEYS.map((key) =>
      key === "owner_can_mint"
        ? finding(key, { status: "warning", summary: "Owner can mint" })
        : finding(key)
    )
  )
});
assert.equal(mintReport.riskLevel === "critical", false);
assert.equal(mintReport.breakdown.criticalFloorApplied, false);

const verifiedByBoth = report();
const goPlusVerificationUnknown = report({
  security: security(
    SECURITY_KEYS.map((key) =>
      key === "verified_contract" ? finding(key, { status: "unknown", evidence: "unavailable" }) : finding(key)
    )
  )
});
assert.equal(verifiedByBoth.score, goPlusVerificationUnknown.score);
