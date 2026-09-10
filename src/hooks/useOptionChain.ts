import { useCallback, useEffect, useRef, useState } from "react";
import { fetchBtcOptionChain, fetchBtcOptionExpiries, type ExpiryInfo, type OptionChain } from "../lib/deltaApi";

const AUTO_REFRESH_MS = 30000;

/**
 * Module-level cache, keyed by `${environment}:${expiry}`, so switching
 * expiries back and forth doesn't force a redundant refetch, AND so
 * production and testnet data — which describe entirely different
 * product catalogs with different product_ids — never get mixed under
 * the same key.
 */
const chainCache = new Map<string, OptionChain>();

export interface UseOptionChainState {
  expiries: ExpiryInfo[];
  selectedExpiry: string | null;
  /** Precise settlement timestamp of the currently selected expiry, if known. */
  selectedExpirySettlementMs: number | null;
  chain: OptionChain | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  setSelectedExpiry: (expiry: string) => void;
  refresh: () => void;
}

/**
 * @param useTestnet Defaults to false (production) — every existing
 * calculator calling useOptionChain() with no argument is completely
 * unaffected by this parameter's existence. Only the Live Trade
 * Execution page passes `environment === "demo"` here, so its option
 * chain (and the product_ids it hands to order placement) actually
 * comes from the same environment the order itself will be sent to —
 * production and testnet are separate product catalogs with different
 * product_ids for what looks like "the same" contract.
 */
export function useOptionChain(useTestnet = false): UseOptionChainState {
  const [expiries, setExpiries] = useState<ExpiryInfo[]>([]);
  const [selectedExpiry, setSelectedExpiryState] = useState<string | null>(null);
  const [chain, setChain] = useState<OptionChain | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const inFlightRef = useRef(false);
  const cacheKey = useCallback((expiry: string) => `${useTestnet ? "testnet" : "prod"}:${expiry}`, [useTestnet]);

  const loadChainFor = useCallback(
    async (expiry: string, forceRefresh: boolean) => {
      if (inFlightRef.current) return; // don't overlap requests
      const key = cacheKey(expiry);
      if (!forceRefresh && chainCache.has(key)) {
        const cached = chainCache.get(key)!;
        setChain(cached);
        setLastUpdated(cached.fetchedAt);
        setError(null);
        return;
      }

      inFlightRef.current = true;
      setLoading(true);
      const result = await fetchBtcOptionChain(expiry, useTestnet);
      inFlightRef.current = false;
      setLoading(false);

      if (result.ok && result.data) {
        chainCache.set(key, result.data);
        setChain(result.data);
        setLastUpdated(result.data.fetchedAt);
        setError(null);
      } else {
        setError(result.error ?? "Unable to fetch the Delta Exchange option chain. Using manual strike mode.");
      }
    },
    [useTestnet, cacheKey]
  );

  // Load expiries whenever the environment changes (production and testnet have
  // different expiries/products entirely), then auto-select the nearest and fetch its chain.
  useEffect(() => {
    let cancelled = false;
    setSelectedExpiryState(null);
    setChain(null);
    (async () => {
      const result = await fetchBtcOptionExpiries(useTestnet);
      if (cancelled) return;
      if (result.ok && result.data && result.data.length > 0) {
        setExpiries(result.data);
        setSelectedExpiryState(result.data[0].date);
      } else {
        setExpiries([]);
        setError(result.error ?? "Unable to fetch the Delta Exchange option chain. Using manual strike mode.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [useTestnet]);

  // Fetch the chain whenever the selected expiry changes.
  useEffect(() => {
    if (!selectedExpiry) return;
    loadChainFor(selectedExpiry, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedExpiry]);

  // Periodic auto-refresh, without hammering the API.
  useEffect(() => {
    if (!selectedExpiry) return;
    const interval = setInterval(() => {
      loadChainFor(selectedExpiry, true);
    }, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedExpiry]);

  const setSelectedExpiry = useCallback((expiry: string) => {
    setSelectedExpiryState(expiry);
  }, []);

  const refresh = useCallback(() => {
    if (selectedExpiry) loadChainFor(selectedExpiry, true);
  }, [selectedExpiry, loadChainFor]);

  const selectedExpirySettlementMs =
    expiries.find((e) => e.date === selectedExpiry)?.settlementMs ?? null;

  return {
    expiries,
    selectedExpiry,
    selectedExpirySettlementMs,
    chain,
    loading,
    error,
    lastUpdated,
    setSelectedExpiry,
    refresh,
  };
}
