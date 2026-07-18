import type {
  SecurityCheckKey,
  SecurityCheckStatus,
  SecurityEvidenceLevel,
  SecurityFinding,
  SecurityIntelligence
} from "./types";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DEAD_ADDRESS = "0x000000000000000000000000000000000000dead";

const SECURITY_CHECK_KEYS: SecurityCheckKey[] = [
  "honeypot",
  "buy_tax",
  "sell_tax",
  "transfer_tax",
  "owner_can_mint",
  "blacklist",
  "whitelist",
  "pausable",
  "trading_restrictions",
  "proxy",
  "ownership_renounced",
  "owner_privileges",
  "verified_contract"
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  return undefined;
}

function firstValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = stringValue(record[key]);
    if (value !== undefined && value !== "") return value;
  }

  return undefined;
}

function flagValue(record: Record<string, unknown>, keys: string[]) {
  const value = firstValue(record, keys)?.trim().toLowerCase();
  if (value === undefined) return undefined;
  if (["1", "true", "yes"].includes(value)) return true;
  if (["0", "false", "no"].includes(value)) return false;
  return undefined;
}

function taxPercent(record: Record<string, unknown>, keys: string[]) {
  const value = firstValue(record, keys);
  if (value === undefined) return undefined;

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed <= 1 ? parsed * 100 : parsed;
}

function percentText(value: number) {
  return `${value.toFixed(value < 1 ? 2 : 1).replace(/\.0$/, "")}%`;
}

function ownerRenounced(record: Record<string, unknown>) {
  const explicit = flagValue(record, ["owner_renounced", "is_renounced"]);
  if (explicit !== undefined) return explicit;

  const owner = firstValue(record, ["owner_address"]);
  if (!owner) return undefined;
  const normalized = owner.toLowerCase();
  return normalized === ZERO_ADDRESS || normalized === DEAD_ADDRESS;
}

function finding(
  key: SecurityCheckKey,
  label: string,
  status: SecurityCheckStatus,
  summary: string,
  explanation: string,
  evidence: SecurityEvidenceLevel,
  value?: string
): SecurityFinding {
  return { key, label, status, summary, explanation, evidence, value };
}

function unknownFinding(key: SecurityCheckKey, label: string, summary: string) {
  return finding(
    key,
    label,
    "unknown",
    summary,
    "Security provider did not return this field. Missing security data is treated as insufficient information, not lower risk.",
    "unavailable"
  );
}

export function emptySecurityIntelligence(note = "Security data unavailable. Market and contract scanning can continue."): SecurityIntelligence {
  return {
    status: "unavailable",
    provider: "goplus",
    checkedAt: Date.now(),
    checks: SECURITY_CHECK_KEYS.map((key) => unknownFinding(key, securityLabel(key), "Security data unavailable")),
    unavailableChecks: [...SECURITY_CHECK_KEYS],
    criticalCount: 0,
    warningCount: 0,
    note
  };
}

export function securityLabel(key: SecurityCheckKey) {
  const labels: Record<SecurityCheckKey, string> = {
    honeypot: "Honeypot status",
    buy_tax: "Buy tax",
    sell_tax: "Sell tax",
    transfer_tax: "Transfer tax",
    owner_can_mint: "Owner can mint",
    blacklist: "Blacklist capability",
    whitelist: "Whitelist capability",
    pausable: "Pausable transfers",
    trading_restrictions: "Trading restrictions",
    proxy: "Proxy or upgradeable contract",
    ownership_renounced: "Ownership renounced",
    owner_privileges: "Owner privileges",
    verified_contract: "Open-source contract"
  };

  return labels[key];
}

export function normalizeGoPlusSecurityResponse(value: unknown, tokenAddress: string): SecurityIntelligence {
  if (!isRecord(value) || !isRecord(value.result)) {
    return emptySecurityIntelligence("Security provider returned an invalid response.");
  }

  const tokenRecord = Object.entries(value.result).find(([address]) => address.toLowerCase() === tokenAddress.toLowerCase())?.[1];
  if (!isRecord(tokenRecord)) {
    return emptySecurityIntelligence("Security provider did not return this token.");
  }

  const checks: SecurityFinding[] = [];
  const honeypot = flagValue(tokenRecord, ["is_honeypot", "honeypot"]);
  const cannotSell = flagValue(tokenRecord, ["cannot_sell_all", "cannot_sell"]);
  const buyTax = taxPercent(tokenRecord, ["buy_tax"]);
  const sellTax = taxPercent(tokenRecord, ["sell_tax"]);
  const transferTax = taxPercent(tokenRecord, ["transfer_tax"]);
  const mintable = flagValue(tokenRecord, ["is_mintable", "mintable", "owner_can_mint"]);
  const blacklist = flagValue(tokenRecord, ["blacklist_function", "is_blacklisted", "blacklist"]);
  const whitelist = flagValue(tokenRecord, ["whitelist_function", "is_whitelisted", "whitelist"]);
  const pausable = flagValue(tokenRecord, ["transfer_pausable", "pausable"]);
  const tradingRestriction = flagValue(tokenRecord, ["trading_cooldown", "personal_slippage_modifiable", "slippage_modifiable", "anti_whale_modifiable"]);
  const proxy = flagValue(tokenRecord, ["is_proxy", "proxy"]);
  const renounced = ownerRenounced(tokenRecord);
  const verified = flagValue(tokenRecord, ["is_open_source", "open_source", "verified_contract"]);
  const hiddenOwner = flagValue(tokenRecord, ["hidden_owner"]);
  const takeBackOwnership = flagValue(tokenRecord, ["can_take_back_ownership"]);
  const ownerModifiesBalance = flagValue(tokenRecord, ["owner_change_balance"]);
  const ownerPrivileged = [hiddenOwner, takeBackOwnership, ownerModifiesBalance].some(Boolean);

  checks.push(
    honeypot === undefined
      ? unknownFinding("honeypot", "Honeypot status", "Honeypot status unknown")
      : honeypot || cannotSell
        ? finding("honeypot", "Honeypot status", "critical", cannotSell ? "Cannot sell detected" : "Honeypot detected", "Provider reports that selling may be blocked. This matters because holders may be unable to exit a position. Evidence: confirmed by provider response.", "confirmed")
        : finding("honeypot", "Honeypot status", "pass", "No honeypot detected", "Provider did not flag honeypot behavior. This lowers this specific risk signal only; it is not a guarantee of safety. Evidence: confirmed by provider response.", "confirmed")
  );

  checks.push(
    buyTax === undefined
      ? unknownFinding("buy_tax", "Buy tax", "Buy tax unknown")
      : finding("buy_tax", "Buy tax", buyTax > 10 ? "warning" : "pass", `Buy tax: ${percentText(buyTax)}`, buyTax > 10 ? "High buy tax can make entries expensive and can be changed in some contracts. Evidence: confirmed by provider response." : "Buy tax is not above the 10% high-tax threshold. Evidence: confirmed by provider response.", "confirmed", percentText(buyTax))
  );

  checks.push(
    sellTax === undefined
      ? unknownFinding("sell_tax", "Sell tax", "Sell tax unknown")
      : finding("sell_tax", "Sell tax", sellTax >= 100 ? "critical" : sellTax > 10 ? "warning" : "pass", `Sell tax: ${percentText(sellTax)}`, sellTax >= 100 ? "A 100% sell tax can make selling economically impossible. Evidence: confirmed by provider response." : sellTax > 10 ? "Sell tax above 10% materially reduces exits and can indicate hostile token mechanics. Evidence: confirmed by provider response." : "Sell tax is not above the 10% high-tax threshold. Evidence: confirmed by provider response.", "confirmed", percentText(sellTax))
  );

  checks.push(
    transferTax === undefined
      ? unknownFinding("transfer_tax", "Transfer tax", "Transfer tax unknown")
      : finding("transfer_tax", "Transfer tax", transferTax > 10 ? "warning" : "pass", `Transfer tax: ${percentText(transferTax)}`, transferTax > 10 ? "High transfer tax can penalize normal wallet movement. Evidence: confirmed by provider response." : "Transfer tax is not above the 10% high-tax threshold. Evidence: confirmed by provider response.", "confirmed", percentText(transferTax))
  );

  checks.push(
    mintable === undefined
      ? unknownFinding("owner_can_mint", "Owner can mint", "Mint capability unknown")
      : mintable
        ? finding("owner_can_mint", "Owner can mint", "warning", "Owner can mint", "Mint authority can inflate supply and dilute holders. Evidence: confirmed by provider response.", "confirmed")
        : finding("owner_can_mint", "Owner can mint", "pass", "No owner mint capability detected", "Provider did not flag mint authority. Evidence: confirmed by provider response.", "confirmed")
  );

  checks.push(
    blacklist === undefined
      ? unknownFinding("blacklist", "Blacklist capability", "Blacklist capability unknown")
      : blacklist
        ? finding("blacklist", "Blacklist capability", "warning", "Blacklist capability enabled", "Blacklist controls can block selected wallets from transferring or selling. Evidence: confirmed by provider response.", "confirmed")
        : finding("blacklist", "Blacklist capability", "pass", "No blacklist capability detected", "Provider did not flag blacklist controls. Evidence: confirmed by provider response.", "confirmed")
  );

  checks.push(
    whitelist === undefined
      ? unknownFinding("whitelist", "Whitelist capability", "Whitelist capability unknown")
      : whitelist
        ? finding("whitelist", "Whitelist capability", "warning", "Whitelist capability enabled", "Whitelist controls can restrict who may trade or transfer. Evidence: confirmed by provider response.", "confirmed")
        : finding("whitelist", "Whitelist capability", "pass", "No whitelist capability detected", "Provider did not flag whitelist controls. Evidence: confirmed by provider response.", "confirmed")
  );

  checks.push(
    pausable === undefined
      ? unknownFinding("pausable", "Pausable transfers", "Pausable transfer status unknown")
      : pausable
        ? finding("pausable", "Pausable transfers", "warning", "Pausable transfers enabled", "Pausable transfers can stop movement during owner-controlled states. Evidence: confirmed by provider response.", "confirmed")
        : finding("pausable", "Pausable transfers", "pass", "No pausable transfer control detected", "Provider did not flag pausable transfers. Evidence: confirmed by provider response.", "confirmed")
  );

  checks.push(
    tradingRestriction === undefined
      ? unknownFinding("trading_restrictions", "Trading restrictions", "Trading restrictions unknown")
      : tradingRestriction
        ? finding("trading_restrictions", "Trading restrictions", "warning", "Trading restrictions detected", "Trading restrictions can limit exits, change slippage rules, or impose wallet-level limits. Evidence: inferred from provider restriction fields.", "inferred")
        : finding("trading_restrictions", "Trading restrictions", "pass", "No trading restrictions detected", "Provider did not flag cooldown, slippage, or anti-whale restrictions. Evidence: inferred from provider restriction fields.", "inferred")
  );

  checks.push(
    proxy === undefined
      ? unknownFinding("proxy", "Proxy or upgradeable contract", "Proxy status unknown")
      : proxy
        ? finding("proxy", "Proxy or upgradeable contract", "warning", "Upgradeable proxy", "Upgradeable contracts can change behavior after this scan. Evidence: confirmed by provider response.", "confirmed")
        : finding("proxy", "Proxy or upgradeable contract", "pass", "No proxy detected", "Provider did not flag proxy behavior. Evidence: confirmed by provider response.", "confirmed")
  );

  checks.push(
    renounced === undefined
      ? unknownFinding("ownership_renounced", "Ownership renounced", "Ownership status unknown")
      : renounced
        ? finding("ownership_renounced", "Ownership renounced", "pass", "Ownership renounced", "Renounced ownership can reduce direct owner control, though other privileged roles may still exist. Evidence: inferred from owner address or provider flag.", "inferred")
        : finding("ownership_renounced", "Ownership renounced", "warning", "Ownership not renounced", "Active ownership can preserve administrative control over token behavior. Evidence: inferred from owner address or provider flag.", "inferred")
  );

  checks.push(
    ownerPrivileged
      ? finding("owner_privileges", "Owner privileges", "warning", "Owner privileges detected", "Owner-only controls can alter balances, regain ownership, or hide control paths. Evidence: inferred from provider owner privilege fields.", "inferred")
      : [hiddenOwner, takeBackOwnership, ownerModifiesBalance].every((value) => value === false)
        ? finding("owner_privileges", "Owner privileges", "pass", "No high-risk owner privileges detected", "Provider did not flag hidden owner, ownership recovery, or owner balance changes. Evidence: inferred from provider owner privilege fields.", "inferred")
        : unknownFinding("owner_privileges", "Owner privileges", "Owner privilege status unknown")
  );

  checks.push(
    verified === undefined
      ? unknownFinding("verified_contract", "Open-source contract", "Open-source status unknown")
      : verified
        ? finding("verified_contract", "Open-source contract", "pass", "Contract verified/open-source", "Verified source improves reviewability. This is a positive signal only, not proof of safety. Evidence: confirmed by provider response.", "confirmed")
        : finding("verified_contract", "Open-source contract", "warning", "Contract source not verified", "Unverified source limits independent review of token behavior. Evidence: confirmed by provider response.", "confirmed")
  );

  const unavailableChecks = checks.filter((check) => check.status === "unknown").map((check) => check.key);
  const criticalCount = checks.filter((check) => check.status === "critical").length;
  const warningCount = checks.filter((check) => check.status === "warning").length;

  return {
    status: unavailableChecks.length ? "partial" : "available",
    provider: "goplus",
    checkedAt: Date.now(),
    checks,
    unavailableChecks,
    criticalCount,
    warningCount,
    note: unavailableChecks.length ? "Some security checks were unavailable. Missing data is not treated as lower risk." : undefined
  };
}
