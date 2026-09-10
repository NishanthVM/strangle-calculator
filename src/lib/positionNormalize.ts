/**
 * Delta Exchange India's GET /v2/positions/margined response (verified
 * against Delta's own API documentation) returns per-position objects
 * shaped like:
 *   { user_id, size, entry_price, margin, liquidation_price,
 *     bankruptcy_price, adl_level, product_id, product_symbol, product }
 *
 * Notably: NO unrealized_pnl or mark_price field. So UPnL here is
 * computed from entry_price (Delta, authoritative) vs. mark price
 * (from the app's existing live option-chain data — the same source
 * everything else in this app already uses) — not read from a Delta
 * field that doesn't exist in this endpoint's response.
 */

export interface RawDeltaPosition {
  size?: number | string;
  entry_price?: string;
  margin?: string;
  liquidation_price?: string;
  product_id?: number;
  product_symbol?: string;
}

export interface NormalizedLegPosition {
  productId: number | null;
  size: number;
  isOpen: boolean;
  entryPriceUSD: number | null;
  marginUSD: number | null;
  liquidationPriceUSD: number | null;
  markPriceUSD: number | null;
  /** Computed here (not a direct Delta field) — short-position UPnL: (entry − mark) × |size| × contractSize. */
  unrealizedPnlUSD: number | null;
}

function toNum(v: string | number | undefined): number | null {
  if (v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export function normalizePosition(
  raw: RawDeltaPosition | undefined,
  markPriceUSD: number | null,
  contractSize: number
): NormalizedLegPosition {
  const size = toNum(raw?.size) ?? 0;
  const entryPriceUSD = toNum(raw?.entry_price);
  const marginUSD = toNum(raw?.margin);
  const liquidationPriceUSD = toNum(raw?.liquidation_price);
  const isOpen = size !== 0;

  let unrealizedPnlUSD: number | null = null;
  if (isOpen && entryPriceUSD !== null && markPriceUSD !== null) {
    // Short option leg: profit when mark price falls below entry price.
    unrealizedPnlUSD = (entryPriceUSD - markPriceUSD) * Math.abs(size) * contractSize;
  }

  return {
    productId: raw?.product_id ?? null,
    size,
    isOpen,
    entryPriceUSD,
    marginUSD,
    liquidationPriceUSD,
    markPriceUSD,
    unrealizedPnlUSD,
  };
}

export function findPositionForProduct(positions: unknown, productId: number): RawDeltaPosition | undefined {
  if (!Array.isArray(positions)) return undefined;
  return positions.find((p) => p && typeof p === "object" && (p as RawDeltaPosition).product_id === productId) as
    | RawDeltaPosition
    | undefined;
}
