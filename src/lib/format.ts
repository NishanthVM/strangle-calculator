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
