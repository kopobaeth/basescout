import { applySecurityContractRisk } from "./riskSecurity";
import type {
  BaseScanIntelligence,
  DexPair,
  Finding,
  RiskLevel,
  ScanResult,
  ScoreReason,
  SecurityCheckKey,
  SecurityIntelligence
} from "./types";

export const RISK_SCORE_VERSION = "2.0.0";

const BASELINE_RISK = 28;
const CRITICAL_RISK_FLOOR = 75;

const SECURITY_CHECK_KEYS: SecurityCheckKey[] = [
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

type RiskEngineInput = {
  pair: DexPair;
  pairs: DexPair[];
  tokenAddress: string;
  baseScan: BaseScanIntelligence;
  security: SecurityIntelligence;
};

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function sameAddress(a?: string, b?: string) {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

function targetToken(pair: DexPair, tokenAddress: string) {
  if (sameAddress(pair.baseToken?.address, tokenAddress)) return pair.baseToken ?? {};
  if (sameAddress(pair.quoteToken?.address, tokenAddress)) return pair.quoteToken ?? {};
  return pair.baseToken ?? {};
}

function ageInDays(timestamp?: number, now = Date.now()) {
  if (!Number.isFinite(timestamp)) return undefined;
  return Math.max(0, (now - (timestamp as number)) / 86_400_000);
}

function ageText(days: number) {
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}h`;
  return `${Math.round(days)}d`;
}

function currency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: value >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: value >= 1_000 ? 0 : 2
  }).format(value);
}

function numberText(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function reason(title: string, detail: string, delta: number, tone: ScoreReason["tone"]): ScoreReason {
  return { title, detail, delta, tone };
}

function confidenceLabel(score: number) {
  if (score >= 75) return "High";
  if (score >= 45) return "Medium";
  return "Low";
}

export function riskLevelFor(score: number, confidence: number, hasCriticalFinding = false): RiskLevel {
  if (hasCriticalFinding || score >= 75) return "critical";
  if (score >= 50) return "high";
  if (confidence < 35) return "insufficient";
  if (score >= 25) return "moderate";
  return "lower";
}

export function riskVerdict(level: RiskLevel) {
  if (level === "critical") return "Critical risk";
  if (level === "high") return "High risk";
  if (level === "moderate") return "Moderate risk";
  if (level === "lower") return "Lower risk";
  return "Insufficient data";
}

export function riskTone(level: RiskLevel) {
  if (level === "lower") return "good";
  if (level === "moderate") return "caution";
  if (level === "insufficient") return "unknown";
  return "bad";
}

function hasCriticalSecurityFinding(security: SecurityIntelligence) {
  return security.checks.some(
    (check) => check.status === "critical" && (check.key === "honeypot" || check.key === "sell_tax")
  );
}

export function calculateRiskReport(
  { pair, pairs, tokenAddress, baseScan, security }: RiskEngineInput,
  now = Date.now()
): ScanResult {
  let marketRisk = BASELINE_RISK;
  let contractRisk = BASELINE_RISK;
  const marketReasons: ScoreReason[] = [
    reason("Baseline market risk", "Market risk starts at 28 before confirmed signals are applied.", BASELINE_RISK, "neutral")
  ];
  const contractReasons: ScoreReason[] = [
    reason("Baseline contract risk", "Contract risk starts at 28 before confirmed signals are applied.", BASELINE_RISK, "neutral")
  ];
  const confidenceReasons: ScoreReason[] = [];
  const completedChecks: string[] = [];
  const unavailableChecks: string[] = [];
  const recordCoverage = (check: string, available: boolean) => {
    (available ? completedChecks : unavailableChecks).push(check);
  };

  const liquidity = pair.liquidity?.usd;
  const pairAgeDays = ageInDays(pair.pairCreatedAt, now);
  const buys = pair.txns?.h24?.buys;
  const sells = pair.txns?.h24?.sells;
  const hasTxnData = Number.isFinite(buys) || Number.isFinite(sells);
  const txns = (buys ?? 0) + (sells ?? 0);
  const volume = pair.volume?.h24;
  const marketValue = pair.marketCap ?? pair.fdv;
  const priceChange = pair.priceChange?.h24;

  recordCoverage("Base market discovery", pairs.length > 0);

  if (Number.isFinite(liquidity)) {
    recordCoverage("Liquidity", true);
    if ((liquidity as number) >= 500_000) {
      marketRisk += -8;
      marketReasons.push(reason("Strong liquidity", `${currency(liquidity as number)} is above the $500k strong-liquidity threshold.`, -8, "positive"));
    } else if ((liquidity as number) >= 50_000) {
      marketRisk += 6;
      marketReasons.push(reason("Moderate liquidity", `${currency(liquidity as number)} is inside the $50k-$500k watch zone.`, 6, "warning"));
    } else {
      marketRisk += 18;
      marketReasons.push(reason("Low liquidity", `${currency(liquidity as number)} is below the $50k threshold and can move sharply on small orders.`, 18, "danger"));
    }
  } else {
    recordCoverage("Liquidity", false);
    marketReasons.push(reason("Liquidity unavailable", "Missing liquidity lowers confidence without changing market risk.", 0, "neutral"));
  }

  if (Number.isFinite(pairAgeDays)) {
    recordCoverage("Pair age", true);
    if ((pairAgeDays as number) >= 30) {
      marketRisk += -6;
      marketReasons.push(reason("Established pair", `Pair age is ${ageText(pairAgeDays as number)}, above the 30-day maturity threshold.`, -6, "positive"));
    } else if ((pairAgeDays as number) >= 3) {
      marketRisk += 8;
      marketReasons.push(reason("Young pair", `Pair age is ${ageText(pairAgeDays as number)}, inside the 3-30 day watch zone.`, 8, "warning"));
    } else {
      marketRisk += 18;
      marketReasons.push(reason("New pair", `Pair age is ${ageText(pairAgeDays as number)}, below the 3-day threshold.`, 18, "danger"));
    }
  } else {
    recordCoverage("Pair age", false);
    marketReasons.push(reason("Pair age unavailable", "Missing pair age lowers confidence without changing market risk.", 0, "neutral"));
  }

  if (hasTxnData) {
    recordCoverage("24h transactions", true);
    if (txns >= 1_000) {
      marketRisk += -6;
      marketReasons.push(reason("Active trading", `${numberText(txns)} transactions in 24h is above the 1,000 activity threshold.`, -6, "positive"));
    } else if (txns >= 100) {
      marketRisk += 8;
      marketReasons.push(reason("Limited trading", `${numberText(txns)} transactions in 24h is inside the 100-999 watch zone.`, 8, "warning"));
    } else {
      marketRisk += 16;
      marketReasons.push(reason("Low transaction count", `${numberText(txns)} transactions in 24h is below the 100 transaction threshold.`, 16, "danger"));
    }
  } else {
    recordCoverage("24h transactions", false);
    marketReasons.push(reason("Transaction data unavailable", "Missing transaction data lowers confidence without changing market risk.", 0, "neutral"));
  }

  recordCoverage("24h volume", Number.isFinite(volume));
  if (!Number.isFinite(volume)) {
    marketReasons.push(reason("Volume unavailable", "Missing volume lowers confidence without changing market risk.", 0, "neutral"));
  }

  if (Number.isFinite(liquidity) && Number.isFinite(volume) && (liquidity as number) > 0) {
    const turnoverRatio = (volume as number) / (liquidity as number);
    if (turnoverRatio > 10) {
      marketRisk += 9;
      marketReasons.push(reason("Turnover spike", `24h volume/liquidity is ${turnoverRatio.toFixed(1)}x, above the 10x churn threshold.`, 9, "warning"));
    } else {
      marketReasons.push(reason("Turnover contained", `24h volume/liquidity is ${turnoverRatio.toFixed(1)}x, below the 10x churn threshold.`, 0, "neutral"));
    }
  }

  if (Number.isFinite(marketValue)) {
    recordCoverage(pair.marketCap ? "Market cap" : "FDV", true);
    if (Number.isFinite(liquidity) && (liquidity as number) > 0) {
      const capRatio = (marketValue as number) / (liquidity as number);
      if (capRatio > 80) {
        marketRisk += 16;
        marketReasons.push(reason("Extreme valuation gap", `Market value/liquidity is ${capRatio.toFixed(1)}x, above the 80x threshold.`, 16, "danger"));
      } else if (capRatio > 25) {
        marketRisk += 8;
        marketReasons.push(reason("Elevated valuation gap", `Market value/liquidity is ${capRatio.toFixed(1)}x, above the 25x watch threshold.`, 8, "warning"));
      } else {
        marketReasons.push(reason("Valuation supported", `Market value/liquidity is ${capRatio.toFixed(1)}x, below the 25x watch threshold.`, 0, "neutral"));
      }
    }
  } else {
    recordCoverage("Market cap or FDV", false);
    marketReasons.push(reason("Valuation data unavailable", "Missing valuation data lowers confidence without changing market risk.", 0, "neutral"));
  }

  if (Number.isFinite(priceChange)) {
    recordCoverage("24h price change", true);
    const absoluteMove = Math.abs(priceChange as number);
    if (absoluteMove > 80) {
      marketRisk += 16;
      marketReasons.push(reason("Extreme volatility", `Absolute 24h price move is ${absoluteMove.toFixed(2)}%, above the 80% threshold.`, 16, "danger"));
    } else if (absoluteMove > 30) {
      marketRisk += 8;
      marketReasons.push(reason("High volatility", `Absolute 24h price move is ${absoluteMove.toFixed(2)}%, above the 30% watch threshold.`, 8, "warning"));
    } else {
      marketReasons.push(reason("Price move contained", `Absolute 24h price move is ${absoluteMove.toFixed(2)}%, below the 30% watch threshold.`, 0, "neutral"));
    }
  } else {
    recordCoverage("24h price change", false);
    marketReasons.push(reason("Volatility unavailable", "Missing price change lowers confidence without changing market risk.", 0, "neutral"));
  }

  const hasBaseScan = baseScan.status === "available";
  const hasVerification = hasBaseScan && baseScan.verificationStatus !== "unknown";
  const contractAgeDays = ageInDays(baseScan.createdAt, now);
  recordCoverage("Contract verification", hasVerification);
  recordCoverage("Contract age", hasBaseScan && Number.isFinite(contractAgeDays));
  recordCoverage("Deployer", hasBaseScan && Boolean(baseScan.deployer));
  recordCoverage("Token supply", hasBaseScan && Boolean(baseScan.tokenSupply));
  recordCoverage("Holder count", hasBaseScan && Number.isFinite(baseScan.holderCount));

  if (!hasBaseScan) {
    contractReasons.push(reason("Contract data unavailable", baseScan.note ?? "Missing BaseScan data lowers confidence without changing contract risk.", 0, "neutral"));
  } else {
    if (baseScan.verificationStatus === "verified") {
      contractRisk += -8;
      contractReasons.push(reason("Verified contract", `${baseScan.contractName ? `${baseScan.contractName} ` : "Contract "}source is verified on BaseScan.`, -8, "positive"));
    } else if (baseScan.verificationStatus === "unverified") {
      contractRisk += 18;
      contractReasons.push(reason("Unverified contract", "BaseScan does not show verified source code for this contract.", 18, "danger"));
    } else {
      contractReasons.push(reason("Verification unknown", "Missing verification data lowers confidence without changing contract risk.", 0, "neutral"));
    }

    if (Number.isFinite(contractAgeDays)) {
      if ((contractAgeDays as number) < 3) {
        contractRisk += 18;
        contractReasons.push(reason("Fresh deployment", `Contract age is ${ageText(contractAgeDays as number)}, below the 3-day threshold.`, 18, "danger"));
      } else if ((contractAgeDays as number) < 30) {
        contractRisk += 8;
        contractReasons.push(reason("Recent deployment", `Contract age is ${ageText(contractAgeDays as number)}, inside the 3-30 day watch zone.`, 8, "warning"));
      } else {
        contractRisk += -4;
        contractReasons.push(reason("Established deployment", `Contract age is ${ageText(contractAgeDays as number)}, above the 30-day watch zone.`, -4, "positive"));
      }
    }

    if (Number.isFinite(baseScan.holderCount)) {
      if ((baseScan.holderCount as number) < 100) {
        contractRisk += 12;
        contractReasons.push(reason("Holder count very low", `${numberText(baseScan.holderCount as number)} holders is below the 100-holder threshold.`, 12, "danger"));
      } else if ((baseScan.holderCount as number) < 1_000) {
        contractRisk += 6;
        contractReasons.push(reason("Holder count low", `${numberText(baseScan.holderCount as number)} holders is inside the 100-1,000 watch zone.`, 6, "warning"));
      } else {
        contractReasons.push(reason("Holder count established", `${numberText(baseScan.holderCount as number)} holders is above the 1,000 watch zone.`, 0, "neutral"));
      }
    }
  }

  const securityChecksByKey = new Map(security.checks.map((check) => [check.key, check]));
  for (const key of SECURITY_CHECK_KEYS) {
    const check = securityChecksByKey.get(key);
    recordCoverage(`Security: ${key}`, Boolean(check && check.status !== "unknown"));
  }

  const securityRisk = applySecurityContractRisk(contractRisk, security, {
    includeVerifiedContract: !hasVerification
  });
  contractRisk = securityRisk.score;
  contractReasons.push(...securityRisk.reasons);

  const marketScore = clampScore(marketRisk);
  const contractScore = clampScore(contractRisk);
  const totalChecks = completedChecks.length + unavailableChecks.length;
  const confidenceScore = clampScore(totalChecks ? (completedChecks.length / totalChecks) * 100 : 0);

  confidenceReasons.push(
    reason("Completed checks", `${completedChecks.length} of ${totalChecks} configured checks returned usable data.`, completedChecks.length, "positive")
  );
  if (unavailableChecks.length) {
    confidenceReasons.push(
      reason(
        "Unavailable checks",
        unavailableChecks.join(", "),
        -unavailableChecks.length,
        unavailableChecks.length >= 8 ? "danger" : "warning"
      )
    );
  } else {
    confidenceReasons.push(reason("Full coverage", "All configured checks returned usable data.", 0, "positive"));
  }

  const weightedScore = clampScore(marketScore * 0.55 + contractScore * 0.45);
  const hasCriticalFinding = hasCriticalSecurityFinding(security);
  const criticalFloorApplied = hasCriticalFinding && weightedScore < CRITICAL_RISK_FLOOR;
  const overallScore = criticalFloorApplied ? CRITICAL_RISK_FLOOR : weightedScore;
  const riskLevel = riskLevelFor(overallScore, confidenceScore, hasCriticalFinding);
  const findings: Finding[] = [...marketReasons, ...contractReasons, ...confidenceReasons];

  return {
    pair,
    pairs,
    targetToken: targetToken(pair, tokenAddress),
    baseScan,
    security,
    scoreVersion: RISK_SCORE_VERSION,
    score: overallScore,
    riskLevel,
    verdict: riskVerdict(riskLevel),
    breakdown: {
      overall: overallScore,
      market: marketScore,
      contract: contractScore,
      criticalFloorApplied,
      confidence: {
        score: confidenceScore,
        label: confidenceLabel(confidenceScore),
        completedChecks,
        unavailableChecks,
        reasons: confidenceReasons
      },
      marketReasons,
      contractReasons
    },
    findings
  };
}
