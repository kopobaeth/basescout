import posthog from "posthog-js";

type AnalyticsEventName =
  | "scan_clicked"
  | "scan_success"
  | "scan_failed"
  | "example_token_clicked"
  | "copy_pair_address"
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
  if (window.__basescoutPostHogInitialized) return;

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
  if (!window.__basescoutPostHogInitialized) return;
  posthog.capture(eventName, cleanedProperties(properties));
}
