import type {
  BaseScanIntelligence,
  DexPair,
  DexToken,
  ReportApiResponse,
  ReportErrorCode,
  ReportProvider,
  RiskLevel,
  ScanResult,
  ScoreReason,
  SecurityFinding,
  SecurityIntelligence,
  VersionedReportError,
  VersionedRiskReport
} from "./types";

export const REPORT_SCHEMA_VERSION = "1.0.0" as const;

const ADDRESS_PATTERN = /^0x[a-f0-9]{40}$/;
const RISK_LEVELS = ["lower", "moderate", "high", "critical", "insufficient"] as const;
const REASON_TONES = ["positive", "warning", "danger", "neutral"] as const;
const SECURITY_KEYS = [
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
] as const;
const REPORT_ERROR_CODES: ReportErrorCode[] = [
  "invalid_address",
  "no_base_pair",
  "api_timeout",
  "rate_limit",
  "partial_contract_intelligence_failure",
  "unexpected_server_error",
  "method_not_allowed"
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOptionalString(value: unknown) {
  return value === undefined || isString(value);
}

function isOptionalNumber(value: unknown) {
  return value === undefined || isFiniteNumber(value);
}

function isEnumValue<T extends string>(value: unknown, values: readonly T[]): value is T {
  return isString(value) && values.includes(value as T);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isTimestamp(value: unknown) {
  return isString(value) && !Number.isNaN(Date.parse(value));
}

function isDexToken(value: unknown): value is DexToken {
  return (
    isRecord(value) &&
    isOptionalString(value.address) &&
    isOptionalString(value.name) &&
    isOptionalString(value.symbol)
  );
}

function isOptionalNumberObject(value: unknown, key: string) {
  return value === undefined || (isRecord(value) && isOptionalNumber(value[key]));
}

function isDexPair(value: unknown): value is DexPair {
  if (!isRecord(value) || !isString(value.chainId)) return false;
  if (!isOptionalString(value.dexId) || !isOptionalString(value.url) || !isOptionalString(value.pairAddress)) return false;
  if (!isOptionalNumber(value.pairCreatedAt) || !isOptionalString(value.priceUsd)) return false;
  if (value.baseToken !== undefined && !isDexToken(value.baseToken)) return false;
  if (value.quoteToken !== undefined && !isDexToken(value.quoteToken)) return false;
  if (!isOptionalNumberObject(value.liquidity, "usd")) return false;
  if (!isOptionalNumberObject(value.volume, "h24")) return false;
  if (!isOptionalNumberObject(value.priceChange, "h24")) return false;
  if (!isOptionalNumber(value.marketCap) || !isOptionalNumber(value.fdv)) return false;
  if (value.txns !== undefined) {
    if (!isRecord(value.txns) || (value.txns.h24 !== undefined && !isRecord(value.txns.h24))) return false;
    if (isRecord(value.txns.h24) && (!isOptionalNumber(value.txns.h24.buys) || !isOptionalNumber(value.txns.h24.sells))) return false;
  }
  return value.info === undefined || (isRecord(value.info) && isOptionalString(value.info.imageUrl));
}

function isScoreReason(value: unknown): value is ScoreReason {
  return (
    isRecord(value) &&
    isString(value.title) &&
    isString(value.detail) &&
    isFiniteNumber(value.delta) &&
    isEnumValue(value.tone, REASON_TONES)
  );
}

function isReasonArray(value: unknown): value is ScoreReason[] {
  return Array.isArray(value) && value.every(isScoreReason);
}

function isConfidence(value: unknown) {
  return (
    isRecord(value) &&
    isFiniteNumber(value.score) &&
    value.score >= 0 &&
    value.score <= 100 &&
    isEnumValue(value.label, ["High", "Medium", "Low"] as const) &&
    isStringArray(value.completedChecks) &&
    isStringArray(value.unavailableChecks) &&
    isReasonArray(value.reasons)
  );
}

function isBaseScan(value: unknown): value is BaseScanIntelligence {
  if (!isRecord(value)) return false;
  if (!isEnumValue(value.status, ["idle", "loading", "available", "unavailable"] as const)) return false;
  if (!isEnumValue(value.verificationStatus, ["verified", "unverified", "unknown"] as const)) return false;
  const reasons = ["missing-key", "request-failed", "invalid-key", "rate-limited", "endpoint-unavailable", "plan-restricted", "no-data"] as const;
  for (const field of ["reason", "holderCountUnavailableReason", "tokenSupplyUnavailableReason", "creationUnavailableReason"] as const) {
    if (value[field] !== undefined && !isEnumValue(value[field], reasons)) return false;
  }
  for (const field of ["contractName", "deployer", "creationTxHash", "tokenSupply", "note"] as const) {
    if (!isOptionalString(value[field])) return false;
  }
  return isOptionalNumber(value.createdAt) && isOptionalNumber(value.holderCount);
}

function isSecurityFinding(value: unknown): value is SecurityFinding {
  return (
    isRecord(value) &&
    isEnumValue(value.key, SECURITY_KEYS) &&
    isString(value.label) &&
    isEnumValue(value.status, ["pass", "warning", "critical", "unknown"] as const) &&
    isString(value.summary) &&
    isString(value.explanation) &&
    isEnumValue(value.evidence, ["confirmed", "inferred", "unavailable"] as const) &&
    isOptionalString(value.value)
  );
}

function isSecurity(value: unknown): value is SecurityIntelligence {
  return (
    isRecord(value) &&
    isEnumValue(value.status, ["available", "partial", "unavailable"] as const) &&
    value.provider === "goplus" &&
    isFiniteNumber(value.checkedAt) &&
    Array.isArray(value.checks) &&
    value.checks.every(isSecurityFinding) &&
    Array.isArray(value.unavailableChecks) &&
    value.unavailableChecks.every((key) => isEnumValue(key, SECURITY_KEYS)) &&
    isFiniteNumber(value.criticalCount) &&
    isFiniteNumber(value.warningCount) &&
    isOptionalString(value.note)
  );
}

function isReportProvider(value: unknown): value is ReportProvider {
  return (
    isRecord(value) &&
    isEnumValue(value.id, ["dexscreener", "etherscan", "goplus"] as const) &&
    isEnumValue(value.status, ["available", "partial", "unavailable"] as const) &&
    (value.checkedAt === undefined || isTimestamp(value.checkedAt)) &&
    isOptionalString(value.reason)
  );
}

export function isVersionedRiskReport(value: unknown): value is VersionedRiskReport {
  if (!isRecord(value) || value.schemaVersion !== REPORT_SCHEMA_VERSION) return false;
  if (!isString(value.requestId) || !value.requestId || !ADDRESS_PATTERN.test(String(value.address)) || value.chainId !== 8453) return false;
  if (!isTimestamp(value.generatedAt) || !isString(value.scoreVersion) || !value.scoreVersion || !isString(value.disclaimer)) return false;
  if (!isRecord(value.risk)) return false;
  if (!isFiniteNumber(value.risk.score) || value.risk.score < 0 || value.risk.score > 100) return false;
  if (!isEnumValue(value.risk.level, RISK_LEVELS) || !isString(value.risk.verdict)) return false;
  if (!isFiniteNumber(value.risk.market) || value.risk.market < 0 || value.risk.market > 100) return false;
  if (!isFiniteNumber(value.risk.contract) || value.risk.contract < 0 || value.risk.contract > 100) return false;
  if (typeof value.risk.criticalFloorApplied !== "boolean" || !isConfidence(value.confidence)) return false;
  if (!isDexToken(value.token) || !isRecord(value.markets) || !isDexPair(value.markets.primary)) return false;
  if (!Array.isArray(value.markets.all) || !value.markets.all.every(isDexPair)) return false;
  if (!isBaseScan(value.contract) || !isSecurity(value.security) || !isRecord(value.evidence)) return false;
  if (!isReasonArray(value.evidence.market) || !isReasonArray(value.evidence.contract) || !isReasonArray(value.evidence.confidence)) return false;
  if (!Array.isArray(value.sources) || value.sources.length !== 3 || !value.sources.every(isReportProvider)) return false;
  const sourceIds = new Set(value.sources.map((source) => source.id));
  return (["dexscreener", "etherscan", "goplus"] as const).every((sourceId) => sourceIds.has(sourceId));
}

export function isVersionedReportError(value: unknown): value is VersionedReportError {
  return (
    isRecord(value) &&
    value.schemaVersion === REPORT_SCHEMA_VERSION &&
    isString(value.requestId) &&
    Boolean(value.requestId) &&
    isTimestamp(value.generatedAt) &&
    isRecord(value.error) &&
    isEnumValue(value.error.code, REPORT_ERROR_CODES) &&
    isString(value.error.message) &&
    isFiniteNumber(value.error.status) &&
    typeof value.error.retryable === "boolean"
  );
}

export function parseReportApiResponse(value: unknown): ReportApiResponse | undefined {
  if (isVersionedRiskReport(value) || isVersionedReportError(value)) return value;
  return undefined;
}

export async function readReportApiResponse(response: Response) {
  if (!(response.headers.get("content-type") ?? "").includes("application/json")) return undefined;
  try {
    return parseReportApiResponse(await response.json());
  } catch {
    return undefined;
  }
}

export function reportToScanResult(report: VersionedRiskReport): ScanResult {
  return {
    pair: report.markets.primary,
    pairs: report.markets.all,
    targetToken: report.token,
    baseScan: report.contract,
    security: report.security,
    scoreVersion: report.scoreVersion,
    score: report.risk.score,
    riskLevel: report.risk.level,
    verdict: report.risk.verdict,
    breakdown: {
      overall: report.risk.score,
      market: report.risk.market,
      contract: report.risk.contract,
      criticalFloorApplied: report.risk.criticalFloorApplied,
      confidence: report.confidence,
      marketReasons: report.evidence.market,
      contractReasons: report.evidence.contract
    },
    findings: [...report.evidence.market, ...report.evidence.contract, ...report.evidence.confidence]
  };
}
