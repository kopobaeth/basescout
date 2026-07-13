import assert from "node:assert/strict";
import { applySecurityContractRisk } from "./riskSecurity";
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
  72,
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

assert.equal(critical.score, 12);
assert.equal(critical.reasons.some((reason) => reason.title === "Confirmed honeypot risk"), true);
assert.equal(critical.reasons.every((reason) => reason.detail.includes("Evidence:")), true);

const unavailable = applySecurityContractRisk(72, security({ status: "unavailable" }));
assert.equal(unavailable.score, 62);
assert.equal(unavailable.reasons[0].title, "Security data unavailable");

const verifiedOnly = applySecurityContractRisk(
  72,
  security({
    checks: [
      {
        key: "verified_contract",
        label: "Open-source contract",
        status: "pass",
        summary: "Contract verified/open-source",
        explanation: "Verified source improves reviewability. This is not proof of safety. Evidence: confirmed by provider response.",
        evidence: "confirmed"
      }
    ]
  })
);

assert.equal(verifiedOnly.score, 76);
assert.equal(verifiedOnly.reasons[0].title, "Contract verified");
