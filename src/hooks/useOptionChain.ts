import { useCallback, useEffect, useRef, useState } from "react";
import { fetchBtcOptionChain, fetchBtcOptionExpiries, type OptionChain } from "../lib/deltaApi";

const AUTO_REFRESH_MS = 30000;

/**
 * Module-level cache, keyed by expiry, so switching expiries back and
 * forth (or remounting this hook's owning component, e.g. on the
 * calculator's Reset) doesn't force a redundant refetch of data we
 * already have. Cleared only by an explicit refresh.
 */
const chainCache = new Map<string, OptionChain>();

export interface UseOptionChainState {
  expiries: string[];
  selectedExpiry: string | null;
  chain: OptionChain | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  setSelectedExpiry: (expiry: string) => void;
  refresh: () => void;
}

export function useOptionChain(): UseOptionChainState {
  const [expiries, setExpiries] = useState<string[]>([]);
  const [selectedExpiry, setSelectedExpiryState] = useState<string | null>(null);
  const [chain, setChain] = useState<OptionChain | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const inFlightRef = useRef(false);

  const loadChainFor = useCallback(async (expiry: string, forceRefresh: boolean) => {
    if (inFlightRef.current) return; // don't overlap requests
    if (!forceRefresh && chainCache.has(expiry)) {
      const cached = chainCache.get(expiry)!;
      setChain(cached);
      setLastUpdated(cached.fetchedAt);
      setError(null);
      return;
    }

    inFlightRef.current = true;
    setLoading(true);
    const result = await fetchBtcOptionChain(expiry);
    inFlightRef.current = false;
    setLoading(false);

    if (result.ok && result.data) {
      chainCache.set(expiry, result.data);
      setChain(result.data);
      setLastUpdated(result.data.fetchedAt);
      setError(null);
    } else {
      setError(result.error ?? "Unable to fetch the Delta Exchange option chain. Using manual strike mode.");
    }
  }, []);

  // Load expiries once on mount, then auto-select the nearest and fetch its chain.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchBtcOptionExpiries();
      if (cancelled) return;
      if (result.ok && result.data && result.data.length > 0) {
        setExpiries(result.data);
        setSelectedExpiryState((current) => current ?? result.data![0]);
      } else {
        setError(result.error ?? "Unable to fetch the Delta Exchange option chain. Using manual strike mode.");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return { expiries, selectedExpiry, chain, loading, error, lastUpdated, setSelectedExpiry, refresh };
}
