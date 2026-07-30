import {
  BASEPAINT_DAY_DURATION_MS,
  BASEPAINT_DAY_ONE_START_MS
} from "./data";

const INTEGER_FORMATTER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const ETH_FORMATTER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });
const USD_CENTS_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2
});
const USD_WHOLE_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});
const DAY_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC"
});
const UTC_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC"
});

export function numberText(value: number) {
  return INTEGER_FORMATTER.format(value);
}

export function ethFromWei(value: string) {
  const amount = Number(value) / 1_000_000_000_000_000_000;
  if (!Number.isFinite(amount) || amount <= 0) return "—";
  return `${ETH_FORMATTER.format(amount)} ETH`;
}

export function usdFromUsd8(value: string) {
  const amount = Number(value) / 100_000_000;
  if (!Number.isFinite(amount) || amount <= 0) return "—";
  return (amount < 100 ? USD_CENTS_FORMATTER : USD_WHOLE_FORMATTER).format(amount);
}

export function basePaintDayDateText(day: number) {
  const date = new Date(BASEPAINT_DAY_ONE_START_MS + (Math.max(1, day) - 1) * BASEPAINT_DAY_DURATION_MS);
  return DAY_DATE_FORMATTER.format(date);
}

export function utcDateTimeText(value: number) {
  return UTC_DATE_TIME_FORMATTER.format(value);
}

export function shortIdentity(value?: string) {
  if (!value) return "Unknown";
  if (!value.startsWith("0x") || value.length < 14) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}
