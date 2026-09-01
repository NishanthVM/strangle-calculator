import { useEffect, useMemo } from "react";
import { useOptionChain } from "../hooks/useOptionChain";
import { useLiveBtcIndex } from "../hooks/useLiveBtcIndex";
import { buildStrikeLadder, classifyStrike, findATMStrikes } from "../lib/optionChainClassification";
import { formatExpiryLabel, formatRelativeTime, formatUSD } from "../lib/format";

interface LotsStrikeSelectorProps {
  optionType: "call" | "put";
  strike: string;
  premium: string;
  btcIndexPrice: number;
  onStrikeChange: (strike: string) => void;
  onPremiumChange: (premium: string) => void;
  onLiveIndexChange: (price: number | null) => void;
}

/**
 * Same useOptionChain() hook Calculator 3/4 use — module-level cache
 * means this never triggers a duplicate fetch for an expiry another
 * calculator already has loaded.
 */
export function LotsStrikeSelector({
  optionType,
  strike,
  premium,
  btcIndexPrice,
  onStrikeChange,
  onPremiumChange,
  onLiveIndexChange,
}: LotsStrikeSelectorProps) {
  const { expiries, selectedExpiry, chain, loading, error, lastUpdated, setSelectedExpiry, refresh } =
    useOptionChain();
  const liveIndex = useLiveBtcIndex();

  const contracts = optionType === "call" ? chain?.calls ?? [] : chain?.puts ?? [];
  const strikes = useMemo(() => buildStrikeLadder(contracts.map((c) => c.strike)), [contracts]);
  const parsedStrike = parseFloat(strike);
  const selectedContract = contracts.find((c) => c.strike === parsedStrike);

  const combinedLadder = useMemo(() => {
    const callStrikes = (chain?.calls ?? []).map((c) => c.strike);
    const putStrikes = (chain?.puts ?? []).map((c) => c.strike);
    return buildStrikeLadder([...callStrikes, ...putStrikes]);
  }, [chain]);
  const atm = combinedLadder.length > 0 ? findATMStrikes(combinedLadder, btcIndexPrice) : null;
  const classification =
    atm && Number.isFinite(parsedStrike) ? classifyStrike(parsedStrike, combinedLadder, atm, optionType, btcIndexPrice) : null;

  useEffect(() => {
    if (selectedContract?.premium !== undefined) onPremiumChange(String(selectedContract.premium));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedContract?.premium]);

  useEffect(() => {
    onLiveIndexChange(liveIndex.price);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveIndex.price]);

  const strikeIsListed = strikes.includes(parsedStrike);

  return (
    <div className="rounded-lg border border-line dark:border-line-dark px-3 py-2.5 mb-3.5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted dark:text-ink-muted-dark">
          Live BTC Option
        </span>
        <span className="text-[10px] text-ink-faint dark:text-ink-faint-dark">
          {selectedExpiry ? formatExpiryLabel(selectedExpiry) : "—"} · {formatRelativeTime(lastUpdated)}
        </span>
      </div>

      {expiries.length > 1 && (
        <select
          value={selectedExpiry ?? ""}
          onChange={(e) => setSelectedExpiry(e.target.value)}
          className="w-full mb-2 text-[11px] rounded border border-line dark:border-line-dark bg-field dark:bg-field-dark px-2 py-1.5 text-ink dark:text-ink-dark"
        >
          {expiries.map((exp) => (
            <option key={exp.date} value={exp.date}>
              {formatExpiryLabel(exp.date)}
            </option>
          ))}
        </select>
      )}

      <div className="flex items-center justify-between mb-1">
        <span className="text-[12.5px] font-medium text-ink-muted dark:text-ink-muted-dark">Strike</span>
        {classification && (
          <span className="text-[10.5px] font-mono px-1.5 py-0.5 rounded border border-line dark:border-line-dark text-ink dark:text-ink-dark">
            {classification.label}
          </span>
        )}
      </div>
      {strikes.length > 0 ? (
        <select
          value={strike}
          onChange={(e) => onStrikeChange(e.target.value)}
          className="w-full rounded-md border border-line dark:border-line-dark bg-field dark:bg-field-dark px-2.5 py-2 text-[13px] font-mono text-ink dark:text-ink-dark mb-2"
        >
          <option value={strike} disabled hidden={strikeIsListed}>
            {strike} (manual)
          </option>
          {strikes.map((s) => (
            <option key={s} value={s}>
              {formatUSD(s, 0)}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          inputMode="decimal"
          value={strike}
          onChange={(e) => onStrikeChange(e.target.value)}
          placeholder="Strike ($)"
          className="w-full rounded-md border border-line dark:border-line-dark bg-field dark:bg-field-dark px-2.5 py-2 text-[13px] font-mono text-ink dark:text-ink-dark mb-2"
        />
      )}
      {!strikeIsListed && strikes.length > 0 && (
        <p className="text-[10px] text-warn-text dark:text-warn-text-dark mb-2">Strike unavailable for selected expiry.</p>
      )}

      <div className="flex items-center justify-between mb-1">
        <span className="text-[12.5px] font-medium text-ink-muted dark:text-ink-muted-dark">Premium ($)</span>
        <span className="text-[10px] text-ink-faint dark:text-ink-faint-dark">
          {selectedContract?.premium !== undefined ? "LIVE" : "MANUAL"}
        </span>
      </div>
      <input
        type="text"
        inputMode="decimal"
        value={premium}
        onChange={(e) => onPremiumChange(e.target.value)}
        className="w-full rounded-md border border-line dark:border-line-dark bg-field dark:bg-field-dark px-2.5 py-2 text-[13px] font-mono text-ink dark:text-ink-dark"
      />

      <div className="flex justify-end mt-2">
        <button
          onClick={refresh}
          disabled={loading}
          className="text-[10px] text-ink-faint dark:text-ink-faint-dark underline disabled:opacity-50"
        >
          Refresh
        </button>
      </div>
      {error && (
        <p className="text-[10px] text-warn-text dark:text-warn-text-dark mt-1">
          Live data unavailable — manual entry enabled.
        </p>
      )}
    </div>
  );
}
