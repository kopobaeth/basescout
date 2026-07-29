const INTEGER_FORMATTER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const ETH_FORMATTER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });

export function numberText(value: number) {
  return INTEGER_FORMATTER.format(value);
}

export function ethFromWei(value: string) {
  const amount = Number(value) / 1_000_000_000_000_000_000;
  if (!Number.isFinite(amount) || amount <= 0) return "—";
  return `${ETH_FORMATTER.format(amount)} ETH`;
}

export function shortIdentity(value?: string) {
  if (!value) return "Unknown";
  if (!value.startsWith("0x") || value.length < 14) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}
