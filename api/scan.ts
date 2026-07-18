import type { IncomingMessage, ServerResponse } from "node:http";

type DexToken = {
  address?: string;
  name?: string;
  symbol?: string;
};

type DexPair = {
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

type SecurityCheckStatus = "pass" | "warning" | "critical" | "unknown";
type SecurityEvidenceLevel = "confirmed" | "inferred" | "unavailable";
type SecurityProviderStatus = "available" | "partial" | "unavailable";

type SecurityCheckKey =
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

type SecurityFinding = {
  key: SecurityCheckKey;
  label: string;
  status: SecurityCheckStatus;
  summary: string;
  explanation: string;
  evidence: SecurityEvidenceLevel;
  value?: string;
};

type SecurityIntelligence = {
  status: SecurityProviderStatus;
  provider: "goplus";
  checkedAt: number;
  checks: SecurityFinding[];
  unavailableChecks: SecurityCheckKey[];
  criticalCount: number;
  warningCount: number;
  note?: string;
};

type BaseScanStatus = "idle" | "loading" | "available" | "unavailable";
type VerificationStatus = "verified" | "unverified" | "unknown";
type BaseScanUnavailableReason =
  | "missing-key"
  | "request-failed"
  | "invalid-key"
  | "rate-limited"
  | "endpoint-unavailable"
  | "plan-restricted"
  | "no-data";

type BaseScanIntelligence = {
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

type ScanErrorCode =
  | "invalid_address"
  | "no_base_pair"
  | "api_timeout"
  | "rate_limit"
  | "partial_contract_intelligence_failure"
  | "unexpected_server_error";

type ScanApiResponse = {
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

function withResponseHeaders(response: ServerResponse, status: number) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", cacheControlForScanStatus(status));
}

function sendJson(response: ServerResponse, status: number, payload: ScanApiResponse | { error: string; errorCode?: ScanErrorCode }) {
  try {
    if (!response.headersSent) withResponseHeaders(response, status);
    response.statusCode = status;
    response.end(JSON.stringify(payload));
  } catch (error) {
    console.error("[BaseScout] JSON serialization failed", error);
    if (response.writableEnded) return;

    try {
      if (!response.headersSent) withResponseHeaders(response, 500);
      response.statusCode = 500;
      response.end(
        JSON.stringify({
          error: "Unexpected server error. Scan API could not serialize the response.",
          errorCode: "unexpected_server_error"
        })
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
  try {
    if (request.method !== "GET") {
      response.setHeader("Allow", "GET");
      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }

    const url = requestUrl(request);
    const address = url.searchParams.get("address")?.trim() ?? "";

    if (!isTokenContractAddress(address)) {
      sendJson(response, 400, {
        error: "Invalid address. Enter a non-zero 0x token contract with 40 hexadecimal characters.",
        errorCode: "invalid_address"
      });
      return;
    }

    const deadlineAt = Date.now() + SCAN_DEADLINE_MS;
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
      sendJson(response, 502, {
        address,
        pair: null,
        pairs: [],
        baseScan,
        security,
        error: details.error,
        errorCode: details.errorCode,
        errors: { ...errors, dex: details.error }
      });
      return;
    }

    const pairs = dexResult.value;
    const pair = pairs[0] ?? null;

    if (!pair) {
      sendJson(response, 404, {
        address,
        pair: null,
        pairs,
        baseScan,
        security,
        error: noBasePairMessage(),
        errorCode: "no_base_pair",
        errors: Object.keys(errors).length ? errors : undefined
      });
      return;
    }

    sendJson(response, 200, {
      address,
      pair,
      pairs,
      baseScan,
      security,
      errors: Object.keys(errors).length ? errors : undefined
    });
  } catch (error) {
    console.error("[BaseScout] Scan API failed", error);
    sendJson(response, 500, {
      error: "Unexpected server error. Scan API could not complete the request.",
      errorCode: "unexpected_server_error"
    });
  }
}
