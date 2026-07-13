import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  BaseScanIntelligence,
  BaseScanStatus,
  BaseScanUnavailableReason,
  DexPair,
  DexToken,
  ScanErrorCode,
  ScanApiResponse
} from "../src/types";

type DexResponse = {
  pairs?: DexPair[] | null;
};

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const BASE_CHAIN_ID = "8453";
const ETHERSCAN_API_URL = "https://api.etherscan.io/v2/api";
const DEX_TIMEOUT_MS = 10_000;
const ETHERSCAN_TIMEOUT_MS = 8_000;

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

function pickBestBasePair(pairs: DexPair[], tokenAddress: string) {
  const basePairs = pairs.filter(
    (pair) =>
      pair.chainId === "base" &&
      (sameAddress(pair.baseToken?.address, tokenAddress) || sameAddress(pair.quoteToken?.address, tokenAddress))
  );

  return [...basePairs].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0] ?? null;
}

async function fetchJson(url: URL | string, timeoutMs: number, label: string) {
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
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ScanApiError(`${label} request timed out`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchDexPair(tokenAddress: string) {
  const url = `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(tokenAddress)}`;
  const json = await fetchJson(url, DEX_TIMEOUT_MS, "DEX Screener");
  const pairs = parseDexResponse(json).pairs ?? [];
  return pickBestBasePair(pairs, tokenAddress);
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

async function fetchEtherscanJson(params: Record<string, string>) {
  const endpoint = etherscanEndpointName(params);
  if (!process.env.ETHERSCAN_API_KEY?.trim()) {
    throw new EtherscanApiError("missing-key", endpoint, "Missing ETHERSCAN_API_KEY");
  }

  try {
    const json = await fetchJson(buildEtherscanApiUrl(params), ETHERSCAN_TIMEOUT_MS, `Etherscan ${endpoint}`);
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

async function fetchCreationTimestamp(txHash: string | undefined) {
  if (!txHash) return undefined;

  try {
    const txJson = await fetchEtherscanJson({
      module: "proxy",
      action: "eth_getTransactionByHash",
      txhash: txHash
    });
    const txResult = isRecord(txJson) && isRecord(txJson.result) ? txJson.result : undefined;
    const blockNumber = stringValue(txResult?.blockNumber);
    if (!blockNumber) return undefined;

    const blockJson = await fetchEtherscanJson({
      module: "proxy",
      action: "eth_getBlockByNumber",
      tag: blockNumber,
      boolean: "false"
    });
    const blockResult = isRecord(blockJson) && isRecord(blockJson.result) ? blockJson.result : undefined;
    const timestamp = parseHexInteger(blockResult?.timestamp);
    return timestamp ? timestamp * 1000 : undefined;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Creation timestamp lookup failed";
    warnEtherscan("proxy.creationTimestamp", message);
    return undefined;
  }
}

async function fetchBaseScanIntelligence(tokenAddress: string): Promise<BaseScanIntelligence> {
  if (!process.env.ETHERSCAN_API_KEY?.trim()) {
    return emptyBaseScanIntelligence("unavailable", "missing-key");
  }

  const [sourceResult, creationResult, supplyResult, holderResult] = await Promise.allSettled([
    fetchEtherscanJson({ module: "contract", action: "getsourcecode", address: tokenAddress }),
    fetchEtherscanJson({ module: "contract", action: "getcontractcreation", contractaddresses: tokenAddress }),
    fetchEtherscanJson({ module: "stats", action: "tokensupply", contractaddress: tokenAddress }),
    fetchEtherscanJson({ module: "token", action: "tokenholdercount", contractaddress: tokenAddress })
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
  const createdAt = createdAtSeconds ? createdAtSeconds * 1000 : await fetchCreationTimestamp(creationTxHash);
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

function withCacheHeaders(response: ServerResponse) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "public, max-age=0, s-maxage=120, stale-while-revalidate=60");
}

function sendJson(response: ServerResponse, status: number, payload: ScanApiResponse | { error: string; errorCode?: ScanErrorCode }) {
  withCacheHeaders(response);
  response.statusCode = status;
  response.end(JSON.stringify(payload));
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

    if (!ADDRESS_PATTERN.test(address)) {
      sendJson(response, 400, {
        error: "Invalid address. Enter a 0x token contract with 40 hexadecimal characters.",
        errorCode: "invalid_address"
      });
      return;
    }

    const [dexResult, baseScanResult] = await Promise.allSettled([
      fetchDexPair(address),
      fetchBaseScanIntelligence(address)
    ]);
    const baseScan =
      baseScanResult.status === "fulfilled"
        ? baseScanResult.value
        : emptyBaseScanIntelligence("unavailable", "request-failed");
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

    if (dexResult.status === "rejected") {
      const details = scanErrorDetails(dexResult.reason);
      sendJson(response, 502, {
        address,
        pair: null,
        baseScan,
        error: details.error,
        errorCode: details.errorCode,
        errors: { ...errors, dex: details.error }
      });
      return;
    }

    if (!dexResult.value) {
      sendJson(response, 404, {
        address,
        pair: null,
        baseScan,
        error: noBasePairMessage(),
        errorCode: "no_base_pair",
        errors: Object.keys(errors).length ? errors : undefined
      });
      return;
    }

    sendJson(response, 200, {
      address,
      pair: dexResult.value,
      baseScan,
      errors: Object.keys(errors).length ? errors : undefined
    });
  } catch (error) {
    console.error("[BaseScout] Scan API failed");
    sendJson(response, 500, {
      error: "Unexpected server error. Scan API could not complete the request.",
      errorCode: "unexpected_server_error"
    });
  }
}
