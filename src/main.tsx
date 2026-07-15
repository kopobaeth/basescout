import React, { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
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
  ShieldX,
  Trash2,
  WalletCards,
  X
} from "lucide-react";
import { initPostHog, shortAddress, tokenAnalyticsProperties, trackEvent } from "./analytics";
import {
  buildScanHistoryItem,
  clearScanHistory,
  readScanHistory,
  upsertScanHistoryItem
} from "./scanHistory";
import {
  buildWatchlistItem,
  readWatchlist,
  removeWatchlistItem,
  upsertWatchlistItem
} from "./watchlist";
import { applySecurityContractRisk } from "./riskSecurity";
import { emptySecurityIntelligence } from "./security";
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
  ScanResult,
  ScoreReason,
  SecurityFinding,
  SecurityIntelligence,
  WatchlistItem
} from "./types";

declare global {
  interface Window {
    __basescoutRoot?: Root;
  }
}

type ScanStatus = "idle" | "loading" | "success" | "error";
type CopyState = "idle" | "copied" | "failed";
type ScanSource = "manual" | "example" | "history" | "watchlist";

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
  const pairs = Array.isArray(value.pairs)
    ? value.pairs.filter(isRecord).map((pairValue) => pairValue as DexPair)
    : pair
      ? [pair]
      : [];
  const baseScan = isRecord(value.baseScan)
    ? (value.baseScan as BaseScanIntelligence)
    : emptyBaseScanIntelligence("unavailable", "request-failed");
  const security = isRecord(value.security)
    ? (value.security as SecurityIntelligence)
    : emptySecurityIntelligence("Security data unavailable. Market and contract scanning still completed.");

  return {
    address: stringValue(value.address) ?? "",
    pair,
    pairs,
    baseScan,
    security,
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
    finalScore >= 75 ? "Lower risk" : finalScore >= 45 ? "Moderate risk" : "High risk";

  return {
    pair,
    pairs: [pair],
    targetToken: getTargetToken(pair, tokenAddress),
    baseScan,
    security: emptySecurityIntelligence(),
    score: finalScore,
    verdict,
    breakdown: {
      overall: finalScore,
      market: finalScore,
      contract: finalScore,
      confidence: {
        score: 0,
        label: "Low",
        completedChecks: [],
        unavailableChecks: ["Legacy scorer"],
        reasons: []
      },
      marketReasons: findings,
      contractReasons: []
    },
    findings
  };
}

function addReason(reasons: ScoreReason[], title: string, detail: string, delta: number, tone: FindingTone) {
  reasons.push({ title, detail, delta, tone });
  return delta;
}

function confidenceLabel(score: number) {
  if (score >= 75) return "High";
  if (score >= 45) return "Medium";
  return "Low";
}

function calculateRiskBreakdown(pair: DexPair, pairs: DexPair[], tokenAddress: string, baseScan: BaseScanIntelligence, security: SecurityIntelligence): ScanResult {
  let marketScore = 72;
  let contractScore = 72;
  const marketReasons: ScoreReason[] = [];
  const contractReasons: ScoreReason[] = [];
  const confidenceReasons: ScoreReason[] = [];
  const completedChecks: string[] = [];
  const unavailableChecks: string[] = [];
  const liquidity = pair.liquidity?.usd;
  const days = ageInDays(pair.pairCreatedAt);
  const buys = pair.txns?.h24?.buys;
  const sells = pair.txns?.h24?.sells;
  const hasTxnData = Number.isFinite(buys) || Number.isFinite(sells);
  const txns = (buys ?? 0) + (sells ?? 0);
  const volume = pair.volume?.h24;
  const marketValue = pair.marketCap ?? pair.fdv;
  const priceChange = pair.priceChange?.h24;
  const complete = (check: string) => completedChecks.push(check);
  const unavailable = (check: string) => unavailableChecks.push(check);

  if (pairs.length) complete("Base market discovery");
  else unavailable("Base market discovery");

  if (Number.isFinite(liquidity)) {
    complete("Liquidity");
    if ((liquidity as number) >= 500_000) {
      marketScore += addReason(marketReasons, "Strong liquidity", `${currency(liquidity)} is above the $500k strong-liquidity threshold.`, 8, "positive");
    } else if ((liquidity as number) >= 50_000) {
      marketScore += addReason(marketReasons, "Moderate liquidity", `${currency(liquidity)} sits inside the $50k-$500k watch zone where position size matters.`, -6, "warning");
    } else {
      marketScore += addReason(marketReasons, "Low liquidity", `${currency(liquidity)} is below the $50k low-liquidity threshold and can move sharply on small orders.`, -18, "danger");
    }
  } else {
    unavailable("Liquidity");
    marketScore += addReason(marketReasons, "Liquidity unavailable", "DEX Screener did not return USD liquidity. Missing liquidity is treated as lower confidence, not safety.", -8, "warning");
  }

  if (Number.isFinite(days)) {
    complete("Pair age");
    if ((days as number) >= 30) {
      marketScore += addReason(marketReasons, "Established pair", `Pair age is ${thresholdAgeText(days as number)}, above the 30-day maturity threshold.`, 6, "positive");
    } else if ((days as number) >= 3) {
      marketScore += addReason(marketReasons, "Young pair", `Pair age is ${thresholdAgeText(days as number)}, inside the 3-30 day watch zone.`, -8, "warning");
    } else {
      marketScore += addReason(marketReasons, "New pair", `Pair age is ${thresholdAgeText(days as number)}, below the 3-day new-pair threshold.`, -18, "danger");
    }
  } else {
    unavailable("Pair age");
    marketScore += addReason(marketReasons, "Pair age unavailable", "DEX Screener did not return a pair creation timestamp.", -6, "warning");
  }

  if (hasTxnData) {
    complete("24h transactions");
    if (txns >= 1_000) {
      marketScore += addReason(marketReasons, "Active trading", `${numberText(txns)} transactions in 24h (${numberText(buys ?? 0)} buys, ${numberText(sells ?? 0)} sells), above the 1,000 activity threshold.`, 6, "positive");
    } else if (txns >= 100) {
      marketScore += addReason(marketReasons, "Limited trading", `${numberText(txns)} transactions in 24h (${numberText(buys ?? 0)} buys, ${numberText(sells ?? 0)} sells), inside the 100-999 activity watch zone.`, -8, "warning");
    } else {
      marketScore += addReason(marketReasons, "Low transaction count", `${numberText(txns)} transactions in 24h (${numberText(buys ?? 0)} buys, ${numberText(sells ?? 0)} sells), below the 100 transaction threshold.`, -16, "danger");
    }
  } else {
    unavailable("24h transactions");
    marketScore += addReason(marketReasons, "Transaction data unavailable", "DEX Screener did not return 24h transaction counts.", -6, "warning");
  }

  if (Number.isFinite(volume)) {
    complete("24h volume");
  } else {
    unavailable("24h volume");
    marketScore += addReason(marketReasons, "Volume unavailable", "DEX Screener did not return 24h volume, so turnover quality cannot be confirmed.", -4, "warning");
  }

  if (Number.isFinite(liquidity) && Number.isFinite(volume) && (liquidity as number) > 0) {
    const turnoverRatio = (volume as number) / (liquidity as number);
    if (turnoverRatio > 10) {
      marketScore += addReason(marketReasons, "Turnover spike", `24h volume/liquidity is ${turnoverRatio.toFixed(1)}x, above the 10x churn threshold.`, -9, "warning");
    } else {
      addReason(marketReasons, "Turnover contained", `24h volume/liquidity is ${turnoverRatio.toFixed(1)}x, below the 10x churn threshold.`, 0, "neutral");
    }
  }

  if (Number.isFinite(marketValue)) {
    complete(pair.marketCap ? "Market cap" : "FDV");
    if (Number.isFinite(liquidity) && (liquidity as number) > 0) {
      const capRatio = (marketValue as number) / (liquidity as number);
      if (capRatio > 80) {
        marketScore += addReason(marketReasons, "Extreme valuation gap", `Market value/liquidity is ${capRatio.toFixed(1)}x, above the 80x extreme threshold.`, -16, "danger");
      } else if (capRatio > 25) {
        marketScore += addReason(marketReasons, "Elevated valuation gap", `Market value/liquidity is ${capRatio.toFixed(1)}x, above the 25x watch threshold.`, -8, "warning");
      } else {
        addReason(marketReasons, "Valuation supported", `Market value/liquidity is ${capRatio.toFixed(1)}x, below the 25x watch threshold.`, 0, "neutral");
      }
    }
  } else {
    unavailable("Market cap or FDV");
    marketScore += addReason(marketReasons, "Valuation data unavailable", "Market cap and FDV were missing, so valuation/liquidity could not be scored.", -4, "warning");
  }

  if (Number.isFinite(priceChange)) {
    complete("24h price change");
    const absoluteMove = Math.abs(priceChange as number);
    if (absoluteMove > 80) {
      marketScore += addReason(marketReasons, "Extreme volatility", `Absolute 24h price move is ${absoluteMove.toFixed(2)}%, above the 80% extreme-volatility threshold.`, -16, "danger");
    } else if (absoluteMove > 30) {
      marketScore += addReason(marketReasons, "High volatility", `Absolute 24h price move is ${absoluteMove.toFixed(2)}%, above the 30% volatility watch threshold.`, -8, "warning");
    } else {
      addReason(marketReasons, "Price move contained", `Absolute 24h price move is ${absoluteMove.toFixed(2)}%, below the 30% volatility watch threshold.`, 0, "neutral");
    }
  } else {
    unavailable("24h price change");
    marketScore += addReason(marketReasons, "Volatility unavailable", "DEX Screener did not return 24h price change.", -4, "warning");
  }

  if (baseScan.status === "unavailable") {
    ["Contract verification", "Contract age", "Deployer", "Token supply", "Holder count"].forEach(unavailable);
    contractScore += addReason(contractReasons, "Incomplete contract data", baseScan.note ?? "BaseScan contract intelligence is unavailable. Missing contract data is not treated as safe.", -10, "warning");
  } else if (baseScan.status === "available") {
    if (baseScan.verificationStatus === "verified") {
      complete("Contract verification");
      contractScore += addReason(contractReasons, "Verified contract", `${baseScan.contractName ? `${baseScan.contractName} ` : "Contract "}source is verified on BaseScan.`, 8, "positive");
    } else if (baseScan.verificationStatus === "unverified") {
      complete("Contract verification");
      contractScore += addReason(contractReasons, "Unverified contract", "BaseScan does not show verified source code for this contract.", -18, "danger");
    } else {
      unavailable("Contract verification");
      contractScore += addReason(contractReasons, "Verification unknown", "BaseScan did not return a conclusive source verification result.", -8, "warning");
    }

    const contractAgeDays = ageInDays(baseScan.createdAt);
    if (Number.isFinite(contractAgeDays)) {
      complete("Contract age");
      if ((contractAgeDays as number) < 3) {
        contractScore += addReason(contractReasons, "Fresh deployment", `Contract age is ${thresholdAgeText(contractAgeDays as number)}, below the 3-day deployment threshold.`, -18, "danger");
      } else if ((contractAgeDays as number) < 30) {
        contractScore += addReason(contractReasons, "Recent deployment", `Contract age is ${thresholdAgeText(contractAgeDays as number)}, inside the 3-30 day watch zone.`, -8, "warning");
      } else {
        contractScore += addReason(contractReasons, "Established deployment", `Contract age is ${thresholdAgeText(contractAgeDays as number)}, above the 30-day watch zone.`, 4, "positive");
      }
    } else {
      unavailable("Contract age");
      contractScore += addReason(contractReasons, "Contract age unavailable", "BaseScan did not return deployment age.", -6, "warning");
    }

    if (baseScan.deployer) {
      complete("Deployer");
      addReason(contractReasons, "Deployer found", `BaseScan reports deployer ${baseScan.deployer}.`, 0, "neutral");
    } else {
      unavailable("Deployer");
      contractScore += addReason(contractReasons, "Deployer unavailable", "BaseScan did not return a deployer address.", -3, "warning");
    }

    if (Number.isFinite(baseScan.holderCount)) {
      complete("Holder count");
      if ((baseScan.holderCount as number) < 100) {
        contractScore += addReason(contractReasons, "Holder count very low", `${numberText(baseScan.holderCount)} holders is below the 100-holder danger threshold.`, -12, "danger");
      } else if ((baseScan.holderCount as number) < 1_000) {
        contractScore += addReason(contractReasons, "Holder count low", `${numberText(baseScan.holderCount)} holders is inside the 100-1,000 holder watch zone.`, -6, "warning");
      } else {
        addReason(contractReasons, "Holder count established", `${numberText(baseScan.holderCount)} holders is above the 1,000-holder watch zone.`, 0, "neutral");
      }
    } else {
      unavailable("Holder count");
      contractScore += addReason(contractReasons, "Holder count unavailable", "BaseScan did not return holder count. Missing holder distribution is not treated as safe.", -5, "warning");
    }

    if (baseScan.tokenSupply) {
      complete("Token supply");
      addReason(contractReasons, "Supply returned", "BaseScan returned token supply.", 0, "neutral");
    } else {
      unavailable("Token supply");
      contractScore += addReason(contractReasons, "Supply unavailable", "BaseScan did not return token supply.", -3, "warning");
    }
  }

  if (security.status === "available" || security.status === "partial") {
    complete("Security intelligence");
  } else {
    unavailable("Security intelligence");
  }

  security.unavailableChecks.forEach((key) => unavailable(`Security: ${key}`));
  const securityRisk = applySecurityContractRisk(contractScore, security);
  contractScore = securityRisk.score;
  contractReasons.push(...securityRisk.reasons);

  const clampedMarketScore = clampScore(marketScore);
  const clampedContractScore = clampScore(contractScore);
  const totalChecks = completedChecks.length + unavailableChecks.length;
  const confidenceScore = Math.round(totalChecks ? (completedChecks.length / totalChecks) * 96 : 0);

  addReason(confidenceReasons, "Completed checks", `${completedChecks.length} of ${totalChecks} checks completed.`, completedChecks.length, "positive");
  if (unavailableChecks.length) {
    addReason(confidenceReasons, "Unavailable checks", unavailableChecks.join(", "), -unavailableChecks.length, unavailableChecks.length >= 4 ? "danger" : "warning");
  } else {
    addReason(confidenceReasons, "No unavailable checks", "All configured checks returned usable data.", 0, "neutral");
  }

  const overallScore = clampScore(Math.round(clampedMarketScore * 0.55 + clampedContractScore * 0.35 + confidenceScore * 0.1));
  const verdict =
    confidenceScore < 35
      ? "Insufficient data"
      : security.criticalCount > 0 || overallScore < 25
        ? "Critical risk"
        : overallScore >= 75
          ? "Lower risk"
          : overallScore >= 45
            ? "Moderate risk"
            : "High risk";
  const findings: Finding[] = [...marketReasons, ...contractReasons, ...confidenceReasons];

  return {
    pair,
    pairs,
    targetToken: getTargetToken(pair, tokenAddress),
    baseScan,
    security,
    score: overallScore,
    verdict,
    breakdown: {
      overall: overallScore,
      market: clampedMarketScore,
      contract: clampedContractScore,
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
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(() => readWatchlist());
  const activeRequestRef = useRef<AbortController | null>(null);
  const scanIdRef = useRef(0);
  const securityAnalyticsRef = useRef("");

  const normalizedAddress = address.trim();
  const isValidAddress = ADDRESS_PATTERN.test(normalizedAddress);
  const isLoading = status === "loading";
  const selectedPair = result?.pair;
  const selectedPairs = result?.pairs ?? [];
  const selectedToken = result?.targetToken;
  const selectedTokenAddress = selectedToken?.address ?? (isValidAddress ? normalizedAddress : undefined);
  const selectedWatchlistItem = watchlist.find((item) => sameAddress(item.address, selectedTokenAddress));
  const activeBaseScan = result?.baseScan ?? baseScan;
  const baseScanTokenAddress = selectedTokenAddress;
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

  useEffect(() => {
    if (!result) return;

    const key = `${result.targetToken.address ?? normalizedAddress}:${result.security.checkedAt}`;
    if (securityAnalyticsRef.current === key) return;
    securityAnalyticsRef.current = key;

    const properties = {
      ...tokenAnalyticsProperties(result.targetToken.address ?? normalizedAddress, result.targetToken.symbol),
      security_status: result.security.status,
      critical_count: result.security.criticalCount,
      warning_count: result.security.warningCount,
      unavailable_count: result.security.unavailableChecks.length
    };

    trackEvent("security_section_viewed", properties);
    if (result.security.criticalCount > 0) trackEvent("critical_warning_displayed", properties);
    if (result.security.status === "unavailable" || result.security.unavailableChecks.length) {
      trackEvent("security_check_unavailable", properties);
    }
  }, [normalizedAddress, result]);

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
      const securityIntelligence =
        payload?.security ?? emptySecurityIntelligence("Security data unavailable. Market and contract scanning still completed.");

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

      const scanResult = calculateRiskBreakdown(payload.pair, payload.pairs, tokenAddress, baseScanIntelligence, securityIntelligence);
      const historyItem = buildScanHistoryItem(scanResult, tokenAddress);
      const watchlistItem = buildWatchlistItem(scanResult, tokenAddress);

      setResult(scanResult);
      setStatus("success");
      if (historyItem) {
        setScanHistory((currentHistory) => upsertScanHistoryItem(currentHistory, historyItem));
      }
      if (watchlistItem) {
        setWatchlist((currentWatchlist) =>
          currentWatchlist.some((item) => sameAddress(item.address, watchlistItem.address))
            ? upsertWatchlistItem(currentWatchlist, watchlistItem)
            : currentWatchlist
        );
      }
      trackEvent("scan_success", {
        source: context.source,
        ...tokenAnalyticsProperties(historyItem?.address ?? scanResult.targetToken.address ?? tokenAddress, scanResult.targetToken.symbol ?? context.symbol),
        risk_score: scanResult.score,
        market_risk: scanResult.breakdown.market,
        contract_risk: scanResult.breakdown.contract,
        data_confidence: scanResult.breakdown.confidence.score,
        confidence_label: scanResult.breakdown.confidence.label,
        verdict: scanResult.verdict,
        base_scan_status: baseScanIntelligence.status,
        base_markets: scanResult.pairs.length,
        security_status: securityIntelligence.status,
        security_critical_count: securityIntelligence.criticalCount,
        security_warning_count: securityIntelligence.warningCount,
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

  function rescanWatchlistItem(item: WatchlistItem) {
    if (isLoading) return;
    trackEvent("watchlist_rescan", {
      ...tokenAnalyticsProperties(item.address, item.symbol),
      last_risk_score: item.lastRiskScore
    });
    void scanToken(item.address, { source: "watchlist", symbol: item.symbol });
  }

  function clearHistory() {
    clearScanHistory();
    setScanHistory([]);
  }

  function addCurrentToWatchlist() {
    if (!result) return;
    const item = buildWatchlistItem(result, selectedTokenAddress ?? normalizedAddress);
    if (!item) return;

    setWatchlist((currentWatchlist) => upsertWatchlistItem(currentWatchlist, item));
    trackEvent("watchlist_added", {
      ...tokenAnalyticsProperties(item.address, item.symbol),
      risk_score: item.lastRiskScore
    });
  }

  function removeCurrentFromWatchlist() {
    const addressToRemove = selectedWatchlistItem?.address ?? selectedTokenAddress;
    if (!addressToRemove) return;

    setWatchlist((currentWatchlist) => removeWatchlistItem(currentWatchlist, addressToRemove));
    trackEvent("watchlist_removed", {
      ...tokenAnalyticsProperties(addressToRemove, selectedToken?.symbol ?? selectedWatchlistItem?.symbol),
      risk_score: selectedWatchlistItem?.lastRiskScore ?? result?.score
    });
  }

  function removeWatchlistListItem(item: WatchlistItem) {
    setWatchlist((currentWatchlist) => removeWatchlistItem(currentWatchlist, item.address));
    trackEvent("watchlist_removed", {
      ...tokenAnalyticsProperties(item.address, item.symbol),
      risk_score: item.lastRiskScore,
      location: "watchlist"
    });
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
    <>
      <a
        className="promo-bar"
        href="https://launch.o1.exchange/token/0xb2000000000000000000000ee9988edd75453501"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className="promo-content">
          <span className="promo-badge">LIVE</span>
          <span>The Base Cat $PAMPU is live</span>
          <ExternalLink size={15} />
        </span>
      </a>
      <main className="shell">
        <nav className="topbar" aria-label="Primary navigation">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              <img src="/basescout-logo.png?v=2" alt="" width="32" height="32" />
            </span>
            <span>BaseScout</span>
          </div>
          <div className="topbar-actions">
            <div className="network-pill">
              <span className="status-dot" />
              Base mainnet
            </div>
            <a className="header-x-link" href="https://x.com/kopobaeth" target="_blank" rel="noopener noreferrer" aria-label="Follow on X">
              <X size={16} />
              <span>X</span>
            </a>
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

      <WatchlistSection
        disabled={isLoading}
        onRemove={removeWatchlistListItem}
        onRescan={rescanWatchlistItem}
        watchlist={watchlist}
      />

      <section className="dashboard" aria-live="polite">
        <article className={`risk-card ${result ? scoreTone(result.score) : ""} ${isLoading ? "loading" : ""}`}>
          <div className="card-heading">
            <div>
              <p className="section-kicker">Overall Risk Score</p>
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
                <span>
                  {selectedPairs.length} Base {selectedPairs.length === 1 ? "market" : "markets"} found. Confidence:{" "}
                  {result.breakdown.confidence.label}.
                </span>
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

      <MarketsSection
        loading={isLoading}
        pairs={selectedPairs}
        primaryPair={selectedPair}
        tokenAddress={selectedToken?.address ?? normalizedAddress}
        tokenSymbol={selectedToken?.symbol}
      />

      <section className="detail-grid">
        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="section-kicker">Risk breakdown</p>
              <h2>Transparent scoring</h2>
            </div>
            <AlertTriangle size={22} />
          </div>

          <RiskBreakdown result={result} loading={isLoading} />
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
            {selectedWatchlistItem ? (
              <button
                className="snapshot-action"
                disabled={!result || isLoading}
                onClick={removeCurrentFromWatchlist}
                type="button"
              >
                <Trash2 size={16} />
                Remove from watchlist
              </button>
            ) : (
              <button
                className="snapshot-action"
                disabled={!result || isLoading}
                onClick={addCurrentToWatchlist}
                type="button"
              >
                <CheckCircle2 size={16} />
                Add to watchlist
              </button>
            )}

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

        <article className="panel security-panel">
          <div className="panel-head">
            <div>
              <p className="section-kicker">Security Intelligence</p>
              <h2>Automated contract signals</h2>
            </div>
            <ShieldX size={22} />
          </div>

          <SecurityIntelligencePanel security={result?.security} loading={isLoading} />
        </article>
      </section>

      <footer className="app-footer">
        <span>BaseScout is a first-pass risk scanner. Always DYOR.</span>
        <span>Not financial advice.</span>
      </footer>
      </main>
    </>
  );
}

function pairName(pair: DexPair) {
  const base = pair.baseToken?.symbol ?? "Base";
  const quote = pair.quoteToken?.symbol ?? "Quote";
  return `${base}/${quote}`;
}

function dexName(pair: DexPair) {
  return pair.dexId ? pair.dexId.toUpperCase() : "Unknown DEX";
}

function marketTxnCount(pair: DexPair) {
  return (pair.txns?.h24?.buys ?? 0) + (pair.txns?.h24?.sells ?? 0);
}

function marketTxnText(pair: DexPair) {
  if (!Number.isFinite(pair.txns?.h24?.buys) && !Number.isFinite(pair.txns?.h24?.sells)) {
    return "Unavailable";
  }

  return numberText(marketTxnCount(pair));
}

function isLowLiquidityPair(pair: DexPair) {
  const liquidity = pair.liquidity?.usd;
  return Number.isFinite(liquidity) && (liquidity as number) < 50_000;
}

function isNewPair(pair: DexPair) {
  const days = ageInDays(pair.pairCreatedAt);
  return Number.isFinite(days) && (days as number) < 3;
}

function marketRowKey(pair: DexPair, index: number) {
  return pair.pairAddress ?? pair.url ?? `${pair.dexId ?? "dex"}-${pairName(pair)}-${index}`;
}

function MarketsSection({
  loading,
  pairs,
  primaryPair,
  tokenAddress,
  tokenSymbol
}: {
  loading: boolean;
  pairs: DexPair[];
  primaryPair?: DexPair;
  tokenAddress?: string;
  tokenSymbol?: string;
}) {
  const visiblePairs = pairs.slice(0, 5);

  return (
    <section className="panel markets-panel" aria-label="Markets">
      <div className="panel-head">
        <div>
          <p className="section-kicker">Markets</p>
          <h2>Base trading venues</h2>
        </div>
        <WalletCards size={22} />
      </div>

      {loading ? (
        <div className="analysis-state skeleton-state">
          <Loader2 className="spin" size={22} />
          <strong>Loading markets</strong>
          <span className="skeleton-stack" aria-hidden="true">
            <span className="skeleton-line skeleton-long" />
            <span className="skeleton-line skeleton-mid" />
            <span className="skeleton-line skeleton-short" />
          </span>
        </div>
      ) : visiblePairs.length ? (
        <div className="markets-list">
          {visiblePairs.map((pair, index) => {
            const isPrimary = sameAddress(pair.pairAddress, primaryPair?.pairAddress) || (!primaryPair?.pairAddress && index === 0);
            return (
              <article className="market-row" key={marketRowKey(pair, index)}>
                <div className="market-title">
                  <strong>{pairName(pair)}</strong>
                  <span>{dexName(pair)}</span>
                </div>
                <div className="market-badges">
                  {isPrimary ? <span className="market-badge primary">Primary market</span> : null}
                  {isLowLiquidityPair(pair) ? <span className="market-badge warning">Low liquidity</span> : null}
                  {isNewPair(pair) ? <span className="market-badge danger">Newly created pair</span> : null}
                </div>
                <dl className="market-metrics">
                  <div>
                    <dt>Liquidity</dt>
                    <dd>{currency(pair.liquidity?.usd, true)}</dd>
                  </div>
                  <div>
                    <dt>24h volume</dt>
                    <dd>{currency(pair.volume?.h24, true)}</dd>
                  </div>
                  <div>
                    <dt>24h txns</dt>
                    <dd>{marketTxnText(pair)}</dd>
                  </div>
                  <div>
                    <dt>Pair age</dt>
                    <dd>{pairAgeText(pair.pairCreatedAt)}</dd>
                  </div>
                  <div>
                    <dt>Price</dt>
                    <dd>{pair.priceUsd ? currency(Number(pair.priceUsd)) : "Unavailable"}</dd>
                  </div>
                </dl>
                {pair.url ? (
                  <a
                    className="market-link"
                    href={pair.url}
                    onClick={() =>
                      trackEvent("market_opened", {
                        ...tokenAnalyticsProperties(tokenAddress, tokenSymbol),
                        dex_name: pair.dexId,
                        pair_short_address: shortAddress(pair.pairAddress),
                        primary_market: isPrimary,
                        position: index + 1
                      })
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    DEX Screener
                    <ExternalLink size={15} />
                  </a>
                ) : (
                  <span className="market-link disabled">DEX Screener unavailable</span>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-state compact-empty">
          <Search size={22} />
          <strong>No markets loaded</strong>
          <span>Run a token scan to show Base pairs.</span>
        </div>
      )}
    </section>
  );
}

function reasonDeltaText(delta: number) {
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

function ScoreBucket({
  score,
  title,
  subtitle,
  reasons
}: {
  score: number;
  title: string;
  subtitle?: string;
  reasons: ScoreReason[];
}) {
  return (
    <article className="score-bucket">
      <div className="score-bucket-head">
        <div>
          <strong>{title}</strong>
          {subtitle ? <span>{subtitle}</span> : null}
        </div>
        <b>{score}/96</b>
      </div>
      <div className="score-reasons">
        {reasons.map((reason) => (
          <div className={`score-reason ${reason.tone}`} key={`${title}-${reason.title}-${reason.detail}`}>
            <div>
              <strong>{reason.title}</strong>
              <span>{reason.detail}</span>
            </div>
            <b>{reasonDeltaText(reason.delta)}</b>
          </div>
        ))}
      </div>
    </article>
  );
}

function RiskBreakdown({ result, loading }: { result: ScanResult | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="findings-list">
        <div className="analysis-state skeleton-state">
          <Loader2 className="spin" size={22} />
          <strong>Scoring risk</strong>
          <span className="skeleton-stack" aria-hidden="true">
            <span className="skeleton-line skeleton-long" />
            <span className="skeleton-line skeleton-mid" />
            <span className="skeleton-line skeleton-short" />
          </span>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="findings-list">
        <div className="empty-state">
          <Search size={22} />
          <strong>No score yet</strong>
          <span>Run a token scan to populate market, contract, and confidence scoring.</span>
        </div>
      </div>
    );
  }

  const confidence = result.breakdown.confidence;

  return (
    <div className="score-breakdown">
      <ScoreBucket
        score={result.breakdown.overall}
        title="Overall Risk Score"
        subtitle="Weighted from market risk, contract risk, and confidence."
        reasons={[
          {
            title: "Weighted score",
            detail: `Market ${result.breakdown.market}/96, contract ${result.breakdown.contract}/96, data confidence ${confidence.score}/96.`,
            delta: 0,
            tone: "neutral"
          }
        ]}
      />
      <ScoreBucket score={result.breakdown.market} title="Market Risk" reasons={result.breakdown.marketReasons} />
      <ScoreBucket score={result.breakdown.contract} title="Contract Risk" reasons={result.breakdown.contractReasons} />
      <ScoreBucket
        score={confidence.score}
        title="Data Confidence"
        subtitle={`${confidence.label} confidence. ${confidence.completedChecks.length} completed checks, ${confidence.unavailableChecks.length} unavailable.`}
        reasons={confidence.reasons}
      />
    </div>
  );
}

function WatchlistSection({
  disabled,
  onRemove,
  onRescan,
  watchlist
}: {
  disabled: boolean;
  onRemove: (item: WatchlistItem) => void;
  onRescan: (item: WatchlistItem) => void;
  watchlist: WatchlistItem[];
}) {
  return (
    <section className="watchlist-section" aria-label="Watchlist">
      <div className="recent-head">
        <div>
          <p className="section-kicker">Watchlist</p>
          <h2>Saved Base tokens</h2>
        </div>
      </div>

      {watchlist.length ? (
        <div className="watchlist-list">
          {watchlist.map((item) => (
            <article className="watchlist-item" key={item.address}>
              <span className="recent-logo" aria-hidden="true">
                {item.tokenLogo ? <img src={item.tokenLogo} alt="" loading="lazy" referrerPolicy="no-referrer" /> : item.symbol.slice(0, 2)}
              </span>
              <span className="recent-main">
                <strong>{item.symbol}</strong>
                <span>{item.shortAddress}</span>
              </span>
              <span className="recent-meta">
                <b>{item.lastRiskScore}/96</b>
                <span>{historyTimestampText(item.lastScannedAt)}</span>
              </span>
              <span className="watchlist-actions">
                <button disabled={disabled} onClick={() => onRescan(item)} type="button">
                  <RefreshCw size={15} />
                  Rescan
                </button>
                <button disabled={disabled} onClick={() => onRemove(item)} type="button">
                  <Trash2 size={15} />
                  Remove
                </button>
              </span>
            </article>
          ))}
        </div>
      ) : (
        <div className="recent-empty">
          <History size={18} />
          <span>Saved tokens appear here.</span>
        </div>
      )}
    </section>
  );
}

function securityStatusLabel(status: SecurityFinding["status"]) {
  if (status === "pass") return "Pass";
  if (status === "warning") return "Warning";
  if (status === "critical") return "Critical";
  return "Unknown";
}

function SecurityIntelligencePanel({ security, loading }: { security?: SecurityIntelligence; loading: boolean }) {
  if (loading) {
    return (
      <div className="analysis-state intelligence-loading skeleton-state">
        <Loader2 className="spin" size={22} />
        <strong>Checking security provider</strong>
        <span className="skeleton-stack" aria-hidden="true">
          <span className="skeleton-line skeleton-long" />
          <span className="skeleton-line skeleton-mid" />
          <span className="skeleton-line skeleton-short" />
        </span>
      </div>
    );
  }

  if (!security) {
    return (
      <div className="empty-state security-empty">
        <Search size={22} />
        <strong>No security data yet</strong>
        <span>Run a token scan to request server-side security intelligence.</span>
      </div>
    );
  }

  return (
    <div className="security-content">
      <div className="security-summary">
        <span className={`security-provider ${security.status}`}>
          {security.status === "available" ? "Provider available" : security.status === "partial" ? "Partial data" : "Security data unavailable"}
        </span>
        <span>
          {security.criticalCount} critical, {security.warningCount} warning, {security.unavailableChecks.length} unknown
        </span>
      </div>

      {security.note ? (
        <div className="intel-note">
          <Info size={17} />
          <span>{security.note}</span>
        </div>
      ) : null}

      <div className="security-list">
        {security.checks.map((check) => (
          <article className={`security-check ${check.status}`} key={check.key}>
            <div className="security-check-head">
              <strong>{check.label}</strong>
              <span>{securityStatusLabel(check.status)}</span>
            </div>
            <p>{check.summary}</p>
            <small>{check.explanation}</small>
          </article>
        ))}
      </div>

      <p className="security-disclaimer">BaseScout provides automated signals, not financial or security guarantees.</p>
    </div>
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
