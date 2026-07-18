import assert from "node:assert/strict";
import { normalizeGoPlusSecurityResponse as normalizeServerSecurity } from "../api/scan";
import { applySecurityContractRisk } from "../api/_lib/riskSecurity";
import { normalizeGoPlusSecurityResponse } from "./security";
import type { SecurityIntelligence } from "./types";

function security(overrides: Partial<SecurityIntelligence>): SecurityIntelligence {
  return {
    status: "available",
    provider: "goplus",
    checkedAt: 1,
    checks: [],
    unavailableChecks: [],
    criticalCount: 0,
    warningCount: 0,
    ...overrides
  };
}

const critical = applySecurityContractRisk(
  28,
  security({
    criticalCount: 2,
    checks: [
      {
        key: "honeypot",
        label: "Honeypot status",
        status: "critical",
        summary: "Honeypot detected",
        explanation: "Provider reports blocked selling. Evidence: confirmed by provider response.",
        evidence: "confirmed"
      },
      {
        key: "blacklist",
        label: "Blacklist capability",
        status: "critical",
        summary: "Blacklist capability enabled",
        explanation: "Wallets can be blocked. Evidence: confirmed by provider response.",
        evidence: "confirmed"
      }
    ]
  })
);

assert.equal(critical.score, 84);
assert.equal(critical.reasons.some((item) => item.title === "Confirmed honeypot risk"), true);
assert.equal(critical.reasons.every((item) => item.detail.includes("Evidence:")), true);

const unavailable = applySecurityContractRisk(28, security({ status: "unavailable" }));
assert.equal(unavailable.score, 28);
assert.equal(unavailable.reasons[0].delta, 0);

const verifiedOnly = applySecurityContractRisk(
  28,
  security({
    checks: [
      {
        key: "verified_contract",
        label: "Open-source contract",
        status: "pass",
        summary: "Contract verified/open-source",
        explanation: "Verified source improves reviewability. Evidence: confirmed by provider response.",
        evidence: "confirmed"
      }
    ]
  })
);
assert.equal(verifiedOnly.score, 24);

const deduplicatedVerification = applySecurityContractRisk(
  28,
  security({ checks: verifiedOnly.reasons.length ? [
    {
      key: "verified_contract",
      label: "Open-source contract",
      status: "pass",
      summary: "Contract verified/open-source",
      explanation: "Verified source improves reviewability. Evidence: confirmed by provider response.",
      evidence: "confirmed"
    }
  ] : [] }),
  { includeVerifiedContract: false }
);
assert.equal(deduplicatedVerification.score, 28);

const mintWarning = applySecurityContractRisk(
  28,
  security({
    warningCount: 1,
    checks: [
      {
        key: "owner_can_mint",
        label: "Owner can mint",
        status: "warning",
        summary: "Owner can mint",
        explanation: "Supply can increase. Evidence: confirmed by provider response.",
        evidence: "confirmed"
      }
    ]
  })
);
assert.equal(mintWarning.score, 44);
assert.equal(mintWarning.reasons[0].tone, "warning");

const tokenAddress = "0x1111111111111111111111111111111111111111";
const normalizedWarnings = normalizeGoPlusSecurityResponse(
  {
    result: {
      [tokenAddress]: {
        is_honeypot: "0",
        cannot_sell_all: "0",
        sell_tax: "0.12",
        is_mintable: "1",
        blacklist_function: "1",
        hidden_owner: "1"
      }
    }
  },
  tokenAddress
);
assert.equal(normalizedWarnings.checks.find((check) => check.key === "sell_tax")?.status, "warning");
assert.equal(normalizedWarnings.checks.find((check) => check.key === "owner_can_mint")?.status, "warning");
assert.equal(normalizedWarnings.checks.find((check) => check.key === "blacklist")?.status, "warning");
assert.equal(normalizedWarnings.checks.find((check) => check.key === "owner_privileges")?.status, "warning");
assert.equal(normalizedWarnings.criticalCount, 0);

const normalizedBlockingTax = normalizeGoPlusSecurityResponse(
  { result: { [tokenAddress]: { is_honeypot: "0", sell_tax: "1" } } },
  tokenAddress
);
assert.equal(normalizedBlockingTax.checks.find((check) => check.key === "sell_tax")?.status, "critical");

for (const normalizeSecurity of [normalizeGoPlusSecurityResponse, normalizeServerSecurity]) {
  const cannotSellOnly = normalizeSecurity(
    { result: { [tokenAddress]: { cannot_sell_all: "1" } } },
    tokenAddress
  );
  const honeypotFinding = cannotSellOnly.checks.find((check) => check.key === "honeypot");
  assert.equal(honeypotFinding?.status, "critical");
  assert.equal(honeypotFinding?.summary, "Cannot sell detected");
  assert.equal(cannotSellOnly.criticalCount, 1);
}
