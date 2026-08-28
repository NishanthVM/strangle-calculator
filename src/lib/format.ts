export function formatINR(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "—";
  return (
    "₹" +
    value.toLocaleString("en-IN", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
}

export function formatUSD(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "—";
  return (
    "$" +
    value.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
}

export function formatBTC(value: number, decimals = 4): string {
  if (!Number.isFinite(value)) return "—";
  return (
    value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: decimals,
    }) + " BTC"
  );
}

export function formatNumber(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

/**
 * Restricts free-typed input to a valid (possibly partial) decimal number
 * string, e.g. while the user is mid-way through typing "0." or "-".
 */
export function isPartialDecimal(value: string): boolean {
  return value === "" || /^-?\d*\.?\d*$/.test(value);
}

/**
 * Converts a "DD-MM-YYYY" expiry string (the format Delta's API expects/returns)
 * into a human-readable "28 Aug 2026" label.
 */
export function formatExpiryLabel(ddmmyyyy: string): string {
  const [dd, mm, yyyy] = ddmmyyyy.split("-").map(Number);
  if (!dd || !mm || !yyyy) return ddmmyyyy;
  const date = new Date(Date.UTC(yyyy, mm - 1, dd));
  return date.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

/** "just now" / "5s ago" / "3m ago" — deliberately vague past a few minutes, since this is a polling UI, not truly real-time. */
export function formatRelativeTime(date: Date | null): string {
  if (!date) return "—";
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}
