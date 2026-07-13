import React, { ChangeEvent, FormEvent, useMemo, useRef, useState } from "react";
import { createRoot, Root } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  FileCheck2,
  Fingerprint,
  History,
  Info,
  Loader2,
  RefreshCw,
  Search,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Trash2,
  WalletCards
} from "lucide-react";
import { initPostHog, shortAddress, tokenAnalyticsProperties, trackEvent } from "./analytics";
import {
  buildScanHistoryItem,
  clearScanHistory,
  readScanHistory,
  upsertScanHistoryItem
} from "./scanHistory";
import "./styles.css";
import type {
  BaseScanIntelligence,
  BaseScanStatus,
  BaseScanUnavailableReason,
  DexPair,
  Finding,
  FindingTone,
  ScanApiResponse,
  ScanErrorCode,
  ScanHistoryItem,
  ScanResult
} from "./types";

declare global {
  interface Window {
    __basescoutRoot?: Root;
  }
}

type ScanStatus = "idle" | "loading" | "success" | "error";
type CopyState = "idle" | "copied" | "failed";
type ScanSource = "manual" | "example" | "history";

type ScanContext = {
  source: ScanSource;
  symbol?: string;
};

type ScanErrorView = {
  code: ScanErrorCode;
  title: string;
  message: string;
};

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const REQUEST_TIMEOUT_MS = 15_000;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function scanErrorCodeValue(value: unknown): ScanErrorCode | undefined {
  if (
    value === "invalid_address" ||
    value === "no_base_pair" ||
    value === "api_timeout" ||
    value === "rate_limit" ||
    value === "partial_contract_intelligence_failure" ||
    value === "unexpected_server_error"
  ) {
    return value;
  }

  return undefined;
}

function emptyBaseScanIntelligence(status: BaseScanStatus = "idle", reason?: BaseScanIntelligence["reason"]): BaseScanIntelligence {
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

function baseScanUrlFor(address?: string) {
  return address ? `https://basescan.org/token/${address}` : undefined;
}

function hasPartialContractIntelligenceFailure(baseScan: BaseScanIntelligence) {
  if (baseScan.status === "unavailable") {
    return Boolean(baseScan.reason && !["missing-key", "no-data"].includes(baseScan.reason));
  }

  return Boolean(
    baseScan.holderCountUnavailableReason ||
      baseScan.tokenSupplyUnavailableReason ||
      baseScan.creationUnavailableReason
  );
}

function contractIntelligenceNotice(baseScan: BaseScanIntelligence) {
  if (baseScan.note) return baseScan.note;
  if (!hasPartialContractIntelligenceFailure(baseScan)) return undefined;

  return "Partial contract intelligence failure. Some BaseScan fields could not be loaded; available fields remain shown.";
}

function parseScanApiResponse(value: unknown): ScanApiResponse | undefined {
  if (!isRecord(value)) return undefined;
  const pair = isRecord(value.pair) ? (value.pair as DexPair) : null;
  const baseScan = isRecord(value.baseScan)
    ? (value.baseScan as BaseScanIntelligence)
    : emptyBaseScanIntelligence("unavailable", "request-failed");

  return {
    address: stringValue(value.address) ?? "",
    pair,
    baseScan,
    error: stringValue(value.error),
    errorCode: scanErrorCodeValue(value.errorCode),
    errors: isRecord(value.errors)
      ? {
          dex: stringValue(value.errors.dex),
          baseScan: stringValue(value.errors.baseScan)
        }
      : undefined
  };
}

async function readScanApiResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return undefined;

  try {
    return parseScanApiResponse(await response.json());
  } catch {
    return undefined;
  }
}

function noBasePairMessage() {
  return "No Base pair found for this token. Confirm the contract is deployed on Base and has an indexed DEX pair.";
}

function scanErrorView(code: ScanErrorCode, message?: string): ScanErrorView {
  if (code === "invalid_address") {
    return {
      code,
      title: "Invalid address",
      message: message ?? "Enter a 0x token contract with 40 hexadecimal characters."
    };
  }

  if (code === "no_base_pair") {
    return {
      code,
      title: "No Base liquidity pair found",
      message: message ?? noBasePairMessage()
    };
  }

  if (code === "api_timeout") {
    return {
      code,
      title: "API timeout",
      message: message ?? "The scan API did not respond before the request limit."
    };
  }

  if (code === "rate_limit") {
    return {
      code,
      title: "Rate limit",
      message: message ?? "The scan API is rate limiting requests. Wait briefly before scanning again."
    };
  }

  if (code === "partial_contract_intelligence_failure") {
    return {
      code,
      title: "Partial contract intelligence failure",
      message:
        message ??
        "Liquidity analysis completed, but BaseScan verification, deployer, supply, or holder data could not be loaded."
    };
  }

  return {
    code,
    title: "Unexpected server error",
    message: message ?? "Scan API could not complete the request."
  };
}

class ScanUiError extends Error {
  view: ScanErrorView;

  constructor(view: ScanErrorView) {
    super(view.message);
    this.view = view;
  }
}

function scanHttpErrorView(status: number, payload?: ScanApiResponse) {
  if (payload?.errorCode) return scanErrorView(payload.errorCode, payload.error);
  if (status === 400) return scanErrorView("invalid_address", payload?.error);
  if (status === 404) return scanErrorView("no_base_pair", payload?.error);
  if (status === 408 || status === 504) return scanErrorView("api_timeout", payload?.error);
  if (status === 429) return scanErrorView("rate_limit", payload?.error);
  return scanErrorView("unexpected_server_error", payload?.error ?? `Scan API returned HTTP ${status}.`);
}

function scanRequestErrorView(error: unknown) {
  if (error instanceof ScanUiError) return error.view;

  if (error instanceof DOMException && error.name === "AbortError") {
    return scanErrorView("api_timeout", "Scan request timed out before the API returned a result.");
  }

  if (error instanceof TypeError) {
    return scanErrorView("unexpected_server_error", "Scan API is unreachable. Check the connection and retry.");
  }

  return scanErrorView(
    "unexpected_server_error",
    error instanceof Error ? error.message : "Scan failed before a usable result was returned."
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
  const [errorState, setErrorState] = useState<ScanErrorView | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [baseScan, setBaseScan] = useState<BaseScanIntelligence>(() => emptyBaseScanIntelligence());
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [scanHistory, setScanHistory] = useState<ScanHistoryItem[]>(() => readScanHistory());
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
  const intelligenceNotice = isBaseScanLoading ? undefined : contractIntelligenceNotice(activeBaseScan);
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
    setErrorState(null);
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

  async function scanToken(rawAddress: string, context: ScanContext = { source: "manual" }) {
    if (activeRequestRef.current) return;

    const tokenAddress = rawAddress.trim();
    const scanId = scanIdRef.current + 1;
    scanIdRef.current = scanId;
    const scanEventProperties = {
      source: context.source,
      ...tokenAnalyticsProperties(tokenAddress, context.symbol)
    };

    setAddress(tokenAddress);
    setErrorState(null);
    setCopyState("idle");
    trackEvent("scan_clicked", scanEventProperties);

    if (!ADDRESS_PATTERN.test(tokenAddress)) {
      const view = scanErrorView("invalid_address");
      setStatus("error");
      setResult(null);
      setBaseScan(emptyBaseScanIntelligence());
      setErrorState(view);
      trackEvent("scan_failed", {
        ...scanEventProperties,
        error_code: view.code,
        error_title: view.title
      });
      return;
    }

    setStatus("loading");
    setResult(null);
    setBaseScan(emptyBaseScanIntelligence("loading"));

    const controller = new AbortController();
    activeRequestRef.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`/api/scan?address=${encodeURIComponent(tokenAddress)}`, {
        signal: controller.signal
      });
      const payload = await readScanApiResponse(response);
      const baseScanIntelligence = payload?.baseScan ?? emptyBaseScanIntelligence("unavailable", "request-failed");

      if (!response.ok) {
        throw new ScanUiError(scanHttpErrorView(response.status, payload));
      }

      if (scanId !== scanIdRef.current) return;
      setBaseScan(baseScanIntelligence);

      if (!payload?.pair) {
        const view = scanErrorView(payload?.errorCode ?? "no_base_pair", payload?.error);
        setStatus("error");
        setErrorState(view);
        trackEvent("scan_failed", {
          ...scanEventProperties,
          error_code: view.code,
          error_title: view.title
        });
        return;
      }

      const scanResult = calculateRisk(payload.pair, tokenAddress, baseScanIntelligence);
      const historyItem = buildScanHistoryItem(scanResult, tokenAddress);

      setResult(scanResult);
      setStatus("success");
      if (historyItem) {
        setScanHistory((currentHistory) => upsertScanHistoryItem(currentHistory, historyItem));
      }
      trackEvent("scan_success", {
        source: context.source,
        ...tokenAnalyticsProperties(historyItem?.address ?? scanResult.targetToken.address ?? tokenAddress, scanResult.targetToken.symbol ?? context.symbol),
        risk_score: scanResult.score,
        verdict: scanResult.verdict,
        base_scan_status: baseScanIntelligence.status,
        partial_contract_intelligence_failure: hasPartialContractIntelligenceFailure(baseScanIntelligence)
      });
    } catch (scanError) {
      if (scanId !== scanIdRef.current) return;
      const view = scanRequestErrorView(scanError);
      setStatus("error");
      setErrorState(view);
      trackEvent("scan_failed", {
        ...scanEventProperties,
        error_code: view.code,
        error_title: view.title
      });
    } finally {
      window.clearTimeout(timeoutId);
      if (activeRequestRef.current === controller) {
        activeRequestRef.current = null;
      }
    }
  }

  function handleScan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading) return;
    void scanToken(address, { source: "manual" });
  }

  function rescanHistoryItem(item: ScanHistoryItem) {
    if (isLoading) return;
    void scanToken(item.address, { source: "history", symbol: item.symbol });
  }

  function clearHistory() {
    clearScanHistory();
    setScanHistory([]);
  }

  async function copyPairAddress() {
    if (!selectedPair?.pairAddress) return;

    try {
      await writeClipboardText(selectedPair.pairAddress);
      trackEvent("copy_pair_address", {
        ...tokenAnalyticsProperties(selectedToken?.address ?? normalizedAddress, selectedToken?.symbol),
        pair_short_address: shortAddress(selectedPair.pairAddress)
      });
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
                aria-invalid={errorState?.code === "invalid_address"}
              />
            </div>
            <button type="submit" disabled={isLoading} aria-busy={isLoading}>
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
                onClick={() => {
                  if (token.disabled) return;
                  trackEvent("example_token_clicked", {
                    ...tokenAnalyticsProperties(token.address, token.symbol),
                    token_name: token.name
                  });
                  void scanToken(token.address, { source: "example", symbol: token.symbol });
                }}
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
            {status === "error" && errorState ? (
              <span className="error-message" role="alert">
                <strong>{errorState.title}</strong>
                <span>{errorState.message}</span>
              </span>
            ) : null}
          </div>
        </form>
      </section>

      <RecentScans
        disabled={isLoading}
        history={scanHistory}
        onClear={clearHistory}
        onRescan={rescanHistoryItem}
      />

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
                <span className="skeleton-line skeleton-long" />
                <span className="skeleton-line skeleton-mid" />
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
              <div className="analysis-state skeleton-state">
                <Loader2 className="spin" size={22} />
                <strong>Analyzing pair risk</strong>
                <span className="skeleton-stack" aria-hidden="true">
                  <span className="skeleton-line skeleton-long" />
                  <span className="skeleton-line skeleton-mid" />
                  <span className="skeleton-line skeleton-short" />
                </span>
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
            <SnapshotRow label="Token" value={selectedToken?.name ?? "Unavailable"} loading={isLoading} />
            <SnapshotRow label="Symbol" value={selectedToken?.symbol ?? "Unavailable"} loading={isLoading} />
            <SnapshotRow label="DEX" value={selectedPair?.dexId ?? "Unavailable"} loading={isLoading} />
            <SnapshotRow label="Pair age" value={pairAgeText(selectedPair?.pairCreatedAt)} loading={isLoading} />
            <SnapshotRow label="Pair address" value={selectedPair?.pairAddress ?? "Unavailable"} loading={isLoading} mono />
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
              <a
                className="snapshot-action"
                href={baseScanUrl}
                onClick={() =>
                  trackEvent("open_basescan", {
                    ...tokenAnalyticsProperties(baseScanTokenAddress, selectedToken?.symbol),
                    location: "snapshot"
                  })
                }
                target="_blank"
                rel="noreferrer"
              >
                Open on BaseScan
                <ExternalLink size={16} />
              </a>
            ) : (
              <span className="snapshot-action disabled">BaseScan unavailable</span>
            )}

            {selectedPair?.url ? (
              <a
                className="snapshot-action primary-action"
                href={selectedPair.url}
                onClick={() =>
                  trackEvent("open_dexscreener", {
                    ...tokenAnalyticsProperties(selectedToken?.address ?? normalizedAddress, selectedToken?.symbol)
                  })
                }
                target="_blank"
                rel="noreferrer"
              >
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
            <div className="analysis-state intelligence-loading skeleton-state">
              <Loader2 className="spin" size={22} />
              <strong>Checking BaseScan</strong>
              <span className="skeleton-stack" aria-hidden="true">
                <span className="skeleton-line skeleton-long" />
                <span className="skeleton-line skeleton-mid" />
                <span className="skeleton-line skeleton-short" />
              </span>
            </div>
          ) : intelligenceNotice ? (
            <div className="intel-note">
              <Info size={17} />
              <span>{intelligenceNotice}</span>
            </div>
          ) : null}

          <dl className="snapshot-list intelligence-list">
            <SnapshotRow label="Verification" value={verificationLabel} loading={isBaseScanLoading} />
            <SnapshotRow label="Deployer" value={deployerText(activeBaseScan, isBaseScanLoading)} loading={isBaseScanLoading} mono />
            <SnapshotRow
              label="Age"
              value={creationAgeText(activeBaseScan, isBaseScanLoading)}
              loading={isBaseScanLoading}
            />
            <SnapshotRow
              label="Holders"
              value={holderCountText(activeBaseScan, isBaseScanLoading)}
              loading={isBaseScanLoading}
            />
            <SnapshotRow
              label="Supply"
              value={supplyDisplayText(activeBaseScan, isBaseScanLoading, selectedPair)}
              loading={isBaseScanLoading}
              mono={Boolean(activeBaseScan.tokenSupply)}
            />
          </dl>

          <div className="snapshot-actions">
            {baseScanUrl ? (
              <a
                className="snapshot-action primary-action"
                href={baseScanUrl}
                onClick={() =>
                  trackEvent("open_basescan", {
                    ...tokenAnalyticsProperties(baseScanTokenAddress, selectedToken?.symbol),
                    location: "intelligence"
                  })
                }
                target="_blank"
                rel="noreferrer"
              >
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

function historyTimestampText(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function RecentScans({
  disabled,
  history,
  onClear,
  onRescan
}: {
  disabled: boolean;
  history: ScanHistoryItem[];
  onClear: () => void;
  onRescan: (item: ScanHistoryItem) => void;
}) {
  return (
    <section className="recent-scans" aria-label="Recent scans">
      <div className="recent-head">
        <div>
          <p className="section-kicker">Recent scans</p>
          <h2>Latest successful tokens</h2>
        </div>
        <button className="recent-clear" type="button" disabled={disabled || !history.length} onClick={onClear}>
          <Trash2 size={16} />
          Clear history
        </button>
      </div>

      {history.length ? (
        <div className="recent-list">
          {history.map((item) => (
            <button
              aria-label={`Rescan ${item.symbol}`}
              className="recent-scan"
              disabled={disabled}
              key={`${item.address}-${item.timestamp}`}
              onClick={() => onRescan(item)}
              type="button"
            >
              <span className="recent-logo" aria-hidden="true">
                {item.tokenLogo ? <img src={item.tokenLogo} alt="" loading="lazy" referrerPolicy="no-referrer" /> : item.symbol.slice(0, 2)}
              </span>
              <span className="recent-main">
                <strong>{item.symbol}</strong>
                <span>{item.shortAddress}</span>
              </span>
              <span className="recent-meta">
                <b>{item.riskScore}/96</b>
                <span>{historyTimestampText(item.timestamp)}</span>
              </span>
              <RefreshCw size={16} />
            </button>
          ))}
        </div>
      ) : (
        <div className="recent-empty">
          <History size={18} />
          <span>Successful scans appear here.</span>
        </div>
      )}
    </section>
  );
}

function SnapshotRow({ label, value, mono = false, loading = false }: { label: string; value: string; mono?: boolean; loading?: boolean }) {
  const className = [mono ? "mono" : "", isMutedValue(value) ? "muted-value" : ""].filter(Boolean).join(" ");

  return (
    <div>
      <dt>{label}</dt>
      <dd className={className}>{loading ? <span className="skeleton-line skeleton-mid" /> : value}</dd>
    </div>
  );
}

const container = document.getElementById("root") as HTMLElement;
const root = window.__basescoutRoot ?? createRoot(container);
window.__basescoutRoot = root;
initPostHog();

root.render(
  <React.StrictMode>
    <App />
    <Analytics />
  </React.StrictMode>
);
