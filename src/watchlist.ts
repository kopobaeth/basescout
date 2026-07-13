import { shortAddress } from "./analytics";
import type { ScanResult, WatchlistItem } from "./types";

const WATCHLIST_STORAGE_KEY = "basescout:watchlist:v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseWatchlistItem(value: unknown): WatchlistItem | undefined {
  if (!isRecord(value)) return undefined;

  const address = stringValue(value.address);
  const item: WatchlistItem = {
    address: address ?? "",
    shortAddress: stringValue(value.shortAddress) ?? shortAddress(address) ?? "",
    symbol: stringValue(value.symbol) ?? "UNKNOWN",
    tokenLogo: stringValue(value.tokenLogo),
    lastRiskScore: numberValue(value.lastRiskScore) ?? 0,
    lastScannedAt: numberValue(value.lastScannedAt) ?? 0
  };

  if (!item.address || !item.shortAddress || !item.lastScannedAt || !Number.isFinite(item.lastRiskScore)) {
    return undefined;
  }

  return item;
}

export function readWatchlist() {
  try {
    const stored = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    return parsed.map(parseWatchlistItem).filter((item): item is WatchlistItem => Boolean(item));
  } catch {
    return [];
  }
}

export function writeWatchlist(items: WatchlistItem[]) {
  try {
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // localStorage can be unavailable in private contexts.
  }
}

export function buildWatchlistItem(result: ScanResult, tokenAddress: string): WatchlistItem | undefined {
  const address = result.targetToken.address ?? tokenAddress;
  const shortened = shortAddress(address);
  if (!shortened) return undefined;

  return {
    address,
    shortAddress: shortened,
    symbol: result.targetToken.symbol ?? "UNKNOWN",
    tokenLogo: result.pair.info?.imageUrl,
    lastRiskScore: result.score,
    lastScannedAt: Date.now()
  };
}

export function upsertWatchlistItem(watchlist: WatchlistItem[], item: WatchlistItem) {
  const next = [
    item,
    ...watchlist.filter((watchlistItem) => watchlistItem.address.toLowerCase() !== item.address.toLowerCase())
  ];

  writeWatchlist(next);
  return next;
}

export function removeWatchlistItem(watchlist: WatchlistItem[], address: string) {
  const next = watchlist.filter((watchlistItem) => watchlistItem.address.toLowerCase() !== address.toLowerCase());
  writeWatchlist(next);
  return next;
}
