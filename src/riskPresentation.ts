import type { RiskLevel } from "./types";

export const CURRENT_RISK_SCORE_VERSION = "2.0.0";

export function riskTone(level: RiskLevel) {
  if (level === "lower") return "good";
  if (level === "moderate") return "caution";
  if (level === "insufficient") return "unknown";
  return "bad";
}
