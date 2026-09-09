import posthog from "posthog-js";

type AnalyticsEventName =
  | "stocks_opened"
  | "stock_report_opened"
  | "stock_saved_changed"
  | "basepaint_collect_connected"
  | "basepaint_collect_failed"
  | "basepaint_collect_reviewed"
  | "basepaint_collect_submitted"
  | "basepaint_collect_success"
  | "scan_clicked"
  | "scan_success"
  | "scan_failed"
  | "example_token_clicked"
  | "copy_pair_address"
  | "copy_token_address"
  | "open_basescan"
  | "open_dexscreener"
  | "market_opened"
  | "watchlist_added"
  | "watchlist_removed"
  | "watchlist_rescan"
  | "security_section_viewed"
  | "critical_warning_displayed"
  | "security_check_unavailable";

type AnalyticsProperties = Record<string, boolean | number | string | undefined>;

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
export const ANALYTICS_OPT_OUT_STORAGE_KEY = "basescout:analytics-opt-out";

declare global {
  interface Window {
    __basescoutPostHogInitialized?: boolean;
  }
}

function cleanedProperties(properties: AnalyticsProperties) {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined && value !== "")
  );
}

function browserStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function analyticsPreferenceFromSearch(search: string) {
  const value = new URLSearchParams(search).get("analytics")?.toLowerCase();
  if (value === "off") return true;
  if (value === "on") return false;
  return null;
}

export function syncAnalyticsPreferenceFromUrl() {
  if (typeof window === "undefined") return;
  const preference = analyticsPreferenceFromSearch(window.location.search);
  if (preference === null) return;

  const storage = browserStorage();
  if (preference) storage?.setItem(ANALYTICS_OPT_OUT_STORAGE_KEY, "true");
  else storage?.removeItem(ANALYTICS_OPT_OUT_STORAGE_KEY);

  const url = new URL(window.location.href);
  url.searchParams.delete("analytics");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

export function analyticsOptedOut() {
  return browserStorage()?.getItem(ANALYTICS_OPT_OUT_STORAGE_KEY) === "true";
}

export function shortAddress(address?: string) {
  const value = address?.trim();
  if (!value || !ADDRESS_PATTERN.test(value)) return undefined;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function tokenAnalyticsProperties(address?: string, symbol?: string): AnalyticsProperties {
  return {
    token_symbol: symbol?.trim() || undefined,
    short_address: shortAddress(address)
  };
}

export function initPostHog() {
  if (window.__basescoutPostHogInitialized || analyticsOptedOut()) return;

  const key = import.meta.env.VITE_POSTHOG_KEY?.trim();
  const host = import.meta.env.VITE_POSTHOG_HOST?.trim();

  if (!key || !host) return;

  posthog.init(key, {
    api_host: host,
    autocapture: false,
    capture_pageview: true,
    person_profiles: "identified_only"
  });

  window.__basescoutPostHogInitialized = true;
}

export function trackEvent(eventName: AnalyticsEventName, properties: AnalyticsProperties = {}) {
  if (!window.__basescoutPostHogInitialized || analyticsOptedOut()) return;
  posthog.capture(eventName, cleanedProperties(properties));
}
