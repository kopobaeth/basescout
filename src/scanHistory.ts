import { shortAddress } from "./analytics";
import type { RiskLevel, ScanHistoryItem, ScanResult } from "./types";

const SCAN_HISTORY_STORAGE_KEY = "basescout:scan-history:v1";
const MAX_HISTORY_ITEMS = 10;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function riskLevelValue(value: unknown): RiskLevel | undefined {
  return value === "lower" ||
    value === "moderate" ||
    value === "high" ||
    value === "critical" ||
    value === "insufficient"
    ? value
    : undefined;
}

function parseHistoryItem(value: unknown): ScanHistoryItem | undefined {
  if (!isRecord(value)) return undefined;

  const address = stringValue(value.address);
  const fallbackShortAddress = shortAddress(address);
  const item: ScanHistoryItem = {
    address: address ?? "",
    shortAddress: stringValue(value.shortAddress) ?? fallbackShortAddress ?? "",
    symbol: stringValue(value.symbol) ?? "UNKNOWN",
    timestamp: numberValue(value.timestamp) ?? 0,
    riskScore: numberValue(value.riskScore) ?? 0,
    scoreVersion: stringValue(value.scoreVersion),
    riskLevel: riskLevelValue(value.riskLevel),
    tokenLogo: stringValue(value.tokenLogo)
  };

  if (!item.address || !item.shortAddress || !item.timestamp || !Number.isFinite(item.riskScore)) {
    return undefined;
  }

  return item;
}

export function readScanHistory() {
  try {
    const stored = window.localStorage.getItem(SCAN_HISTORY_STORAGE_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(parseHistoryItem)
      .filter((item): item is ScanHistoryItem => Boolean(item))
      .slice(0, MAX_HISTORY_ITEMS);
  } catch {
    return [];
  }
}

export function writeScanHistory(items: ScanHistoryItem[]) {
  try {
    window.localStorage.setItem(SCAN_HISTORY_STORAGE_KEY, JSON.stringify(items.slice(0, MAX_HISTORY_ITEMS)));
  } catch {
    // localStorage can be unavailable in private contexts.
  }
}

export function clearScanHistory() {
  try {
    window.localStorage.removeItem(SCAN_HISTORY_STORAGE_KEY);
  } catch {
    // localStorage can be unavailable in private contexts.
  }
}

export function buildScanHistoryItem(result: ScanResult, tokenAddress: string): ScanHistoryItem | undefined {
  const address = result.targetToken.address ?? tokenAddress;
  const shortened = shortAddress(address);
  if (!shortened) return undefined;

  return {
    address,
    shortAddress: shortened,
    symbol: result.targetToken.symbol ?? "UNKNOWN",
    timestamp: Date.now(),
    riskScore: result.score,
    scoreVersion: result.scoreVersion,
    riskLevel: result.riskLevel,
    tokenLogo: result.pair.info?.imageUrl
  };
}

export function upsertScanHistoryItem(history: ScanHistoryItem[], item: ScanHistoryItem) {
  const next = [
    item,
    ...history.filter((historyItem) => historyItem.address.toLowerCase() !== item.address.toLowerCase())
  ].slice(0, MAX_HISTORY_ITEMS);

  writeScanHistory(next);
  return next;
}
