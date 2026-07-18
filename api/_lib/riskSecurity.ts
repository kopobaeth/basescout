import type { ScoreReason, SecurityFinding, SecurityIntelligence } from "../../src/types";

type SecurityRiskOptions = {
  includeVerifiedContract?: boolean;
};

function reason(title: string, detail: string, delta: number, tone: ScoreReason["tone"]): ScoreReason {
  return { title, detail, delta, tone };
}

function hasCriticalKey(check: SecurityFinding, key: SecurityFinding["key"]) {
  return check.key === key && check.status === "critical";
}

function hasWarningKey(check: SecurityFinding, key: SecurityFinding["key"]) {
  return check.key === key && check.status === "warning";
}

export function securityContractRiskReasons(
  security: SecurityIntelligence,
  { includeVerifiedContract = true }: SecurityRiskOptions = {}
): ScoreReason[] {
  if (security.status === "unavailable") {
    return [
      reason(
        "Security data unavailable",
        "Security provider checks did not return. This lowers confidence without changing the risk score.",
        0,
        "neutral"
      )
    ];
  }

  const reasons: ScoreReason[] = [];

  for (const check of security.checks) {
    if (hasCriticalKey(check, "honeypot")) {
      reasons.push(reason("Confirmed honeypot risk", `${check.summary}. ${check.explanation}`, 40, "danger"));
    } else if (hasCriticalKey(check, "sell_tax")) {
      reasons.push(reason("Blocking sell tax", `${check.summary}. ${check.explanation}`, 40, "danger"));
    } else if (hasWarningKey(check, "sell_tax")) {
      reasons.push(reason("High sell tax", `${check.summary}. ${check.explanation}`, 24, "warning"));
    } else if (check.key === "owner_can_mint" && (check.status === "warning" || check.status === "critical")) {
      reasons.push(reason("Owner can mint", `${check.summary}. ${check.explanation}`, 16, "warning"));
    } else if (check.key === "blacklist" && (check.status === "warning" || check.status === "critical")) {
      reasons.push(reason("Blacklist capability", `${check.summary}. ${check.explanation}`, 16, "warning"));
    } else if (check.key === "owner_privileges" && (check.status === "warning" || check.status === "critical")) {
      reasons.push(reason("Owner privileges", `${check.summary}. ${check.explanation}`, 16, "warning"));
    } else if (hasWarningKey(check, "proxy")) {
      reasons.push(reason("Upgradeable proxy", `${check.summary}. ${check.explanation}`, 8, "warning"));
    } else if (
      hasWarningKey(check, "whitelist") ||
      hasWarningKey(check, "pausable") ||
      hasWarningKey(check, "trading_restrictions") ||
      hasWarningKey(check, "buy_tax") ||
      hasWarningKey(check, "transfer_tax") ||
      hasWarningKey(check, "ownership_renounced") ||
      hasWarningKey(check, "verified_contract")
    ) {
      if (check.key !== "verified_contract" || includeVerifiedContract) {
        reasons.push(reason(check.label, `${check.summary}. ${check.explanation}`, 6, "warning"));
      }
    } else if (includeVerifiedContract && check.key === "verified_contract" && check.status === "pass") {
      reasons.push(reason("Contract verified", `${check.summary}. ${check.explanation}`, -4, "positive"));
    }
  }

  if (security.unavailableChecks.length) {
    reasons.push(
      reason(
        "Incomplete security checks",
        `${security.unavailableChecks.length} security checks were unavailable. This lowers confidence without changing the risk score.`,
        0,
        "neutral"
      )
    );
  }

  if (!reasons.length) {
    reasons.push(reason("No critical security findings", "Security provider returned no critical owner-control, honeypot, tax, or proxy findings.", 0, "neutral"));
  }

  return reasons;
}

export function applySecurityContractRisk(
  contractScore: number,
  security: SecurityIntelligence,
  options: SecurityRiskOptions = {}
) {
  const reasons = securityContractRiskReasons(security, options);
  const score = reasons.reduce((nextScore, item) => nextScore + item.delta, contractScore);
  return { score, reasons };
}
