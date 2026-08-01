import { isBasePaintOverviewResponse } from "./data";
import { isBasePaintArtistResponse } from "./artist";
import { isBasePaintCanvasResponse } from "./canvas";
import { isBasePaintCollectorResponse } from "./collector";
import { isBasePaintPulseResponse } from "./pulse";
import type {
  BasePaintArtistResponse,
  BasePaintCanvasResponse,
  BasePaintCollectorResponse,
  BasePaintOverviewResponse,
  BasePaintPulseResponse
} from "./types";

const BASEPAINT_REQUEST_TIMEOUT_MS = 10_000;

export function apiErrorMessage(value: unknown, fallback: string) {
  if (!value || typeof value !== "object") return fallback;
  const payload = value as Record<string, unknown>;
  if (typeof payload.error === "string" && payload.error.trim()) return payload.error;
  if (
    payload.error &&
    typeof payload.error === "object" &&
    typeof (payload.error as Record<string, unknown>).message === "string"
  ) {
    return (payload.error as Record<string, unknown>).message as string;
  }
  if (typeof payload.message === "string" && payload.message.trim()) return payload.message;
  return fallback;
}

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
      throw new Error(
        apiErrorMessage(payload, `BasePaint data request returned HTTP ${response.status}.`)
      );
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

export async function loadBasePaintPulse(signal?: AbortSignal): Promise<BasePaintPulseResponse> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), BASEPAINT_REQUEST_TIMEOUT_MS);
  const abortFromParent = () => controller.abort();
  signal?.addEventListener("abort", abortFromParent, { once: true });

  try {
    const response = await fetch("/api/basepaint-activity", {
      headers: {
        Accept: "application/json"
      },
      signal: controller.signal
    });
    const payload = (await response.json()) as unknown;

    if (!response.ok) {
      throw new Error(
        apiErrorMessage(payload, `BasePaint activity request returned HTTP ${response.status}.`)
      );
    }
    if (!isBasePaintPulseResponse(payload)) {
      throw new Error("BasePaint activity returned an unexpected response.");
    }

    return payload;
  } finally {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortFromParent);
  }
}

export async function loadBasePaintArtist(
  address: string,
  signal?: AbortSignal
): Promise<BasePaintArtistResponse> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), BASEPAINT_REQUEST_TIMEOUT_MS);
  const abortFromParent = () => controller.abort();
  signal?.addEventListener("abort", abortFromParent, { once: true });

  try {
    const response = await fetch(`/api/basepaint-artist?address=${encodeURIComponent(address)}`, {
      headers: {
        Accept: "application/json"
      },
      signal: controller.signal
    });
    const payload = (await response.json()) as unknown;

    if (!response.ok) {
      throw new Error(
        apiErrorMessage(payload, `BasePaint artist request returned HTTP ${response.status}.`)
      );
    }
    if (!isBasePaintArtistResponse(payload)) {
      throw new Error("BasePaint artist data returned an unexpected response.");
    }

    return payload;
  } finally {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortFromParent);
  }
}

export async function loadBasePaintCanvas(
  day: number | null,
  signal?: AbortSignal
): Promise<BasePaintCanvasResponse> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), BASEPAINT_REQUEST_TIMEOUT_MS);
  const abortFromParent = () => controller.abort();
  signal?.addEventListener("abort", abortFromParent, { once: true });

  try {
    const response = await fetch(`/api/basepaint-canvas?day=${day ?? ""}`, {
      headers: {
        Accept: "application/json"
      },
      signal: controller.signal
    });
    const payload = (await response.json()) as unknown;

    if (!response.ok) {
      throw new Error(
        apiErrorMessage(payload, `BasePaint canvas request returned HTTP ${response.status}.`)
      );
    }
    if (!isBasePaintCanvasResponse(payload)) {
      throw new Error("BasePaint canvas data returned an unexpected response.");
    }

    return payload;
  } finally {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortFromParent);
  }
}

export async function loadBasePaintCollector(
  address: string,
  signal?: AbortSignal
): Promise<BasePaintCollectorResponse> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), BASEPAINT_REQUEST_TIMEOUT_MS);
  const abortFromParent = () => controller.abort();
  signal?.addEventListener("abort", abortFromParent, { once: true });

  try {
    const response = await fetch(`/api/basepaint-collector?address=${encodeURIComponent(address)}`, {
      headers: {
        Accept: "application/json"
      },
      signal: controller.signal
    });
    const payload = (await response.json()) as unknown;

    if (!response.ok) {
      throw new Error(
        apiErrorMessage(payload, `BasePaint collector request returned HTTP ${response.status}.`)
      );
    }
    if (!isBasePaintCollectorResponse(payload)) {
      throw new Error("BasePaint collector data returned an unexpected response.");
    }

    return payload;
  } finally {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortFromParent);
  }
}
