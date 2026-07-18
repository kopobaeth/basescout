import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

export type DexToken = {
  address?: string;
  name?: string;
  symbol?: string;
};

export type DexPair = {
  chainId: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  pairCreatedAt?: number;
  baseToken?: DexToken;
  quoteToken?: DexToken;
  priceUsd?: string;
  liquidity?: {
    usd?: number;
  };
  volume?: {
    h24?: number;
  };
  priceChange?: {
    h24?: number;
  };
  txns?: {
    h24?: {
      buys?: number;
      sells?: number;
    };
  };
  marketCap?: number;
  fdv?: number;
  info?: {
    imageUrl?: string;
  };
};

export type SecurityCheckStatus = "pass" | "warning" | "critical" | "unknown";
export type SecurityEvidenceLevel = "confirmed" | "inferred" | "unavailable";
export type SecurityProviderStatus = "available" | "partial" | "unavailable";

export type SecurityCheckKey =
  | "honeypot"
  | "buy_tax"
  | "sell_tax"
  | "transfer_tax"
  | "owner_can_mint"
  | "blacklist"
  | "whitelist"
  | "pausable"
  | "trading_restrictions"
  | "proxy"
  | "ownership_renounced"
  | "owner_privileges"
  | "verified_contract";

export type SecurityFinding = {
  key: SecurityCheckKey;
  label: string;
  status: SecurityCheckStatus;
  summary: string;
  explanation: string;
  evidence: SecurityEvidenceLevel;
  value?: string;
};

export type SecurityIntelligence = {
  status: SecurityProviderStatus;
  provider: "goplus";
  checkedAt: number;
  checks: SecurityFinding[];
  unavailableChecks: SecurityCheckKey[];
  criticalCount: number;
  warningCount: number;
  note?: string;
};

export type BaseScanStatus = "idle" | "loading" | "available" | "unavailable";
export type VerificationStatus = "verified" | "unverified" | "unknown";
export type BaseScanUnavailableReason =
  | "missing-key"
  | "request-failed"
  | "invalid-key"
  | "rate-limited"
  | "endpoint-unavailable"
  | "plan-restricted"
  | "no-data";

export type BaseScanIntelligence = {
  status: BaseScanStatus;
  reason?: BaseScanUnavailableReason;
  verificationStatus: VerificationStatus;
  contractName?: string;
  deployer?: string;
  creationTxHash?: string;
  createdAt?: number;
  tokenSupply?: string;
  holderCount?: number;
  holderCountUnavailableReason?: BaseScanUnavailableReason;
  tokenSupplyUnavailableReason?: BaseScanUnavailableReason;
  creationUnavailableReason?: BaseScanUnavailableReason;
  note?: string;
};

export type ScanErrorCode =
  | "invalid_address"
  | "no_base_pair"
  | "api_timeout"
  | "rate_limit"
  | "partial_contract_intelligence_failure"
  | "unexpected_server_error";

export type ScanApiResponse = {
  address: string;
  pair: DexPair | null;
  pairs: DexPair[];
  baseScan: BaseScanIntelligence;
  security: SecurityIntelligence;
  error?: string;
  errorCode?: ScanErrorCode;
  errors?: {
    dex?: string;
    baseScan?: string;
    security?: string;
  };
};

type FindingTone = "positive" | "warning" | "danger" | "neutral";

type ScoreReason = {
  title: string;
  detail: string;
  delta: number;
  tone: FindingTone;
};

type Finding = ScoreReason;

type ReportProvider = {
  id: "dexscreener" | "etherscan" | "goplus";
  status: "available" | "partial" | "unavailable";
  checkedAt?: string;
  reason?: string;
};

type DataConfidence = {
  score: number;
  label: "High" | "Medium" | "Low";
  completedChecks: string[];
  unavailableChecks: string[];
  reasons: ScoreReason[];
};

export type RiskLevel = "lower" | "moderate" | "high" | "critical" | "insufficient";

type ScanResult = {
  pair: DexPair;
  pairs: DexPair[];
  targetToken: DexToken;
  baseScan: BaseScanIntelligence;
  security: SecurityIntelligence;
  scoreVersion: string;
  score: number;
  riskLevel: RiskLevel;
  verdict: string;
  breakdown: {
    overall: number;
    market: number;
    contract: number;
    criticalFloorApplied: boolean;
    confidence: DataConfidence;
    marketReasons: ScoreReason[];
    contractReasons: ScoreReason[];
  };
  findings: ScoreReason[];
};

type DexResponse = {
  pairs?: DexPair[] | null;
};

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const BASE_CHAIN_ID = "8453";
const ETHERSCAN_API_URL = "https://api.etherscan.io/v2/api";
const GOPLUS_TOKEN_SECURITY_URL = "https://api.gopluslabs.io/api/v1/token_security/8453";
const DEX_TIMEOUT_MS = 10_000;
const ETHERSCAN_TIMEOUT_MS = 8_000;
const SECURITY_TIMEOUT_MS = 7_000;
const SECURITY_CACHE_MS = 90_000;
export const SCAN_DEADLINE_MS = 12_000;
const SUCCESS_CACHE_CONTROL = "public, max-age=0, s-maxage=120, stale-while-revalidate=60";
const ERROR_CACHE_CONTROL = "private, no-store";

const securityCache = new Map<string, { expiresAt: number; value: SecurityIntelligence }>();

class ScanApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

class EtherscanApiError extends Error {
  reason: BaseScanUnavailableReason;
  endpoint: string;

  constructor(reason: BaseScanUnavailableReason, endpoint: string, message: string) {
    super(message);
    this.reason = reason;
    this.endpoint = endpoint;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function numericStringValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return undefined;
  return value.trim() ? value : undefined;
}

function integerFromString(value: unknown) {
  const text = numericStringValue(value);
  if (!text) return undefined;
  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sameAddress(a?: string, b?: string) {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

export function isTokenContractAddress(value: string) {
  return ADDRESS_PATTERN.test(value) && value.toLowerCase() !== ZERO_ADDRESS;
}

export function providerTimeoutWithinDeadline(deadlineAt: number, maximumTimeoutMs: number, now = Date.now()) {
  return Math.max(0, Math.min(maximumTimeoutMs, deadlineAt - now));
}

function providerTimeoutOrThrow(deadlineAt: number, maximumTimeoutMs: number, label: string) {
  const timeoutMs = providerTimeoutWithinDeadline(deadlineAt, maximumTimeoutMs);
  if (timeoutMs <= 0) throw new ScanApiError(`${label} request timed out`);
  return timeoutMs;
}

const DEAD_ADDRESS = "0x000000000000000000000000000000000000dead";

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

function securityStringValue(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  return undefined;
}

function securityFirstValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = securityStringValue(record[key]);
    if (value !== undefined && value !== "") return value;
  }

  return undefined;
}

function securityFlagValue(record: Record<string, unknown>, keys: string[]) {
  const value = securityFirstValue(record, keys)?.trim().toLowerCase();
  if (value === undefined) return undefined;
  if (["1", "true", "yes"].includes(value)) return true;
  if (["0", "false", "no"].includes(value)) return false;
  return undefined;
}

function securityTaxPercent(record: Record<string, unknown>, keys: string[]) {
  const value = securityFirstValue(record, keys);
  if (value === undefined) return undefined;

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed <= 1 ? parsed * 100 : parsed;
}

function securityPercentText(value: number) {
  return `${value.toFixed(value < 1 ? 2 : 1).replace(/\.0$/, "")}%`;
}

function securityOwnerRenounced(record: Record<string, unknown>) {
  const explicit = securityFlagValue(record, ["owner_renounced", "is_renounced"]);
  if (explicit !== undefined) return explicit;

  const owner = securityFirstValue(record, ["owner_address"]);
  if (!owner) return undefined;
  const normalized = owner.toLowerCase();
  return normalized === ZERO_ADDRESS || normalized === DEAD_ADDRESS;
}

function securityFinding(
  key: SecurityCheckKey,
  label: string,
  status: SecurityCheckStatus,
  summary: string,
  explanation: string,
  evidence: SecurityEvidenceLevel,
  value?: string
): SecurityFinding {
  return { key, label, status, summary, explanation, evidence, value };
}

function unknownSecurityFinding(key: SecurityCheckKey, label: string, summary: string) {
  return securityFinding(
    key,
    label,
    "unknown",
    summary,
    "Security provider did not return this field. Missing security data is treated as insufficient information, not lower risk.",
    "unavailable"
  );
}

function securityLabel(key: SecurityCheckKey) {
  const labels: Record<SecurityCheckKey, string> = {
    honeypot: "Honeypot status",
    buy_tax: "Buy tax",
    sell_tax: "Sell tax",
    transfer_tax: "Transfer tax",
    owner_can_mint: "Owner can mint",
    blacklist: "Blacklist capability",
    whitelist: "Whitelist capability",
    pausable: "Pausable transfers",
    trading_restrictions: "Trading restrictions",
    proxy: "Proxy or upgradeable contract",
    ownership_renounced: "Ownership renounced",
    owner_privileges: "Owner privileges",
    verified_contract: "Open-source contract"
  };

  return labels[key];
}

function emptySecurityIntelligence(note = "Security data unavailable. Market and contract scanning can continue."): SecurityIntelligence {
  return {
    status: "unavailable",
    provider: "goplus",
    checkedAt: Date.now(),
    checks: SECURITY_CHECK_KEYS.map((key) => unknownSecurityFinding(key, securityLabel(key), "Security data unavailable")),
    unavailableChecks: [...SECURITY_CHECK_KEYS],
    criticalCount: 0,
    warningCount: 0,
    note
  };
}

export function normalizeGoPlusSecurityResponse(value: unknown, tokenAddress: string): SecurityIntelligence {
  if (!isRecord(value) || !isRecord(value.result)) {
    return emptySecurityIntelligence("Security provider returned an invalid response.");
  }

  const tokenRecord = Object.entries(value.result).find(
    ([address]) => address.toLowerCase() === tokenAddress.toLowerCase()
  )?.[1];
  if (!isRecord(tokenRecord)) {
    return emptySecurityIntelligence("Security provider did not return this token.");
  }

  const checks: SecurityFinding[] = [];
  const honeypot = securityFlagValue(tokenRecord, ["is_honeypot", "honeypot"]);
  const cannotSell = securityFlagValue(tokenRecord, ["cannot_sell_all", "cannot_sell"]);
  const buyTax = securityTaxPercent(tokenRecord, ["buy_tax"]);
  const sellTax = securityTaxPercent(tokenRecord, ["sell_tax"]);
  const transferTax = securityTaxPercent(tokenRecord, ["transfer_tax"]);
  const mintable = securityFlagValue(tokenRecord, ["is_mintable", "mintable", "owner_can_mint"]);
  const blacklist = securityFlagValue(tokenRecord, ["blacklist_function", "is_blacklisted", "blacklist"]);
  const whitelist = securityFlagValue(tokenRecord, ["whitelist_function", "is_whitelisted", "whitelist"]);
  const pausable = securityFlagValue(tokenRecord, ["transfer_pausable", "pausable"]);
  const tradingRestriction = securityFlagValue(tokenRecord, [
    "trading_cooldown",
    "personal_slippage_modifiable",
    "slippage_modifiable",
    "anti_whale_modifiable"
  ]);
  const proxy = securityFlagValue(tokenRecord, ["is_proxy", "proxy"]);
  const renounced = securityOwnerRenounced(tokenRecord);
  const verified = securityFlagValue(tokenRecord, ["is_open_source", "open_source", "verified_contract"]);
  const hiddenOwner = securityFlagValue(tokenRecord, ["hidden_owner"]);
  const takeBackOwnership = securityFlagValue(tokenRecord, ["can_take_back_ownership"]);
  const ownerModifiesBalance = securityFlagValue(tokenRecord, ["owner_change_balance"]);
  const ownerPrivileged = [hiddenOwner, takeBackOwnership, ownerModifiesBalance].some(Boolean);

  checks.push(
    honeypot === true || cannotSell === true
      ? securityFinding(
          "honeypot",
          "Honeypot status",
          "critical",
          cannotSell ? "Cannot sell detected" : "Honeypot detected",
          "Provider reports that selling may be blocked. This matters because holders may be unable to exit a position. Evidence: confirmed by provider response.",
          "confirmed"
        )
      : honeypot === false
        ? securityFinding(
            "honeypot",
            "Honeypot status",
            "pass",
            "No honeypot detected",
            "Provider did not flag honeypot behavior. This lowers this specific risk signal only; it is not a guarantee of safety. Evidence: confirmed by provider response.",
            "confirmed"
          )
        : unknownSecurityFinding("honeypot", "Honeypot status", "Honeypot status unknown")
  );

  checks.push(
    buyTax === undefined
      ? unknownSecurityFinding("buy_tax", "Buy tax", "Buy tax unknown")
      : securityFinding(
          "buy_tax",
          "Buy tax",
          buyTax > 10 ? "warning" : "pass",
          `Buy tax: ${securityPercentText(buyTax)}`,
          buyTax > 10
            ? "High buy tax can make entries expensive and can be changed in some contracts. Evidence: confirmed by provider response."
            : "Buy tax is not above the 10% high-tax threshold. Evidence: confirmed by provider response.",
          "confirmed",
          securityPercentText(buyTax)
        )
  );

  checks.push(
    sellTax === undefined
      ? unknownSecurityFinding("sell_tax", "Sell tax", "Sell tax unknown")
      : securityFinding(
          "sell_tax",
          "Sell tax",
          sellTax >= 100 ? "critical" : sellTax > 10 ? "warning" : "pass",
          `Sell tax: ${securityPercentText(sellTax)}`,
          sellTax >= 100
            ? "A 100% sell tax can make selling economically impossible. Evidence: confirmed by provider response."
            : sellTax > 10
              ? "Sell tax above 10% materially reduces exits and can indicate hostile token mechanics. Evidence: confirmed by provider response."
              : "Sell tax is not above the 10% high-tax threshold. Evidence: confirmed by provider response.",
          "confirmed",
          securityPercentText(sellTax)
        )
  );

  checks.push(
    transferTax === undefined
      ? unknownSecurityFinding("transfer_tax", "Transfer tax", "Transfer tax unknown")
      : securityFinding(
          "transfer_tax",
          "Transfer tax",
          transferTax > 10 ? "warning" : "pass",
          `Transfer tax: ${securityPercentText(transferTax)}`,
          transferTax > 10
            ? "High transfer tax can penalize normal wallet movement. Evidence: confirmed by provider response."
            : "Transfer tax is not above the 10% high-tax threshold. Evidence: confirmed by provider response.",
          "confirmed",
          securityPercentText(transferTax)
        )
  );

  checks.push(
    mintable === undefined
      ? unknownSecurityFinding("owner_can_mint", "Owner can mint", "Mint capability unknown")
      : mintable
        ? securityFinding(
            "owner_can_mint",
            "Owner can mint",
            "warning",
            "Owner can mint",
            "Mint authority can inflate supply and dilute holders. Evidence: confirmed by provider response.",
            "confirmed"
          )
        : securityFinding(
            "owner_can_mint",
            "Owner can mint",
            "pass",
            "No owner mint capability detected",
            "Provider did not flag mint authority. Evidence: confirmed by provider response.",
            "confirmed"
          )
  );

  checks.push(
    blacklist === undefined
      ? unknownSecurityFinding("blacklist", "Blacklist capability", "Blacklist capability unknown")
      : blacklist
        ? securityFinding(
            "blacklist",
            "Blacklist capability",
            "warning",
            "Blacklist capability enabled",
            "Blacklist controls can block selected wallets from transferring or selling. Evidence: confirmed by provider response.",
            "confirmed"
          )
        : securityFinding(
            "blacklist",
            "Blacklist capability",
            "pass",
            "No blacklist capability detected",
            "Provider did not flag blacklist controls. Evidence: confirmed by provider response.",
            "confirmed"
          )
  );

  checks.push(
    whitelist === undefined
      ? unknownSecurityFinding("whitelist", "Whitelist capability", "Whitelist capability unknown")
      : whitelist
        ? securityFinding(
            "whitelist",
            "Whitelist capability",
            "warning",
            "Whitelist capability enabled",
            "Whitelist controls can restrict who may trade or transfer. Evidence: confirmed by provider response.",
            "confirmed"
          )
        : securityFinding(
            "whitelist",
            "Whitelist capability",
            "pass",
            "No whitelist capability detected",
            "Provider did not flag whitelist controls. Evidence: confirmed by provider response.",
            "confirmed"
          )
  );

  checks.push(
    pausable === undefined
      ? unknownSecurityFinding("pausable", "Pausable transfers", "Pausable transfer status unknown")
      : pausable
        ? securityFinding(
            "pausable",
            "Pausable transfers",
            "warning",
            "Pausable transfers enabled",
            "Pausable transfers can stop movement during owner-controlled states. Evidence: confirmed by provider response.",
            "confirmed"
          )
        : securityFinding(
            "pausable",
            "Pausable transfers",
            "pass",
            "No pausable transfer control detected",
            "Provider did not flag pausable transfers. Evidence: confirmed by provider response.",
            "confirmed"
          )
  );

  checks.push(
    tradingRestriction === undefined
      ? unknownSecurityFinding("trading_restrictions", "Trading restrictions", "Trading restrictions unknown")
      : tradingRestriction
        ? securityFinding(
            "trading_restrictions",
            "Trading restrictions",
            "warning",
            "Trading restrictions detected",
            "Trading restrictions can limit exits, change slippage rules, or impose wallet-level limits. Evidence: inferred from provider restriction fields.",
            "inferred"
          )
        : securityFinding(
            "trading_restrictions",
            "Trading restrictions",
            "pass",
            "No trading restrictions detected",
            "Provider did not flag cooldown, slippage, or anti-whale restrictions. Evidence: inferred from provider restriction fields.",
            "inferred"
          )
  );

  checks.push(
    proxy === undefined
      ? unknownSecurityFinding("proxy", "Proxy or upgradeable contract", "Proxy status unknown")
      : proxy
        ? securityFinding(
            "proxy",
            "Proxy or upgradeable contract",
            "warning",
            "Upgradeable proxy",
            "Upgradeable contracts can change behavior after this scan. Evidence: confirmed by provider response.",
            "confirmed"
          )
        : securityFinding(
            "proxy",
            "Proxy or upgradeable contract",
            "pass",
            "No proxy detected",
            "Provider did not flag proxy behavior. Evidence: confirmed by provider response.",
            "confirmed"
          )
  );

  checks.push(
    renounced === undefined
      ? unknownSecurityFinding("ownership_renounced", "Ownership renounced", "Ownership status unknown")
      : renounced
        ? securityFinding(
            "ownership_renounced",
            "Ownership renounced",
            "pass",
            "Ownership renounced",
            "Renounced ownership can reduce direct owner control, though other privileged roles may still exist. Evidence: inferred from owner address or provider flag.",
            "inferred"
          )
        : securityFinding(
            "ownership_renounced",
            "Ownership renounced",
            "warning",
            "Ownership not renounced",
            "Active ownership can preserve administrative control over token behavior. Evidence: inferred from owner address or provider flag.",
            "inferred"
          )
  );

  checks.push(
    ownerPrivileged
      ? securityFinding(
          "owner_privileges",
          "Owner privileges",
          "warning",
          "Owner privileges detected",
          "Owner-only controls can alter balances, regain ownership, or hide control paths. Evidence: inferred from provider owner privilege fields.",
          "inferred"
        )
      : [hiddenOwner, takeBackOwnership, ownerModifiesBalance].every((value) => value === false)
        ? securityFinding(
            "owner_privileges",
            "Owner privileges",
            "pass",
            "No high-risk owner privileges detected",
            "Provider did not flag hidden owner, ownership recovery, or owner balance changes. Evidence: inferred from provider owner privilege fields.",
            "inferred"
          )
        : unknownSecurityFinding("owner_privileges", "Owner privileges", "Owner privilege status unknown")
  );

  checks.push(
    verified === undefined
      ? unknownSecurityFinding("verified_contract", "Open-source contract", "Open-source status unknown")
      : verified
        ? securityFinding(
            "verified_contract",
            "Open-source contract",
            "pass",
            "Contract verified/open-source",
            "Verified source improves reviewability. This is a positive signal only, not proof of safety. Evidence: confirmed by provider response.",
            "confirmed"
          )
        : securityFinding(
            "verified_contract",
            "Open-source contract",
            "warning",
            "Contract source not verified",
            "Unverified source limits independent review of token behavior. Evidence: confirmed by provider response.",
            "confirmed"
          )
  );

  const unavailableChecks = checks.filter((check) => check.status === "unknown").map((check) => check.key);
  const criticalCount = checks.filter((check) => check.status === "critical").length;
  const warningCount = checks.filter((check) => check.status === "warning").length;

  return {
    status: unavailableChecks.length ? "partial" : "available",
    provider: "goplus",
    checkedAt: Date.now(),
    checks,
    unavailableChecks,
    criticalCount,
    warningCount,
    note: unavailableChecks.length ? "Some security checks were unavailable. Missing data is not treated as lower risk." : undefined
  };
}

function emptyBaseScanIntelligence(status: BaseScanStatus = "idle", reason?: BaseScanUnavailableReason): BaseScanIntelligence {
  const unavailableNote =
    reason === "missing-key"
      ? "BaseScan checks unavailable. Server API key is not configured."
      : reason === "invalid-key"
        ? "Partial contract intelligence failure. The configured BaseScan API key appears invalid."
        : reason === "rate-limited"
          ? "Rate limit reached. Liquidity scan completed; BaseScan contract intelligence is partial."
          : reason === "endpoint-unavailable"
            ? "Partial contract intelligence failure. One or more BaseScan endpoints are unavailable."
            : reason === "plan-restricted"
              ? "Partial contract intelligence unavailable. Some fields require higher API access."
              : reason === "no-data"
                ? "BaseScan contract intelligence unavailable. No contract data was returned."
                : reason === "request-failed"
                  ? "Partial contract intelligence failure. Liquidity analysis completed, but BaseScan checks did not return."
                  : "BaseScan checks unavailable. DEX Screener analysis is still available.";

  return {
    status,
    reason,
    verificationStatus: "unknown",
    note: status === "unavailable" ? unavailableNote : undefined
  };
}

function parseDexToken(value: unknown): DexToken | undefined {
  if (!isRecord(value)) return undefined;

  const token: DexToken = {
    address: stringValue(value.address),
    name: stringValue(value.name),
    symbol: stringValue(value.symbol)
  };

  return token.address || token.name || token.symbol ? token : undefined;
}

function parseDexPair(value: unknown): DexPair | undefined {
  if (!isRecord(value)) return undefined;

  const chainId = stringValue(value.chainId);
  if (!chainId) return undefined;

  const liquidity = isRecord(value.liquidity) ? numberValue(value.liquidity.usd) : undefined;
  const volume = isRecord(value.volume) ? numberValue(value.volume.h24) : undefined;
  const priceChange = isRecord(value.priceChange) ? numberValue(value.priceChange.h24) : undefined;
  const h24Txns = isRecord(value.txns) && isRecord(value.txns.h24) ? value.txns.h24 : undefined;
  const buys = isRecord(h24Txns) ? numberValue(h24Txns.buys) : undefined;
  const sells = isRecord(h24Txns) ? numberValue(h24Txns.sells) : undefined;
  const rawPriceUsd = value.priceUsd;
  const imageUrl = isRecord(value.info) ? stringValue(value.info.imageUrl) : undefined;

  return {
    chainId,
    dexId: stringValue(value.dexId),
    url: stringValue(value.url),
    pairAddress: stringValue(value.pairAddress),
    pairCreatedAt: numberValue(value.pairCreatedAt),
    baseToken: parseDexToken(value.baseToken),
    quoteToken: parseDexToken(value.quoteToken),
    priceUsd:
      typeof rawPriceUsd === "string"
        ? rawPriceUsd
        : typeof rawPriceUsd === "number" && Number.isFinite(rawPriceUsd)
          ? String(rawPriceUsd)
          : undefined,
    liquidity: liquidity === undefined ? undefined : { usd: liquidity },
    volume: volume === undefined ? undefined : { h24: volume },
    priceChange: priceChange === undefined ? undefined : { h24: priceChange },
    txns: buys === undefined && sells === undefined ? undefined : { h24: { buys, sells } },
    marketCap: numberValue(value.marketCap),
    fdv: numberValue(value.fdv),
    info: imageUrl ? { imageUrl } : undefined
  };
}

function parseDexResponse(value: unknown): DexResponse {
  if (!isRecord(value) || !Array.isArray(value.pairs)) return { pairs: [] };
  return {
    pairs: value.pairs.map(parseDexPair).filter((pair): pair is DexPair => Boolean(pair))
  };
}

function pairIdentity(pair: DexPair) {
  if (pair.pairAddress) return `pair:${pair.pairAddress.toLowerCase()}`;
  if (pair.url) return `url:${pair.url.toLowerCase()}`;

  const base = pair.baseToken?.address?.toLowerCase() ?? "";
  const quote = pair.quoteToken?.address?.toLowerCase() ?? "";
  if (!pair.dexId || (!base && !quote)) return undefined;
  return `tokens:${pair.dexId.toLowerCase()}:${base}:${quote}:${pair.pairCreatedAt ?? "unknown"}`;
}

function normalizeBasePairs(pairs: DexPair[], tokenAddress: string) {
  const seen = new Set<string>();
  const normalized: DexPair[] = [];

  for (const pair of pairs) {
    if (
      pair.chainId !== "base" ||
      (!sameAddress(pair.baseToken?.address, tokenAddress) && !sameAddress(pair.quoteToken?.address, tokenAddress))
    ) {
      continue;
    }

    const identity = pairIdentity(pair);
    if (!identity || seen.has(identity)) continue;

    seen.add(identity);
    normalized.push(pair);
  }

  return normalized.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
}

async function fetchJson(url: URL | string, maximumTimeoutMs: number, label: string, deadlineAt: number) {
  const timeoutMs = providerTimeoutOrThrow(deadlineAt, maximumTimeoutMs, label);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new ScanApiError(`${label} returned HTTP ${response.status}`, response.status);
    }

    return (await response.json()) as unknown;
  } catch (error) {
    if (isAbortError(error)) {
      throw new ScanApiError(`${label} request timed out`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchDexPairs(tokenAddress: string, deadlineAt: number) {
  const url = `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(tokenAddress)}`;
  const json = await fetchJson(url, DEX_TIMEOUT_MS, "DEX Screener", deadlineAt);
  const pairs = parseDexResponse(json).pairs ?? [];
  return normalizeBasePairs(pairs, tokenAddress);
}

async function fetchSecurityJson(tokenAddress: string, deadlineAt: number) {
  const timeoutMs = providerTimeoutOrThrow(deadlineAt, SECURITY_TIMEOUT_MS, "GoPlus");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const url = new URL(GOPLUS_TOKEN_SECURITY_URL);
  url.searchParams.set("contract_addresses", tokenAddress);

  const headers: Record<string, string> = { accept: "application/json" };
  const apiKey = process.env.GOPLUS_API_KEY?.trim();
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new ScanApiError(`GoPlus returned HTTP ${response.status}`, response.status);
    }

    return (await response.json()) as unknown;
  } catch (error) {
    if (isAbortError(error)) {
      throw new ScanApiError("GoPlus request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchSecurityIntelligence(tokenAddress: string, deadlineAt: number) {
  const cacheKey = tokenAddress.toLowerCase();
  const cached = securityCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const json = await fetchSecurityJson(tokenAddress, deadlineAt);
    const value = normalizeGoPlusSecurityResponse(json, tokenAddress);
    securityCache.set(cacheKey, { expiresAt: Date.now() + SECURITY_CACHE_MS, value });
    return value;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Security provider request failed";
    console.warn(`[BaseScout] GoPlus security: ${message}`);
    const value = emptySecurityIntelligence("Security data unavailable. Market and contract scanning still completed.");
    securityCache.set(cacheKey, { expiresAt: Date.now() + Math.floor(SECURITY_CACHE_MS / 3), value });
    return value;
  }
}

function parseEtherscanArrayResult(value: unknown) {
  if (!isRecord(value)) return [];
  const result = value.result;
  return Array.isArray(result) ? result.filter(isRecord) : [];
}

function parseEtherscanStringResult(value: unknown) {
  if (!isRecord(value)) return undefined;
  return numericStringValue(value.result);
}

function parseHexInteger(value: unknown) {
  if (typeof value !== "string") return undefined;
  const parsed = Number.parseInt(value, value.startsWith("0x") ? 16 : 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function etherscanEndpointName(params: Record<string, string>) {
  return `${params.module ?? "unknown"}.${params.action ?? "unknown"}`;
}

function etherscanMessage(value: unknown) {
  if (!isRecord(value)) return "Invalid Etherscan response";
  const message = stringValue(value.message);
  const result = value.result;
  const resultText = typeof result === "string" ? result : undefined;
  return [message, resultText].filter(Boolean).join(" - ") || "Etherscan request failed";
}

function warnEtherscan(endpoint: string, message: string) {
  console.warn(`[BaseScout] Etherscan ${endpoint}: ${message}`);
}

function getEtherscanErrorReason(value: unknown): BaseScanUnavailableReason | undefined {
  if (!isRecord(value)) return undefined;
  const status = stringValue(value.status);
  if (status !== "0") return undefined;

  const message = `${stringValue(value.message) ?? ""} ${stringValue(value.result) ?? ""}`.toLowerCase();
  if (message.includes("invalid") && message.includes("key")) return "invalid-key";
  if (message.includes("rate") || message.includes("limit") || message.includes("throttle")) return "rate-limited";
  if (message.includes("pro") || message.includes("paid") || message.includes("plan") || message.includes("subscription")) {
    return "plan-restricted";
  }
  if (message.includes("not supported") || message.includes("not available") || message.includes("unavailable") || message.includes("deprecated")) {
    return "endpoint-unavailable";
  }
  if (message.includes("no data") || message.includes("not found") || message.includes("no records")) return "no-data";
  return "request-failed";
}

function hasVerifiedSource(sourceRecord: Record<string, unknown> | undefined) {
  if (!sourceRecord) return undefined;
  const sourceCode = stringValue(sourceRecord.SourceCode)?.trim();
  const abi = stringValue(sourceRecord.ABI)?.trim();
  return Boolean(sourceCode) && abi !== "Contract source code not verified";
}

function buildEtherscanApiUrl(params: Record<string, string>) {
  const url = new URL(ETHERSCAN_API_URL);
  url.searchParams.set("chainid", BASE_CHAIN_ID);

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const apiKey = process.env.ETHERSCAN_API_KEY?.trim();
  if (apiKey) url.searchParams.set("apikey", apiKey);
  return url;
}

async function fetchEtherscanJson(params: Record<string, string>, deadlineAt: number) {
  const endpoint = etherscanEndpointName(params);
  if (!process.env.ETHERSCAN_API_KEY?.trim()) {
    throw new EtherscanApiError("missing-key", endpoint, "Missing ETHERSCAN_API_KEY");
  }

  try {
    const json = await fetchJson(
      buildEtherscanApiUrl(params),
      ETHERSCAN_TIMEOUT_MS,
      `Etherscan ${endpoint}`,
      deadlineAt
    );
    const reason = getEtherscanErrorReason(json);
    if (reason) {
      const message = etherscanMessage(json);
      warnEtherscan(endpoint, message);
      throw new EtherscanApiError(reason, endpoint, message);
    }
    return json;
  } catch (error) {
    if (error instanceof EtherscanApiError) throw error;
    const status = error instanceof ScanApiError ? error.status : undefined;
    const reason: BaseScanUnavailableReason =
      status === 429 ? "rate-limited" : status && status >= 500 ? "endpoint-unavailable" : "request-failed";
    const message = error instanceof Error ? error.message : "Etherscan request failed";
    warnEtherscan(endpoint, message);
    throw new EtherscanApiError(reason, endpoint, message);
  }
}

function rejectedEtherscanReason(result: PromiseSettledResult<unknown>): BaseScanUnavailableReason | undefined {
  return result.status === "rejected" && result.reason instanceof EtherscanApiError
    ? result.reason.reason
    : undefined;
}

async function fetchCreationTimestamp(txHash: string | undefined, deadlineAt: number) {
  if (!txHash) return undefined;

  try {
    const txJson = await fetchEtherscanJson(
      {
        module: "proxy",
        action: "eth_getTransactionByHash",
        txhash: txHash
      },
      deadlineAt
    );
    const txResult = isRecord(txJson) && isRecord(txJson.result) ? txJson.result : undefined;
    const blockNumber = stringValue(txResult?.blockNumber);
    if (!blockNumber) return undefined;

    const blockJson = await fetchEtherscanJson(
      {
        module: "proxy",
        action: "eth_getBlockByNumber",
        tag: blockNumber,
        boolean: "false"
      },
      deadlineAt
    );
    const blockResult = isRecord(blockJson) && isRecord(blockJson.result) ? blockJson.result : undefined;
    const timestamp = parseHexInteger(blockResult?.timestamp);
    return timestamp ? timestamp * 1000 : undefined;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Creation timestamp lookup failed";
    warnEtherscan("proxy.creationTimestamp", message);
    return undefined;
  }
}

async function fetchBaseScanIntelligence(tokenAddress: string, deadlineAt: number): Promise<BaseScanIntelligence> {
  if (!process.env.ETHERSCAN_API_KEY?.trim()) {
    return emptyBaseScanIntelligence("unavailable", "missing-key");
  }

  const [sourceResult, creationResult, supplyResult, holderResult] = await Promise.allSettled([
    fetchEtherscanJson({ module: "contract", action: "getsourcecode", address: tokenAddress }, deadlineAt),
    fetchEtherscanJson(
      { module: "contract", action: "getcontractcreation", contractaddresses: tokenAddress },
      deadlineAt
    ),
    fetchEtherscanJson({ module: "stats", action: "tokensupply", contractaddress: tokenAddress }, deadlineAt),
    fetchEtherscanJson({ module: "token", action: "tokenholdercount", contractaddress: tokenAddress }, deadlineAt)
  ]);

  const fulfilled = [sourceResult, creationResult, supplyResult, holderResult].filter(
    (result) => result.status === "fulfilled"
  );

  if (!fulfilled.length) {
    const firstFailure = [sourceResult, creationResult, supplyResult, holderResult].find(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );
    const reason = firstFailure?.reason instanceof EtherscanApiError ? firstFailure.reason.reason : "request-failed";
    return emptyBaseScanIntelligence("unavailable", reason);
  }

  const sourceRecord =
    sourceResult.status === "fulfilled" ? parseEtherscanArrayResult(sourceResult.value)[0] : undefined;
  const creationRecord =
    creationResult.status === "fulfilled" ? parseEtherscanArrayResult(creationResult.value)[0] : undefined;
  const verified = hasVerifiedSource(sourceRecord);
  const createdAtSeconds = integerFromString(creationRecord?.timestamp);
  const creationTxHash = stringValue(creationRecord?.txHash);
  const createdAt = createdAtSeconds
    ? createdAtSeconds * 1000
    : await fetchCreationTimestamp(creationTxHash, deadlineAt);
  const holderCount =
    holderResult.status === "fulfilled" ? integerFromString(parseEtherscanStringResult(holderResult.value)) : undefined;
  const holderUnavailableReason =
    holderResult.status === "rejected" ? rejectedEtherscanReason(holderResult) : holderCount === undefined ? "no-data" : undefined;
  const supplyUnavailableReason = rejectedEtherscanReason(supplyResult);
  const creationUnavailableReason = rejectedEtherscanReason(creationResult);
  const hasPlanRestrictedField = [holderUnavailableReason, supplyUnavailableReason, creationUnavailableReason].includes("plan-restricted");

  return {
    status: "available",
    verificationStatus: verified === undefined ? "unknown" : verified ? "verified" : "unverified",
    contractName: stringValue(sourceRecord?.ContractName),
    deployer: stringValue(creationRecord?.contractCreator),
    creationTxHash,
    createdAt,
    tokenSupply: supplyResult.status === "fulfilled" ? parseEtherscanStringResult(supplyResult.value) : undefined,
    holderCount,
    holderCountUnavailableReason: holderCount === undefined ? holderUnavailableReason : undefined,
    tokenSupplyUnavailableReason:
      supplyResult.status === "rejected" || (supplyResult.status === "fulfilled" && !parseEtherscanStringResult(supplyResult.value))
        ? supplyUnavailableReason ?? "no-data"
        : undefined,
    creationUnavailableReason:
      creationResult.status === "rejected" || !createdAt
        ? creationUnavailableReason ?? "no-data"
        : undefined,
    note:
      hasPlanRestrictedField
        ? "Some BaseScan intelligence fields require higher API access."
        : holderResult.status === "rejected"
          ? holderResult.reason instanceof EtherscanApiError && holderResult.reason.reason === "rate-limited"
            ? "Holder count unavailable. BaseScan rate limited this endpoint."
            : "Holder count unavailable. BaseScan holder count may require a paid API plan."
          : undefined
  };
}

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

export const RISK_SCORE_VERSION = "2.0.0";

const BASELINE_RISK = 28;
const CRITICAL_RISK_FLOOR = 75;

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

export const REPORT_SCHEMA_VERSION = "1.0.0" as const;
export const REPORT_CHAIN_ID = 8453 as const;
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
) {
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
    chainId: REPORT_CHAIN_ID,
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
      { id: "dexscreener", status: "available", checkedAt: generatedAt } as ReportProvider,
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
) {
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

function scanErrorDetails(error: unknown): { error: string; errorCode: ScanErrorCode } {
  if (error instanceof ScanApiError && error.status === 429) {
    return {
      error: "Rate limit reached. Wait briefly before scanning again.",
      errorCode: "rate_limit"
    };
  }
  if (error instanceof ScanApiError && !error.status && error.message.toLowerCase().includes("timed out")) {
    return {
      error: "API timeout. DEX Screener did not respond before the request limit.",
      errorCode: "api_timeout"
    };
  }
  if (error instanceof ScanApiError && error.status && error.status >= 500) {
    return {
      error: "Unexpected server error. DEX Screener appears down or degraded.",
      errorCode: "unexpected_server_error"
    };
  }
  return {
    error: error instanceof Error ? error.message : "Unexpected server error. DEX Screener scan failed.",
    errorCode: "unexpected_server_error"
  };
}

function noBasePairMessage() {
  return "No Base pair found for this token. Confirm the contract is deployed on Base and has an indexed DEX pair.";
}

export function cacheControlForScanStatus(status: number) {
  return status >= 200 && status < 300 ? SUCCESS_CACHE_CONTROL : ERROR_CACHE_CONTROL;
}

function withResponseHeaders(response: ServerResponse, status: number, requestId?: string) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", cacheControlForScanStatus(status));
  if (requestId) response.setHeader("X-Request-Id", requestId);
}

function sendJson(response: ServerResponse, status: number, payload: unknown, requestId?: string) {
  try {
    if (!response.headersSent) withResponseHeaders(response, status, requestId);
    response.statusCode = status;
    response.end(JSON.stringify(payload));
  } catch (error) {
    console.error("[BaseScout] JSON serialization failed", error);
    if (response.writableEnded) return;

    try {
      if (!response.headersSent) withResponseHeaders(response, 500, requestId);
      response.statusCode = 500;
      response.end(
        JSON.stringify(
          requestId
            ? buildVersionedReportError(
                500,
                "unexpected_server_error",
                "Unexpected server error. Report API could not serialize the response.",
                requestId
              )
            : {
                error: "Unexpected server error. Scan API could not serialize the response.",
                errorCode: "unexpected_server_error"
              }
        )
      );
    } catch (fallbackError) {
      console.error("[BaseScout] JSON fallback response failed", fallbackError);
    }
  }
}

function requestUrl(request: IncomingMessage) {
  return new URL(request.url ?? "/", `https://${request.headers.host ?? "basescout.local"}`);
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  const url = requestUrl(request);
  const wantsVersionedReport =
    url.pathname === "/api/v1/report" || url.searchParams.get("reportVersion") === "1";
  const requestId = wantsVersionedReport ? randomUUID() : undefined;
  const generatedAtMs = Date.now();

  try {
    if (request.method !== "GET") {
      response.setHeader("Allow", "GET");
      sendJson(
        response,
        405,
        requestId
          ? buildVersionedReportError(405, "method_not_allowed", "Method not allowed. Use GET.", requestId, generatedAtMs)
          : { error: "Method not allowed." },
        requestId
      );
      return;
    }

    const result = await scanTokenData(url.searchParams.get("address") ?? "", generatedAtMs);

    if (!wantsVersionedReport || !requestId) {
      sendJson(response, result.status, result.payload);
      return;
    }

    if (result.status !== 200 || !result.payload.pair) {
      sendJson(
        response,
        result.status,
        buildVersionedReportError(
          result.status,
          result.payload.errorCode ?? "unexpected_server_error",
          result.payload.error ?? "The risk report could not be generated.",
          requestId,
          generatedAtMs
        ),
        requestId
      );
      return;
    }

    sendJson(
      response,
      200,
      buildVersionedRiskReport(result.payload, requestId, generatedAtMs),
      requestId
    );
  } catch (error) {
    console.error(`[BaseScout] ${wantsVersionedReport ? "Report" : "Scan"} API failed${requestId ? ` (${requestId})` : ""}`, error);
    sendJson(
      response,
      500,
      requestId
        ? buildVersionedReportError(
            500,
            "unexpected_server_error",
            "Unexpected server error. Report API could not complete the request.",
            requestId,
            generatedAtMs
          )
        : {
            error: "Unexpected server error. Scan API could not complete the request.",
            errorCode: "unexpected_server_error"
          },
      requestId
    );
  }
}

export type ScanTokenDataResult = {
  status: number;
  payload: ScanApiResponse;
};

export async function scanTokenData(rawAddress: string, now = Date.now()): Promise<ScanTokenDataResult> {
  const address = rawAddress.trim().toLowerCase();

  if (!isTokenContractAddress(address)) {
    return {
      status: 400,
      payload: {
        address,
        pair: null,
        pairs: [],
        baseScan: emptyBaseScanIntelligence("unavailable", "no-data"),
        security: emptySecurityIntelligence("Security checks were not run because the address is invalid."),
        error: "Invalid address. Enter a non-zero 0x token contract with 40 hexadecimal characters.",
        errorCode: "invalid_address"
      }
    };
  }

  const deadlineAt = now + SCAN_DEADLINE_MS;
  const [dexResult, baseScanResult, securityResult] = await Promise.allSettled([
    fetchDexPairs(address, deadlineAt),
    fetchBaseScanIntelligence(address, deadlineAt),
    fetchSecurityIntelligence(address, deadlineAt)
  ]);
  const baseScan =
    baseScanResult.status === "fulfilled"
      ? baseScanResult.value
      : emptyBaseScanIntelligence("unavailable", "request-failed");
  const security =
    securityResult.status === "fulfilled"
      ? securityResult.value
      : emptySecurityIntelligence("Security data unavailable. Market and contract scanning still completed.");
  const errors: ScanApiResponse["errors"] = {};

  if (baseScanResult.status === "rejected") {
    errors.baseScan = "Partial contract intelligence failure.";
  } else if (
    baseScan.status === "unavailable" &&
    baseScan.reason &&
    !["missing-key", "no-data"].includes(baseScan.reason)
  ) {
    errors.baseScan = "Partial contract intelligence failure.";
  }

  if (security.status === "unavailable") {
    errors.security = "Security intelligence unavailable.";
  }

  if (dexResult.status === "rejected") {
    const details = scanErrorDetails(dexResult.reason);
    return {
      status: 502,
      payload: {
        address,
        pair: null,
        pairs: [],
        baseScan,
        security,
        error: details.error,
        errorCode: details.errorCode,
        errors: { ...errors, dex: details.error }
      }
    };
  }

  const pairs = dexResult.value;
  const pair = pairs[0] ?? null;

  if (!pair) {
    return {
      status: 404,
      payload: {
        address,
        pair: null,
        pairs,
        baseScan,
        security,
        error: noBasePairMessage(),
        errorCode: "no_base_pair",
        errors: Object.keys(errors).length ? errors : undefined
      }
    };
  }

  return {
    status: 200,
    payload: {
      address,
      pair,
      pairs,
      baseScan,
      security,
      errors: Object.keys(errors).length ? errors : undefined
    }
  };
}
