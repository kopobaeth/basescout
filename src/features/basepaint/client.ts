import { isBasePaintOverviewResponse } from "./data";
import type { BasePaintErrorResponse, BasePaintOverviewResponse } from "./types";

const BASEPAINT_REQUEST_TIMEOUT_MS = 10_000;

export async function loadBasePaintOverview(signal?: AbortSignal): Promise<BasePaintOverviewResponse> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), BASEPAINT_REQUEST_TIMEOUT_MS);
  const abortFromParent = () => controller.abort();
  signal?.addEventListener("abort", abortFromParent, { once: true });

  try {
    const response = await fetch("/api/basepaint?limit=14", {
      headers: {
        Accept: "application/json"
      },
      signal: controller.signal
    });
    const payload = (await response.json()) as unknown;

    if (!response.ok) {
      const error = payload as Partial<BasePaintErrorResponse>;
      throw new Error(error.error ?? `BasePaint data request returned HTTP ${response.status}.`);
    }
    if (!isBasePaintOverviewResponse(payload)) {
      throw new Error("BasePaint returned an unexpected response.");
    }

    return payload;
  } finally {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortFromParent);
  }
}
