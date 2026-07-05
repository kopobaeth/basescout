import React, { ChangeEvent, FormEvent, useMemo, useRef, useState } from "react";
import { createRoot, Root } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  Database,
  ExternalLink,
  FileCheck2,
  Fingerprint,
  Info,
  KeyRound,
  Loader2,
  Search,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Users,
  WalletCards
} from "lucide-react";
import "./styles.css";

declare global {
  interface Window {
    __basescoutRoot?: Root;
  }
}

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
};

type DexResponse = {
  pairs?: DexPair[] | null;
};

type DexToken = {
  address?: string;
  name?: string;
  symbol?: string;
};

type FindingTone = "positive" | "warning" | "danger" | "neutral";

type Finding = {
  title: string;
  detail: string;
  delta: number;
  tone: FindingTone;
};

type ScanResult = {
  pair: DexPair;
  targetToken: DexToken;
  baseScan: BaseScanIntelligence;
  score: number;
  verdict: string;
  findings: Finding[];
};

type ScanStatus = "idle" | "loading" | "success" | "error";
type CopyState = "idle" | "copied" | "failed";
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

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const REQUEST_TIMEOUT_MS = 15_000;
const BASESCAN_TIMEOUT_MS = 8_000;
const BASESCAN_API_URL = "https://api.etherscan.io/v2/api";
const BASE_CHAIN_ID = "8453";
const EXAMPLE_TOKENS = [
  {
    symbol: "AERO",
    name: "Aerodrome",
    address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631"
  },
  {
    symbol: "VIRTUAL",
    name: "Virtual Protocol",
    address: "0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b"
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
  },
  {
    symbol: "LOW-LIQ",
    name: "Placeholder",
    address: "",
    disabled: true
  }
];

class BaseScanApiError extends Error {
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

function getBaseScanApiKey() {
  return import.meta.env.VITE_BASESCAN_API_KEY?.trim();
}

function emptyBaseScanIntelligence(status: BaseScanStatus = "idle", reason?: BaseScanIntelligence["reason"]): BaseScanIntelligence {
  const unavailableNote =
    reason === "missing-key"
      ? "BaseScan checks unavailable. Add VITE_BASESCAN_API_KEY to enable contract intelligence."
      : reason === "invalid-key"
        ? "BaseScan checks unavailable. The configured API key appears invalid."
        : reason === "rate-limited"
          ? "BaseScan checks unavailable. The API key is rate limited."
          : reason === "endpoint-unavailable"
            ? "BaseScan checks unavailable. One or more API endpoints are unavailable."
            : reason === "plan-restricted"
              ? "Some BaseScan intelligence fields require higher API access."
              : reason === "no-data"
                ? "BaseScan checks unavailable. No contract data was returned."
                : "BaseScan checks unavailable. DEX Screener analysis is still available.";

  return {
    status,
    reason,
    verificationStatus: "unknown",
    note: status === "unavailable" ? unavailableNote : undefined
  };
}

function baseScanUrlFor(address?: string) {
  return address ? `https://basescan.org/token/${address}` : undefined;
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
    fdv: numberValue(value.fdv)
  };
}

function parseDexResponse(value: unknown): DexResponse {
  if (!isRecord(value)) return { pairs: [] };
  if (!Array.isArray(value.pairs)) return { pairs: [] };

  return {
    pairs: value.pairs.map(parseDexPair).filter((pair): pair is DexPair => Boolean(pair))
  };
}

function parseBaseScanArrayResult(value: unknown) {
  if (!isRecord(value)) return [];
  const result = value.result;
  return Array.isArray(result) ? result.filter(isRecord) : [];
}

function parseBaseScanStringResult(value: unknown) {
  if (!isRecord(value)) return undefined;
  return numericStringValue(value.result);
}

function parseHexInteger(value: unknown) {
  if (typeof value !== "string") return undefined;
  const parsed = Number.parseInt(value, value.startsWith("0x") ? 16 : 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function baseScanEndpointName(params: Record<string, string>) {
  return `${params.module ?? "unknown"}.${params.action ?? "unknown"}`;
}

function baseScanMessage(value: unknown) {
  if (!isRecord(value)) return "Invalid BaseScan response";
  const message = stringValue(value.message);
  const result = value.result;
  const resultText = typeof result === "string" ? result : undefined;
  return [message, resultText].filter(Boolean).join(" - ") || "BaseScan request failed";
}

function warnBaseScan(endpoint: string, message: string) {
  console.warn(`[BaseScout] BaseScan ${endpoint}: ${message}`);
}

function getBaseScanErrorReason(value: unknown): BaseScanUnavailableReason | undefined {
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

function buildBaseScanApiUrl(params: Record<string, string>) {
  const url = new URL(BASESCAN_API_URL);
  url.searchParams.set("chainid", BASE_CHAIN_ID);

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return url;
}

function dexHttpErrorMessage(status: number) {
  if (status === 429) return "DEX Screener is rate limiting requests. Try again shortly.";
  if (status >= 500) return "DEX Screener appears down or degraded. Try again shortly.";
  return `DEX Screener returned HTTP ${status}. Try again shortly.`;
}

function dexErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "DEX Screener request timed out. Try again shortly.";
  }

  if (error instanceof TypeError) {
    return "DEX Screener is unreachable. Check your connection or try again shortly.";
  }

  if (error instanceof Error) return error.message;

  return "DEX Screener scan failed. Try again shortly.";
}

function noBasePairMessage() {
  return "No Base pair found for this token. Confirm the contract is deployed on Base and has an indexed DEX pair.";
}

async function fetchBaseScanJson(params: Record<string, string>, signal: AbortSignal) {
  const endpoint = baseScanEndpointName(params);
  const apiKey = getBaseScanApiKey();
  if (!apiKey) throw new BaseScanApiError("missing-key", endpoint, "Missing BaseScan API key");

  const url = buildBaseScanApiUrl({
    ...params,
    apikey: apiKey
  });
  const response = await fetch(url, { signal });

  if (!response.ok) {
    const reason = response.status === 429 ? "rate-limited" : response.status >= 500 ? "endpoint-unavailable" : "request-failed";
    const message = `HTTP ${response.status}`;
    warnBaseScan(endpoint, message);
    throw new BaseScanApiError(reason, endpoint, message);
  }

  const json = (await response.json()) as unknown;
  const reason = getBaseScanErrorReason(json);
  if (reason) {
    const message = baseScanMessage(json);
    warnBaseScan(endpoint, message);
    throw new BaseScanApiError(reason, endpoint, message);
  }

  return json;
}

async function withBaseScanTimeout<T>(parentSignal: AbortSignal, task: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), BASESCAN_TIMEOUT_MS);
  const abortFromParent = () => controller.abort();
  parentSignal.addEventListener("abort", abortFromParent, { once: true });

  try {
    return await task(controller.signal);
  } finally {
    window.clearTimeout(timeoutId);
    parentSignal.removeEventListener("abort", abortFromParent);
  }
}

function rejectedBaseScanReason(result: PromiseSettledResult<unknown>): BaseScanUnavailableReason | undefined {
  return result.status === "rejected" && result.reason instanceof BaseScanApiError
    ? result.reason.reason
    : undefined;
}

async function fetchCreationTimestamp(txHash: string | undefined, signal: AbortSignal) {
  if (!txHash) return undefined;

  try {
    const txJson = await fetchBaseScanJson(
      { module: "proxy", action: "eth_getTransactionByHash", txhash: txHash },
      signal
    );
    const txResult = isRecord(txJson) && isRecord(txJson.result) ? txJson.result : undefined;
    const blockNumber = stringValue(txResult?.blockNumber);
    if (!blockNumber) return undefined;

    const blockJson = await fetchBaseScanJson(
      { module: "proxy", action: "eth_getBlockByNumber", tag: blockNumber, boolean: "false" },
      signal
    );
    const blockResult = isRecord(blockJson) && isRecord(blockJson.result) ? blockJson.result : undefined;
    const timestamp = parseHexInteger(blockResult?.timestamp);
    return timestamp ? timestamp * 1000 : undefined;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Creation timestamp lookup failed";
    warnBaseScan("proxy.creationTimestamp", message);
    return undefined;
  }
}

async function fetchBaseScanIntelligence(tokenAddress: string, parentSignal: AbortSignal): Promise<BaseScanIntelligence> {
  if (!getBaseScanApiKey()) {
    return emptyBaseScanIntelligence("unavailable", "missing-key");
  }

  return withBaseScanTimeout(parentSignal, async (signal) => {
    const [sourceResult, creationResult, supplyResult, holderResult] = await Promise.allSettled([
      fetchBaseScanJson({ module: "contract", action: "getsourcecode", address: tokenAddress }, signal),
      fetchBaseScanJson({ module: "contract", action: "getcontractcreation", contractaddresses: tokenAddress }, signal),
      fetchBaseScanJson({ module: "stats", action: "tokensupply", contractaddress: tokenAddress }, signal),
      fetchBaseScanJson({ module: "token", action: "tokenholdercount", contractaddress: tokenAddress }, signal)
    ]);

    const fulfilled = [sourceResult, creationResult, supplyResult, holderResult].filter(
      (result) => result.status === "fulfilled"
    );

    if (!fulfilled.length) {
      const firstFailure = [sourceResult, creationResult, supplyResult, holderResult].find(
        (result): result is PromiseRejectedResult => result.status === "rejected"
      );
      const reason =
        firstFailure?.reason instanceof BaseScanApiError ? firstFailure.reason.reason : "request-failed";
      return emptyBaseScanIntelligence("unavailable", reason);
    }

    const sourceRecord =
      sourceResult.status === "fulfilled" ? parseBaseScanArrayResult(sourceResult.value)[0] : undefined;
    const creationRecord =
      creationResult.status === "fulfilled" ? parseBaseScanArrayResult(creationResult.value)[0] : undefined;
    const verified = hasVerifiedSource(sourceRecord);
    const createdAtSeconds = integerFromString(creationRecord?.timestamp);
    const creationTxHash = stringValue(creationRecord?.txHash);
    const createdAt = createdAtSeconds ? createdAtSeconds * 1000 : await fetchCreationTimestamp(creationTxHash, signal);
    const holderCount =
      holderResult.status === "fulfilled" ? integerFromString(parseBaseScanStringResult(holderResult.value)) : undefined;
    const holderUnavailableReason =
      holderResult.status === "rejected" ? rejectedBaseScanReason(holderResult) : holderCount === undefined ? "no-data" : undefined;
    const supplyUnavailableReason = rejectedBaseScanReason(supplyResult);
    const creationUnavailableReason = rejectedBaseScanReason(creationResult);
    const hasPlanRestrictedField = [holderUnavailableReason, supplyUnavailableReason, creationUnavailableReason].includes("plan-restricted");

    const intelligence: BaseScanIntelligence = {
      status: "available",
      verificationStatus: verified === undefined ? "unknown" : verified ? "verified" : "unverified",
      contractName: stringValue(sourceRecord?.ContractName),
      deployer: stringValue(creationRecord?.contractCreator),
      creationTxHash,
      createdAt,
      tokenSupply: supplyResult.status === "fulfilled" ? parseBaseScanStringResult(supplyResult.value) : undefined,
      holderCount,
      holderCountUnavailableReason: holderCount === undefined ? holderUnavailableReason : undefined,
      tokenSupplyUnavailableReason:
        supplyResult.status === "rejected" || (supplyResult.status === "fulfilled" && !parseBaseScanStringResult(supplyResult.value))
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
          ? holderResult.reason instanceof BaseScanApiError && holderResult.reason.reason === "rate-limited"
            ? "Holder count unavailable. BaseScan rate limited this endpoint."
            : "Holder count unavailable. BaseScan holder count may require a paid API plan."
          : undefined
    };

    return intelligence;
  }).catch((error) =>
    emptyBaseScanIntelligence(
      "unavailable",
      error instanceof BaseScanApiError ? error.reason : "request-failed"
    )
  );
}

function currency(value: number | undefined, compact = false) {
  if (!Number.isFinite(value)) return "Unavailable";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value && value < 1 ? 6 : compact ? 1 : 2,
    notation: compact ? "compact" : "standard"
  }).format(value as number);
}

function numberText(value: number | undefined) {
  if (!Number.isFinite(value)) return "Unavailable";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0
  }).format(value as number);
}

function percentText(value: number | undefined) {
  if (!Number.isFinite(value)) return "Unavailable";
  return `${(value as number).toFixed(2)}%`;
}

function ageInDays(pairCreatedAt?: number) {
  if (!pairCreatedAt) return undefined;
  const ageMs = Date.now() - pairCreatedAt;
  if (ageMs < 0) return 0;
  return ageMs / 86_400_000;
}

function pairAgeText(pairCreatedAt?: number) {
  const days = ageInDays(pairCreatedAt);
  if (!Number.isFinite(days)) return "Unavailable";
  if ((days as number) < 1) {
    const hours = Math.max(1, Math.floor(((days as number) * 24)));
    return `${hours}h`;
  }
  if ((days as number) < 60) return `${Math.floor(days as number)}d`;
  return `${Math.floor((days as number) / 30)}mo`;
}

function dateText(timestamp?: number) {
  if (!timestamp) return "Unavailable";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(new Date(timestamp));
}

function thresholdAgeText(days: number) {
  if (days < 1) return `${Math.max(1, Math.floor(days * 24))} hours`;
  return `${Math.floor(days)} days`;
}

function supplyText(value?: string) {
  if (!value) return "Unavailable";
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function baseScanUnavailableText(reason?: BaseScanUnavailableReason, fallback = "Unavailable") {
  if (!reason) return fallback;
  if (reason === "plan-restricted") return "Plan restricted";
  return "Not available";
}

function holderCountText(baseScan: BaseScanIntelligence, loading: boolean) {
  if (loading) return "Checking";
  if (Number.isFinite(baseScan.holderCount)) return numberText(baseScan.holderCount);
  return baseScanUnavailableText(baseScan.holderCountUnavailableReason ?? baseScan.reason);
}

function supplyFallbackText(pair?: DexPair) {
  const value = pair?.marketCap ?? pair?.fdv;
  if (!Number.isFinite(value)) return undefined;
  return `${pair?.marketCap ? "Market cap" : "FDV"} ${currency(value, true)}`;
}

function supplyDisplayText(baseScan: BaseScanIntelligence, loading: boolean, pair?: DexPair) {
  if (loading) return "Checking";
  if (baseScan.tokenSupply) return supplyText(baseScan.tokenSupply);
  const fallback = supplyFallbackText(pair);
  if (fallback) return fallback;
  return baseScanUnavailableText(baseScan.tokenSupplyUnavailableReason ?? baseScan.reason);
}

function deployerText(baseScan: BaseScanIntelligence, loading: boolean) {
  if (loading) return "Checking";
  if (baseScan.deployer) return baseScan.deployer;
  return baseScanUnavailableText(baseScan.creationUnavailableReason ?? baseScan.reason);
}

function creationAgeText(baseScan: BaseScanIntelligence, loading: boolean) {
  if (loading) return "Checking";
  if (baseScan.createdAt) return `${pairAgeText(baseScan.createdAt)} (${dateText(baseScan.createdAt)})`;
  return baseScanUnavailableText(baseScan.creationUnavailableReason ?? baseScan.reason);
}

function isMutedValue(value: string) {
  return value === "Plan restricted" || value === "Not available";
}

function clampScore(score: number) {
  return Math.max(4, Math.min(96, score));
}

function sameAddress(a?: string, b?: string) {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

function getTargetToken(pair: DexPair, tokenAddress: string) {
  if (sameAddress(pair.baseToken?.address, tokenAddress)) return pair.baseToken ?? {};
  if (sameAddress(pair.quoteToken?.address, tokenAddress)) return pair.quoteToken ?? {};
  return pair.baseToken ?? {};
}

function addFinding(findings: Finding[], title: string, detail: string, delta: number, tone: FindingTone) {
  findings.push({ title, detail, delta, tone });
  return delta;
}

function calculateRisk(pair: DexPair, tokenAddress: string, baseScan: BaseScanIntelligence): ScanResult {
  let score = 72;
  const findings: Finding[] = [];
  const liquidity = pair.liquidity?.usd ?? 0;
  const days = ageInDays(pair.pairCreatedAt);
  const buys = pair.txns?.h24?.buys ?? 0;
  const sells = pair.txns?.h24?.sells ?? 0;
  const txns = buys + sells;
  const volume = pair.volume?.h24 ?? 0;
  const marketValue = pair.marketCap ?? pair.fdv ?? 0;
  const priceChange = pair.priceChange?.h24 ?? 0;

  if (liquidity >= 500_000) {
    score += addFinding(
      findings,
      "Deep liquidity",
      `${currency(liquidity)} is above the $500k deep-liquidity threshold, reducing expected slippage.`,
      5,
      "positive"
    );
  } else if (liquidity >= 50_000) {
    score += addFinding(
      findings,
      "Moderate liquidity",
      `${currency(liquidity)} sits inside the $50k-$500k watch zone where position size matters.`,
      -9,
      "warning"
    );
  } else {
    score += addFinding(
      findings,
      "Thin liquidity",
      `${currency(liquidity)} is below the $50k thin-liquidity threshold and can move sharply on small orders.`,
      -18,
      "danger"
    );
  }

  if (!Number.isFinite(days)) {
    addFinding(findings, "Pair age unavailable", "DEX Screener did not return a pair creation timestamp.", 0, "neutral");
  } else if ((days as number) >= 30) {
    score += addFinding(
      findings,
      "Established pair",
      `Pair age is ${thresholdAgeText(days as number)}, above the 30-day maturity threshold.`,
      5,
      "positive"
    );
  } else if ((days as number) >= 3) {
    score += addFinding(
      findings,
      "Young pair",
      `Pair age is ${thresholdAgeText(days as number)}, inside the 3-30 day watch zone.`,
      -9,
      "warning"
    );
  } else {
    score += addFinding(
      findings,
      "Very new pair",
      `Pair age is ${thresholdAgeText(days as number)}, below the 3-day new-pair threshold.`,
      -18,
      "danger"
    );
  }

  if (txns >= 1_000) {
    score += addFinding(
      findings,
      "Active trading",
      `${numberText(txns)} transactions in 24h (${numberText(buys)} buys, ${numberText(sells)} sells), above the 1,000 activity threshold.`,
      5,
      "positive"
    );
  } else if (txns >= 100) {
    score += addFinding(
      findings,
      "Limited trading",
      `${numberText(txns)} transactions in 24h (${numberText(buys)} buys, ${numberText(sells)} sells), inside the 100-999 activity watch zone.`,
      -9,
      "warning"
    );
  } else {
    score += addFinding(
      findings,
      "Low transaction count",
      `${numberText(txns)} transactions in 24h (${numberText(buys)} buys, ${numberText(sells)} sells), below the 100 transaction threshold.`,
      -18,
      "danger"
    );
  }

  if (liquidity > 0) {
    const turnoverRatio = volume / liquidity;
    if (turnoverRatio > 10) {
      score += addFinding(
        findings,
        "Turnover spike",
        `24h volume/liquidity is ${turnoverRatio.toFixed(1)}x, above the 10x churn threshold.`,
        -9,
        "warning"
      );
    } else {
      addFinding(
        findings,
        "Turnover contained",
        `24h volume/liquidity is ${turnoverRatio.toFixed(1)}x, below the 10x churn threshold.`,
        0,
        "neutral"
      );
    }
  }

  if (liquidity > 0 && marketValue > 0) {
    const capRatio = marketValue / liquidity;
    if (capRatio > 80) {
      score += addFinding(
        findings,
        "Extreme valuation gap",
        `Market value/liquidity is ${capRatio.toFixed(1)}x, above the 80x extreme threshold.`,
        -18,
        "danger"
      );
    } else if (capRatio > 25) {
      score += addFinding(
        findings,
        "Elevated valuation gap",
        `Market value/liquidity is ${capRatio.toFixed(1)}x, above the 25x watch threshold.`,
        -9,
        "warning"
      );
    } else {
      addFinding(
        findings,
        "Valuation supported",
        `Market value/liquidity is ${capRatio.toFixed(1)}x, below the 25x watch threshold.`,
        0,
        "neutral"
      );
    }
  } else {
    addFinding(
      findings,
      "Valuation ratio unavailable",
      "Market cap, FDV, or liquidity was missing, so market value/liquidity could not be scored.",
      0,
      "neutral"
    );
  }

  const absoluteMove = Math.abs(priceChange);
  if (absoluteMove > 80) {
    score += addFinding(
      findings,
      "Extreme price move",
      `Absolute 24h price move is ${absoluteMove.toFixed(2)}%, above the 80% extreme-volatility threshold.`,
      -18,
      "danger"
    );
  } else if (absoluteMove > 30) {
    score += addFinding(
      findings,
      "Large price move",
      `Absolute 24h price move is ${absoluteMove.toFixed(2)}%, above the 30% volatility watch threshold.`,
      -9,
      "warning"
    );
  } else {
    addFinding(
      findings,
      "Price move contained",
      `Absolute 24h price move is ${absoluteMove.toFixed(2)}%, below the 30% volatility watch threshold.`,
      0,
      "neutral"
    );
  }

  if (baseScan.status === "unavailable") {
    addFinding(
      findings,
      "BaseScan checks unavailable",
      baseScan.note ?? "BaseScan checks unavailable. DEX Screener-only analysis is shown.",
      0,
      "neutral"
    );
  } else if (baseScan.status === "available") {
    if (baseScan.verificationStatus === "verified") {
      score += addFinding(
        findings,
        "Verified contract",
        `${baseScan.contractName ? `${baseScan.contractName} ` : "Contract "}source is verified on BaseScan.`,
        5,
        "positive"
      );
    } else if (baseScan.verificationStatus === "unverified") {
      score += addFinding(
        findings,
        "Unverified contract",
        "BaseScan does not show verified source code for this contract.",
        -18,
        "danger"
      );
    } else {
      addFinding(
        findings,
        "Verification unknown",
        "BaseScan did not return a conclusive source verification result.",
        0,
        "neutral"
      );
    }

    const contractAgeDays = ageInDays(baseScan.createdAt);
    if (Number.isFinite(contractAgeDays)) {
      if ((contractAgeDays as number) < 3) {
        score += addFinding(
          findings,
          "Fresh deployment",
          `Contract age is ${thresholdAgeText(contractAgeDays as number)}, below the 3-day deployment threshold.`,
          -18,
          "danger"
        );
      } else if ((contractAgeDays as number) < 30) {
        score += addFinding(
          findings,
          "Recent deployment",
          `Contract age is ${thresholdAgeText(contractAgeDays as number)}, inside the 3-30 day watch zone.`,
          -9,
          "warning"
        );
      } else {
        addFinding(
          findings,
          "Deployment age established",
          `Contract age is ${thresholdAgeText(contractAgeDays as number)}, above the 30-day watch zone.`,
          0,
          "neutral"
        );
      }
    }

    if (baseScan.deployer) {
      addFinding(
        findings,
        "Deployer found",
        `BaseScan reports deployer ${baseScan.deployer}.`,
        0,
        "neutral"
      );
    }

    if (Number.isFinite(baseScan.holderCount)) {
      if ((baseScan.holderCount as number) < 100) {
        score += addFinding(
          findings,
          "Holder count very low",
          `${numberText(baseScan.holderCount)} holders is below the 100-holder danger threshold.`,
          -12,
          "danger"
        );
      } else if ((baseScan.holderCount as number) < 1_000) {
        score += addFinding(
          findings,
          "Holder count low",
          `${numberText(baseScan.holderCount)} holders is inside the 100-1,000 holder watch zone.`,
          -6,
          "warning"
        );
      } else {
        addFinding(
          findings,
          "Holder count established",
          `${numberText(baseScan.holderCount)} holders is above the 1,000-holder watch zone.`,
          0,
          "neutral"
        );
      }
    }
  }

  const finalScore = clampScore(score);
  const verdict =
    finalScore >= 75 ? "Looks tradable" : finalScore >= 45 ? "Proceed carefully" : "High risk";

  return {
    pair,
    targetToken: getTargetToken(pair, tokenAddress),
    baseScan,
    score: finalScore,
    verdict,
    findings
  };
}

function pickBestBasePair(pairs: DexPair[], tokenAddress: string) {
  const basePairs = pairs.filter(
    (pair) => pair.chainId === "base" && sameAddress(pair.baseToken?.address, tokenAddress)
  );

  return [...basePairs].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
}

async function writeClipboardText(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the DOM copy path for browsers that expose but deny Clipboard API writes.
    }
  }

  const textarea = document.createElement("textarea");
  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus({ preventScroll: true });
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const copied = document.execCommand("copy");
  textarea.remove();
  activeElement?.focus();

  if (!copied) throw new Error("Copy command failed");
}

function scoreTone(score: number) {
  if (score >= 75) return "good";
  if (score >= 45) return "caution";
  return "bad";
}

function App() {
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [baseScan, setBaseScan] = useState<BaseScanIntelligence>(() => emptyBaseScanIntelligence());
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const activeRequestRef = useRef<AbortController | null>(null);
  const scanIdRef = useRef(0);

  const normalizedAddress = address.trim();
  const isValidAddress = ADDRESS_PATTERN.test(normalizedAddress);
  const isLoading = status === "loading";
  const selectedPair = result?.pair;
  const selectedToken = result?.targetToken;
  const activeBaseScan = result?.baseScan ?? baseScan;
  const baseScanTokenAddress = selectedToken?.address ?? (isValidAddress ? normalizedAddress : undefined);
  const baseScanUrl = baseScanUrlFor(baseScanTokenAddress);
  const isBaseScanLoading = activeBaseScan.status === "loading";
  const verificationLabel =
    activeBaseScan.verificationStatus === "verified"
      ? "Verified"
      : activeBaseScan.verificationStatus === "unverified"
        ? "Unverified"
        : "Unknown";
  const marketValue = selectedPair?.marketCap ?? selectedPair?.fdv;
  const txns24h = selectedPair
    ? (selectedPair.txns?.h24?.buys ?? 0) + (selectedPair.txns?.h24?.sells ?? 0)
    : undefined;

  const scoreStyle = useMemo(() => {
    if (!result) return undefined;
    return {
      "--score": `${result.score * 3.6}deg`,
      "--score-color": result.score >= 75 ? "#15b881" : result.score >= 45 ? "#f4a62a" : "#e5484d"
    } as React.CSSProperties;
  }, [result]);

  function resetForInput(nextAddress: string) {
    setAddress(nextAddress);
    setError("");
    setCopyState("idle");

    if (status !== "idle" || result) {
      scanIdRef.current += 1;
      activeRequestRef.current?.abort();
      activeRequestRef.current = null;
      setStatus("idle");
      setResult(null);
      setBaseScan(emptyBaseScanIntelligence());
    }
  }

  function handleAddressInput(event: ChangeEvent<HTMLInputElement>) {
    resetForInput(event.target.value);
  }

  async function scanToken(rawAddress: string) {
    const tokenAddress = rawAddress.trim();
    const scanId = scanIdRef.current + 1;
    scanIdRef.current = scanId;

    activeRequestRef.current?.abort();
    activeRequestRef.current = null;
    setAddress(tokenAddress);
    setError("");
    setCopyState("idle");
    setBaseScan(getBaseScanApiKey() ? emptyBaseScanIntelligence("loading") : emptyBaseScanIntelligence("unavailable", "missing-key"));

    if (!ADDRESS_PATTERN.test(tokenAddress)) {
      setStatus("error");
      setResult(null);
      setError("Enter a valid EVM contract address.");
      return;
    }

    setStatus("loading");
    setResult(null);

    const controller = new AbortController();
    activeRequestRef.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const [dexResult, baseScanResult] = await Promise.allSettled([
        fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`, {
          signal: controller.signal
        }),
        fetchBaseScanIntelligence(tokenAddress, controller.signal)
      ]);

      const baseScanIntelligence =
        baseScanResult.status === "fulfilled"
          ? baseScanResult.value
          : emptyBaseScanIntelligence("unavailable", "request-failed");

      if (scanId !== scanIdRef.current) return;
      setBaseScan(baseScanIntelligence);

      if (dexResult.status === "rejected") {
        throw dexResult.reason;
      }

      const response = dexResult.value;
      if (!response.ok) {
        throw new Error(dexHttpErrorMessage(response.status));
      }

      const data = parseDexResponse(await response.json());
      const pairs = data.pairs ?? [];
      const bestPair = pickBestBasePair(pairs, tokenAddress);

      if (scanId !== scanIdRef.current) return;

      if (!bestPair) {
        setStatus("error");
        setError(noBasePairMessage());
        return;
      }

      setResult(calculateRisk(bestPair, tokenAddress, baseScanIntelligence));
      setStatus("success");
    } catch (scanError) {
      if (scanId !== scanIdRef.current) return;
      setStatus("error");
      setError(dexErrorMessage(scanError));
    } finally {
      window.clearTimeout(timeoutId);
      if (activeRequestRef.current === controller) {
        activeRequestRef.current = null;
      }
    }
  }

  function handleScan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void scanToken(address);
  }

  async function copyPairAddress() {
    if (!selectedPair?.pairAddress) return;

    try {
      await writeClipboardText(selectedPair.pairAddress);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1600);
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <main className="shell">
      <nav className="topbar" aria-label="Primary navigation">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <ScanLine size={18} />
          </span>
          <span>BaseScout</span>
        </div>
        <div className="network-pill">
          <span className="status-dot" />
          Base mainnet
        </div>
      </nav>
      <p className="data-note">Data from DEX Screener and BaseScan.</p>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Base token risk scanner</p>
          <h1>Scan the token. Read the risk. Then decide.</h1>
        </div>

        <form className="scanner" onSubmit={handleScan}>
          <label htmlFor="token-address">Token contract address</label>
          <div className="input-row">
            <div className="input-shell">
              <Fingerprint size={18} aria-hidden="true" />
              <input
                id="token-address"
                value={address}
                onChange={handleAddressInput}
                placeholder="0x..."
                spellCheck={false}
                autoComplete="off"
              />
            </div>
            <button type="submit" disabled={isLoading}>
              {isLoading ? <Loader2 className="spin" size={18} /> : <ScanLine size={18} />}
              Scan
            </button>
          </div>
          <div className="example-row" aria-label="Example Base tokens">
            <span>Examples</span>
            {EXAMPLE_TOKENS.map((token) => (
              <button
                className={sameAddress(normalizedAddress, token.address) ? "example-token active" : "example-token"}
                disabled={isLoading || token.disabled}
                key={token.symbol}
                onClick={() => !token.disabled && void scanToken(token.address)}
                title={token.disabled ? "Low-liquidity placeholder. Add a reviewed contract before sharing." : `${token.name} on Base`}
                type="button"
              >
                {token.symbol}
              </button>
            ))}
          </div>
          <div className="scanner-foot">
            <span className={isValidAddress || !normalizedAddress ? "muted" : "invalid"}>
              0x + 40 hex characters
            </span>
            {status === "error" && <span className="invalid">{error}</span>}
          </div>
        </form>
      </section>

      <section className="dashboard" aria-live="polite">
        <article className={`risk-card ${result ? scoreTone(result.score) : ""} ${isLoading ? "loading" : ""}`}>
          <div className="card-heading">
            <div>
              <p className="section-kicker">Risk score</p>
              <h2>{isLoading ? "Scanning token" : result ? result.verdict : "No scan selected"}</h2>
            </div>
            {isLoading ? (
              <Loader2 className="spin" size={24} />
            ) : result ? (
              result.score >= 75 ? (
                <ShieldCheck size={24} />
              ) : result.score >= 45 ? (
                <ShieldQuestion size={24} />
              ) : (
                <ShieldAlert size={24} />
              )
            ) : (
              <ShieldQuestion size={24} />
            )}
          </div>

          <div className="score-wrap">
            <div className={`score-ring ${isLoading ? "loading-ring" : ""}`} style={scoreStyle}>
              <div>
                {isLoading ? (
                  <>
                    <Loader2 className="spin ring-loader" size={28} />
                    <span>Scanning</span>
                  </>
                ) : (
                  <>
                    <strong>{result?.score ?? "--"}</strong>
                    <span>/96</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="risk-copy">
            {isLoading ? (
              <>
                <strong>Fetching Base liquidity data</strong>
                <span>Selecting the highest-liquidity Base pair and scoring core risk signals.</span>
              </>
            ) : result ? (
              <>
                <strong>
                  {selectedToken?.name ?? "Unknown token"}{" "}
                  {selectedToken?.symbol ? `(${selectedToken.symbol})` : ""}
                </strong>
                <span>Highest-liquidity Base pair selected for analysis.</span>
              </>
            ) : (
              <>
                <strong>Ready for a token</strong>
                <span>Enter a Base token contract or use an example to load the risk profile.</span>
              </>
            )}
          </div>
        </article>

        <section className="metrics-grid">
          <Metric loading={isLoading} title="Price USD" value={selectedPair?.priceUsd ? currency(Number(selectedPair.priceUsd)) : "Unavailable"} icon={<Activity size={18} />} />
          <Metric loading={isLoading} title="Liquidity" value={currency(selectedPair?.liquidity?.usd, true)} icon={<WalletCards size={18} />} />
          <Metric loading={isLoading} title="24h volume" value={currency(selectedPair?.volume?.h24, true)} icon={<ArrowUpRight size={18} />} />
          <Metric loading={isLoading} title="24h change" value={percentText(selectedPair?.priceChange?.h24)} icon={<Activity size={18} />} />
          <Metric loading={isLoading} title={selectedPair?.marketCap ? "Market cap" : "FDV"} value={currency(marketValue, true)} icon={<Info size={18} />} />
          <Metric loading={isLoading} title="24h txns" value={numberText(txns24h)} icon={<CheckCircle2 size={18} />} />
        </section>
      </section>

      <section className="detail-grid">
        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="section-kicker">Findings</p>
              <h2>Human-readable risk signals</h2>
            </div>
            <AlertTriangle size={22} />
          </div>

          <div className="findings-list">
            {isLoading ? (
              <div className="analysis-state">
                <Loader2 className="spin" size={22} />
                <strong>Analyzing pair risk</strong>
                <span>Liquidity depth, pair age, trade count, turnover, valuation, and volatility are being scored.</span>
              </div>
            ) : result ? (
              result.findings.map((finding) => (
                <div className={`finding ${finding.tone}`} key={`${finding.title}-${finding.detail}`}>
                  <div>
                    <strong>{finding.title}</strong>
                    <span>{finding.detail}</span>
                  </div>
                  <b>{finding.delta > 0 ? `+${finding.delta}` : finding.delta}</b>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <Search size={22} />
                <strong>No findings yet</strong>
                <span>Run a token scan to populate threshold-based risk signals.</span>
              </div>
            )}
          </div>
        </article>

        <article className="panel snapshot">
          <div className="panel-head">
            <div>
              <p className="section-kicker">Token snapshot</p>
              <h2>Selected Base pair</h2>
            </div>
            <Clock3 size={22} />
          </div>

          <dl className="snapshot-list">
            <SnapshotRow label="Token" value={isLoading ? "Loading" : selectedToken?.name ?? "Unavailable"} />
            <SnapshotRow label="Symbol" value={isLoading ? "Loading" : selectedToken?.symbol ?? "Unavailable"} />
            <SnapshotRow label="DEX" value={isLoading ? "Loading" : selectedPair?.dexId ?? "Unavailable"} />
            <SnapshotRow label="Pair age" value={isLoading ? "Loading" : pairAgeText(selectedPair?.pairCreatedAt)} />
            <SnapshotRow label="Pair address" value={isLoading ? "Loading" : selectedPair?.pairAddress ?? "Unavailable"} mono />
          </dl>

          <div className="snapshot-actions">
            <button
              className="snapshot-action"
              disabled={!selectedPair?.pairAddress || isLoading}
              onClick={() => void copyPairAddress()}
              type="button"
            >
              {copyState === "copied" ? <Check size={16} /> : <Copy size={16} />}
              {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy pair address"}
            </button>

            {baseScanUrl ? (
              <a className="snapshot-action" href={baseScanUrl} target="_blank" rel="noreferrer">
                Open on BaseScan
                <ExternalLink size={16} />
              </a>
            ) : (
              <span className="snapshot-action disabled">BaseScan unavailable</span>
            )}

            {selectedPair?.url ? (
              <a className="snapshot-action primary-action" href={selectedPair.url} target="_blank" rel="noreferrer">
                Open on DEX Screener
                <ExternalLink size={16} />
              </a>
            ) : (
              <span className="snapshot-action primary-action disabled">DEX Screener unavailable</span>
            )}
          </div>
        </article>

        <article className="panel intelligence">
          <div className="panel-head">
            <div>
              <p className="section-kicker">BaseScan layer</p>
              <h2>Contract Intelligence</h2>
            </div>
            <FileCheck2 size={22} />
          </div>

          {isBaseScanLoading ? (
            <div className="analysis-state intelligence-loading">
              <Loader2 className="spin" size={22} />
              <strong>Checking BaseScan</strong>
              <span>Verification, deployer, creation age, supply, and holder count are being requested.</span>
            </div>
          ) : activeBaseScan.note ? (
            <div className="intel-note">
              <Info size={17} />
              <span>{activeBaseScan.note}</span>
            </div>
          ) : null}

          <dl className="snapshot-list intelligence-list">
            <SnapshotRow label="Verification" value={isBaseScanLoading ? "Checking" : verificationLabel} />
            <SnapshotRow label="Deployer" value={deployerText(activeBaseScan, isBaseScanLoading)} mono />
            <SnapshotRow
              label="Age"
              value={creationAgeText(activeBaseScan, isBaseScanLoading)}
            />
            <SnapshotRow
              label="Holders"
              value={holderCountText(activeBaseScan, isBaseScanLoading)}
            />
            <SnapshotRow label="Supply" value={supplyDisplayText(activeBaseScan, isBaseScanLoading, selectedPair)} mono={Boolean(activeBaseScan.tokenSupply)} />
          </dl>

          <div className="snapshot-actions">
            {baseScanUrl ? (
              <a className="snapshot-action primary-action" href={baseScanUrl} target="_blank" rel="noreferrer">
                Open on BaseScan
                <ExternalLink size={16} />
              </a>
            ) : (
              <span className="snapshot-action primary-action disabled">BaseScan unavailable</span>
            )}
          </div>
        </article>
      </section>

      <footer className="app-footer">
        <span>BaseScout is a first-pass risk scanner. Always DYOR.</span>
        <span>Not financial advice.</span>
      </footer>
    </main>
  );
}

function Metric({ title, value, icon, loading = false }: { title: string; value: string; icon: React.ReactNode; loading?: boolean }) {
  return (
    <article className={`metric ${loading ? "is-loading" : ""}`}>
      <div className="metric-icon">{icon}</div>
      <span>{title}</span>
      <strong>{loading ? <span className="skeleton-line" /> : value}</strong>
    </article>
  );
}

function SnapshotRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  const className = [mono ? "mono" : "", isMutedValue(value) ? "muted-value" : ""].filter(Boolean).join(" ");

  return (
    <div>
      <dt>{label}</dt>
      <dd className={className}>{value}</dd>
    </div>
  );
}

const container = document.getElementById("root") as HTMLElement;
const root = window.__basescoutRoot ?? createRoot(container);
window.__basescoutRoot = root;

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
