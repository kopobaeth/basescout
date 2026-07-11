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
import type {
  BaseScanIntelligence,
  BaseScanStatus,
  BaseScanUnavailableReason,
  DexPair,
  DexToken,
  Finding,
  FindingTone,
  ScanApiResponse,
  ScanResult
} from "./types";

declare global {
  interface Window {
    __basescoutRoot?: Root;
  }
}

type ScanStatus = "idle" | "loading" | "success" | "error";
type CopyState = "idle" | "copied" | "failed";

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

function emptyBaseScanIntelligence(status: BaseScanStatus = "idle", reason?: BaseScanIntelligence["reason"]): BaseScanIntelligence {
  const unavailableNote =
    reason === "missing-key"
      ? "BaseScan checks unavailable. Server API key is not configured."
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
    errors: isRecord(value.errors)
      ? {
          dex: stringValue(value.errors.dex),
          baseScan: stringValue(value.errors.baseScan)
        }
      : undefined
  };
}

function scanHttpErrorMessage(status: number, payload?: ScanApiResponse) {
  if (payload?.error) return payload.error;
  if (status === 400) return "Enter a valid EVM contract address.";
  if (status === 404) return noBasePairMessage();
  if (status === 429) return "Scan API is rate limiting requests. Try again shortly.";
  if (status >= 500) return "Scan API is unavailable. Try again shortly.";
  return `Scan API returned HTTP ${status}. Try again shortly.`;
}

function scanRequestErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Scan request timed out. Try again shortly.";
  }

  if (error instanceof TypeError) {
    return "Scan API is unreachable. Check your connection or try again shortly.";
  }

  if (error instanceof Error) return error.message;

  return "Scan failed. Try again shortly.";
}

function noBasePairMessage() {
  return "No Base pair found for this token. Confirm the contract is deployed on Base and has an indexed DEX pair.";
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
    setBaseScan(emptyBaseScanIntelligence("loading"));

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
      const response = await fetch(`/api/scan?address=${encodeURIComponent(tokenAddress)}`, {
        signal: controller.signal
      });
      const payload = parseScanApiResponse(await response.json());
      const baseScanIntelligence = payload?.baseScan ?? emptyBaseScanIntelligence("unavailable", "request-failed");

      if (!response.ok) {
        throw new Error(scanHttpErrorMessage(response.status, payload));
      }

      if (scanId !== scanIdRef.current) return;
      setBaseScan(baseScanIntelligence);

      if (!payload?.pair) {
        setStatus("error");
        setError(payload?.error ?? noBasePairMessage());
        return;
      }

      setResult(calculateRisk(payload.pair, tokenAddress, baseScanIntelligence));
      setStatus("success");
    } catch (scanError) {
      if (scanId !== scanIdRef.current) return;
      setStatus("error");
      setError(scanRequestErrorMessage(scanError));
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
    <Analytics />
  </React.StrictMode>
);
