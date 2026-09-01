import { useMemo } from "react";
import { useOptionChain } from "./useOptionChain";
import { extractLiveIndexPrice } from "../lib/deltaApi";

export interface LiveBtcIndex {
  price: number | null;
  lastUpdated: Date | null;
  error: string | null;
  loading: boolean;
}

/**
 * The one shared derivation of "the live BTC index" — every calculator
 * that wants a live index value should call this hook rather than
 * deriving it independently. It's built directly on useOptionChain(),
 * which already de-duplicates network requests for the same expiry via
 * its module-level cache — so multiple calculators calling this hook
 * simultaneously never trigger extra API calls, and they all see
 * exactly the same number, sourced from exactly the same fetch.
 */
export function useLiveBtcIndex(): LiveBtcIndex {
  const { chain, lastUpdated, error, loading } = useOptionChain();

  const price = useMemo(() => (chain ? extractLiveIndexPrice(chain) : null), [chain]);

  return { price, lastUpdated, error, loading };
}
