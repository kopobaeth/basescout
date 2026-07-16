import type { TrendingApiResponse, TrendingStatus } from "./types";

export const TRENDING_REQUEST_TIMEOUT_MS = 15_000;

type Fetcher = typeof fetch;

export type TrendingRequestHandlers = {
  setData: (data: TrendingApiResponse | null) => void;
  setError: (message: string) => void;
  setStatus: (status: TrendingStatus) => void;
};

export type TrendingRequestOptions = TrendingRequestHandlers & {
  fetcher?: Fetcher;
  signal: AbortSignal;
  timeoutMs?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

export function parseTrendingApiResponse(value: unknown): TrendingApiResponse | undefined {
  if (!isRecord(value) || !Array.isArray(value.pools)) return undefined;

  return {
    source: value.source === "geckoterminal" ? "geckoterminal" : "geckoterminal",
    attribution: "Data by GeckoTerminal",
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : Date.now(),
    cacheSeconds: typeof value.cacheSeconds === "number" ? value.cacheSeconds : 60,
    pools: value.pools.filter(isRecord).map((pool) => pool as TrendingApiResponse["pools"][number])
  };
}

function abortError() {
  return new DOMException("The operation was aborted.", "AbortError");
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "GeckoTerminal trending pools could not be loaded.";
}

export async function loadTrendingPools({
  fetcher = fetch,
  setData,
  setError,
  setStatus,
  signal,
  timeoutMs = TRENDING_REQUEST_TIMEOUT_MS
}: TrendingRequestOptions) {
  const controller = new AbortController();
  let timedOut = false;
  const abortRequest = () => controller.abort();
  const timeoutId = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  signal.addEventListener("abort", abortRequest, { once: true });
  setStatus("loading");
  setError("");

  try {
    if (signal.aborted) throw abortError();

    const response = await fetcher("/api/trending", {
      signal: controller.signal
    });
    const contentType = response.headers.get("content-type") ?? "";
    const json = contentType.includes("application/json") ? await response.json() : undefined;

    if (!response.ok) {
      const providerMessage = isRecord(json) ? stringValue(json.error) : undefined;
      throw new Error(providerMessage ?? "GeckoTerminal trending pools could not be loaded.");
    }

    const payload = parseTrendingApiResponse(json);
    if (!payload) throw new Error("GeckoTerminal returned invalid trending pool data.");

    if (signal.aborted) throw abortError();

    setData(payload);
    setStatus("success");
    return "success" as const;
  } catch (error) {
    if (signal.aborted && !timedOut) return "aborted" as const;

    setData(null);
    setStatus("error");
    setError(timedOut ? "GeckoTerminal trending pools request timed out." : errorMessage(error));
    return "error" as const;
  } finally {
    globalThis.clearTimeout(timeoutId);
    signal.removeEventListener("abort", abortRequest);
  }
}
