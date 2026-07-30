import { isBasePaintOverviewResponse } from "./data";
import { isBasePaintArtistResponse } from "./artist";
import { isBasePaintCanvasResponse } from "./canvas";
import { isBasePaintPulseResponse } from "./pulse";
import type {
  BasePaintArtistResponse,
  BasePaintCanvasResponse,
  BasePaintErrorResponse,
  BasePaintOverviewResponse,
  BasePaintPulseResponse
} from "./types";

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
      const error = payload as Partial<BasePaintErrorResponse>;
      throw new Error(error.error ?? `BasePaint activity request returned HTTP ${response.status}.`);
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
      const error = payload as Partial<BasePaintErrorResponse>;
      throw new Error(error.error ?? `BasePaint artist request returned HTTP ${response.status}.`);
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
      const error = payload as Partial<BasePaintErrorResponse>;
      throw new Error(error.error ?? `BasePaint canvas request returned HTTP ${response.status}.`);
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
