import { calculateRiskReport, RISK_SCORE_VERSION } from "./riskEngine";
import type { ScanApiResponse, ScanErrorCode } from "../scan";
import type {
  ReportProvider,
  VersionedReportError,
  VersionedRiskReport
} from "../../src/types";

export const REPORT_SCHEMA_VERSION = "1.0.0" as const;
export const BASE_CHAIN_ID = 8453 as const;
export const REPORT_DISCLAIMER =
  "Automated signals are not financial or security guarantees. Review the contract and market independently before interacting.";

function isoTimestamp(timestamp: number) {
  return new Date(timestamp).toISOString();
}

function baseScanSource(scan: ScanApiResponse): ReportProvider {
  if (scan.baseScan.status !== "available") {
    return {
      id: "etherscan",
      status: "unavailable",
      reason: scan.baseScan.note ?? scan.baseScan.reason ?? "Contract intelligence unavailable."
    };
  }

  const partial = Boolean(
    scan.baseScan.holderCountUnavailableReason ||
      scan.baseScan.tokenSupplyUnavailableReason ||
      scan.baseScan.creationUnavailableReason
  );

  return {
    id: "etherscan",
    status: partial ? "partial" : "available",
    reason: partial ? scan.baseScan.note ?? "Some contract intelligence fields were unavailable." : undefined
  };
}

function securitySource(scan: ScanApiResponse): ReportProvider {
  return {
    id: "goplus",
    status: scan.security.status,
    checkedAt: Number.isFinite(scan.security.checkedAt) ? isoTimestamp(scan.security.checkedAt) : undefined,
    reason: scan.security.note
  };
}

export function buildVersionedRiskReport(
  scan: ScanApiResponse,
  requestId: string,
  generatedAtMs = Date.now()
): VersionedRiskReport {
  if (!scan.pair) throw new Error("Cannot build a risk report without a primary Base market.");

  const generatedAt = isoTimestamp(generatedAtMs);
  const risk = calculateRiskReport(
    {
      pair: scan.pair,
      pairs: scan.pairs,
      tokenAddress: scan.address,
      baseScan: scan.baseScan,
      security: scan.security
    },
    generatedAtMs
  );

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    requestId,
    address: scan.address.toLowerCase(),
    chainId: BASE_CHAIN_ID,
    generatedAt,
    scoreVersion: RISK_SCORE_VERSION,
    risk: {
      score: risk.score,
      level: risk.riskLevel,
      verdict: risk.verdict,
      market: risk.breakdown.market,
      contract: risk.breakdown.contract,
      criticalFloorApplied: risk.breakdown.criticalFloorApplied
    },
    confidence: risk.breakdown.confidence,
    token: risk.targetToken,
    markets: {
      primary: risk.pair,
      all: risk.pairs
    },
    contract: risk.baseScan,
    security: risk.security,
    evidence: {
      market: risk.breakdown.marketReasons,
      contract: risk.breakdown.contractReasons,
      confidence: risk.breakdown.confidence.reasons
    },
    sources: [
      { id: "dexscreener", status: "available", checkedAt: generatedAt },
      baseScanSource(scan),
      securitySource(scan)
    ],
    disclaimer: REPORT_DISCLAIMER
  };
}

function isRetryable(status: number, code: ScanErrorCode | "method_not_allowed") {
  return code === "api_timeout" || code === "rate_limit" || status >= 500;
}

export function buildVersionedReportError(
  status: number,
  code: ScanErrorCode | "method_not_allowed",
  message: string,
  requestId: string,
  generatedAtMs = Date.now()
): VersionedReportError {
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    requestId,
    generatedAt: isoTimestamp(generatedAtMs),
    error: {
      code,
      message,
      status,
      retryable: isRetryable(status, code)
    }
  };
}
