/**
 * Delta Exchange India public market-data client.
 *
 * IMPORTANT — VERIFICATION LIMITS: this file was written against the
 * endpoint shapes and query parameters described in the feature request
 * (GET /v2/products, GET /v2/tickers with contract_types /
 * underlying_asset_symbols / expiry_date filters) and Delta's publicly
 * documented v2 REST conventions. The sandbox this was built in has no
 * network route to api.india.delta.exchange, so neither the exact
 * response field names nor CORS behavior for direct browser requests
 * could be executed and confirmed here. Every parse below is therefore
 * defensive — optional chaining and fallbacks throughout — and
 * deliberately never fabricates a field that isn't present in the
 * response (per the feature spec's "only display fields that are
 * actually available" requirement). If field names turn out to differ
 * once run against the live API, only the normalize* functions below
 * need adjusting — callers only see the normalized shape.
 *
 * No API key/secret is used or requested — only public endpoints.
 */

const API_BASE = "https://api.india.delta.exchange";
const FETCH_TIMEOUT_MS = 8000;

export interface ApiResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface OptionContract {
  symbol?: string;
  strike: number;
  premium?: number; // mark price, best-effort
  spotPrice?: number; // underlying index price at time of quote, if present on the ticker
  bid?: number;
  ask?: number;
  delta?: number;
}

export interface OptionChain {
  calls: OptionContract[];
  puts: OptionContract[];
  fetchedAt: Date;
}

async function fetchJson<T>(url: string): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!res.ok) {
      return { ok: false, error: `Delta API returned ${res.status} ${res.statusText}` };
    }
    const json = await res.json();
    return { ok: true, data: json as T };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown network error";
    // A CORS failure or offline network both surface as a generic fetch
    // TypeError in the browser — there's no way to distinguish them from
    // here, so both get the same graceful-fallback treatment upstream.
    return { ok: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

interface RawProduct {
  id?: number;
  symbol?: string;
  contract_type?: string;
  underlying_asset?: { symbol?: string };
  state?: string;
  settlement_time?: string;
}

/**
 * Fetches the product catalog and derives the list of live BTC option
 * expiry dates (as "DD-MM-YYYY" strings, matching what /v2/tickers
 * expects), sorted chronologically with the nearest first. Never
 * hard-codes an expiry or assumes a weekly cadence.
 */
export async function fetchBtcOptionExpiries(): Promise<ApiResult<string[]>> {
  const result = await fetchJson<{ result?: RawProduct[] }>(`${API_BASE}/v2/products?contract_types=call_options,put_options`);
  if (!result.ok || !result.data) return { ok: false, error: result.error ?? "No data returned" };

  const products = result.data.result ?? [];
  const now = Date.now();

  const expiryDates = new Set<string>();
  for (const p of products) {
    const isOption = p.contract_type === "call_options" || p.contract_type === "put_options";
    const isBtc = p.underlying_asset?.symbol === "BTC";
    const notExpired = p.state !== "expired";
    if (!isOption || !isBtc || !notExpired || !p.settlement_time) continue;

    const settlementMs = Date.parse(p.settlement_time);
    if (!Number.isFinite(settlementMs) || settlementMs <= now) continue;

    const d = new Date(settlementMs);
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const yyyy = d.getUTCFullYear();
    expiryDates.add(`${dd}-${mm}-${yyyy}`);
  }

  if (expiryDates.size === 0) {
    return { ok: false, error: "No live BTC option expiries found in the product catalog" };
  }

  const sorted = Array.from(expiryDates).sort((a, b) => {
    const [da, ma, ya] = a.split("-").map(Number);
    const [db, mb, yb] = b.split("-").map(Number);
    return Date.UTC(ya, ma - 1, da) - Date.UTC(yb, mb - 1, db);
  });

  return { ok: true, data: sorted };
}

interface RawTicker {
  symbol?: string;
  contract_type?: string;
  strike_price?: string | number;
  mark_price?: string | number;
  close_price?: string | number;
  spot_price?: string | number;
  quotes?: { best_bid?: string | number; best_ask?: string | number };
  greeks?: { delta?: string | number };
}

function toNumber(v: string | number | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeTicker(t: RawTicker): OptionContract | null {
  const strike = toNumber(t.strike_price);
  if (strike === undefined) return null;
  return {
    symbol: t.symbol,
    strike,
    premium: toNumber(t.mark_price) ?? toNumber(t.close_price),
    spotPrice: toNumber(t.spot_price),
    bid: toNumber(t.quotes?.best_bid),
    ask: toNumber(t.quotes?.best_ask),
    delta: toNumber(t.greeks?.delta),
  };
}

/**
 * Fetches the BTC call+put option chain for one expiry (format
 * "DD-MM-YYYY", as returned by fetchBtcOptionExpiries).
 */
export async function fetchBtcOptionChain(expiryDateDDMMYYYY: string): Promise<ApiResult<OptionChain>> {
  const url = `${API_BASE}/v2/tickers?contract_types=call_options,put_options&underlying_asset_symbols=BTC&expiry_date=${expiryDateDDMMYYYY}`;
  const result = await fetchJson<{ result?: RawTicker[] }>(url);
  if (!result.ok || !result.data) return { ok: false, error: result.error ?? "No data returned" };

  const tickers = result.data.result ?? [];
  const calls: OptionContract[] = [];
  const puts: OptionContract[] = [];

  for (const t of tickers) {
    const normalized = normalizeTicker(t);
    if (!normalized) continue;
    if (t.contract_type === "call_options") calls.push(normalized);
    else if (t.contract_type === "put_options") puts.push(normalized);
  }

  if (calls.length === 0 && puts.length === 0) {
    return { ok: false, error: "Empty option chain returned for this expiry" };
  }

  calls.sort((a, b) => a.strike - b.strike);
  puts.sort((a, b) => a.strike - b.strike);

  return { ok: true, data: { calls, puts, fetchedAt: new Date() } };
}

/**
 * Best-effort live BTC index price, derived from spot_price fields
 * embedded in the option tickers themselves (Delta options tickers
 * commonly carry the underlying spot alongside the option's own quote).
 * Returns null if no ticker in the given chain carries a usable value —
 * callers should fall back to the manually entered index price in that
 * case rather than block on a dedicated index endpoint.
 */
export function extractLiveIndexPrice(chain: OptionChain): number | null {
  for (const c of [...chain.calls, ...chain.puts]) {
    if (c.spotPrice !== undefined && c.spotPrice > 0) return c.spotPrice;
  }
  return null;
}
