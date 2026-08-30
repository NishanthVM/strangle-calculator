import { useEffect, useMemo } from "react";
import { useOptionChain } from "../hooks/useOptionChain";
import { buildStrikeLadder, classifyStrike, findATMStrikes } from "../lib/optionChainClassification";
import { formatExpiryLabel, formatRelativeTime, formatUSD } from "../lib/format";
import type { OptionAction, OptionType } from "../lib/optionPayoffEngine";

interface SpreadLegSelectorProps {
  legLabel: string;
  action: OptionAction;
  type: OptionType;
  strike: string;
  premium: string;
  btcIndexPrice: number;
  onActionChange: (action: OptionAction) => void;
  onTypeChange: (type: OptionType) => void;
  onStrikeChange: (strike: string) => void;
  onPremiumChange: (premium: string) => void;
}

/**
 * Reuses the SAME useOptionChain hook Calculator 3's OptionChainPanel
 * uses — the hook's module-level cache means two components selecting
 * the same expiry never trigger duplicate network requests.
 */
export function SpreadLegSelector({
  legLabel,
  action,
  type,
  strike,
  premium,
  btcIndexPrice,
  onActionChange,
  onTypeChange,
  onStrikeChange,
  onPremiumChange,
}: SpreadLegSelectorProps) {
  const { expiries, selectedExpiry, chain, loading, error, lastUpdated, setSelectedExpiry, refresh } =
    useOptionChain();

  const contracts = type === "call" ? chain?.calls ?? [] : chain?.puts ?? [];
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
    atm && Number.isFinite(parsedStrike) ? classifyStrike(parsedStrike, combinedLadder, atm, type, btcIndexPrice) : null;

  useEffect(() => {
    if (selectedContract?.premium !== undefined) {
      onPremiumChange(String(selectedContract.premium));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedContract?.premium]);

  const strikeIsListed = strikes.includes(parsedStrike);

  return (
    <div className="rounded-lg border border-line dark:border-line-dark px-3 py-2.5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted dark:text-ink-muted-dark">
          {legLabel}
        </span>
        <span className="text-[10px] text-ink-faint dark:text-ink-faint-dark">
          {selectedExpiry ? formatExpiryLabel(selectedExpiry) : "—"} · {formatRelativeTime(lastUpdated)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <select
          value={action}
          onChange={(e) => onActionChange(e.target.value as OptionAction)}
          className="rounded-md border border-line dark:border-line-dark bg-field dark:bg-field-dark px-2 py-1.5 text-[12.5px] text-ink dark:text-ink-dark"
        >
          <option value="buy">BUY</option>
          <option value="sell">SELL</option>
        </select>
        <select
          value={type}
          onChange={(e) => onTypeChange(e.target.value as OptionType)}
          className="rounded-md border border-line dark:border-line-dark bg-field dark:bg-field-dark px-2 py-1.5 text-[12.5px] text-ink dark:text-ink-dark"
        >
          <option value="call">CALL</option>
          <option value="put">PUT</option>
        </select>
      </div>

      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-ink-muted dark:text-ink-muted-dark">Strike</span>
        {classification && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-line dark:border-line-dark text-ink dark:text-ink-dark">
            {classification.label}
          </span>
        )}
      </div>
      {strikes.length > 0 ? (
        <select
          value={strike}
          onChange={(e) => onStrikeChange(e.target.value)}
          className="w-full rounded-md border border-line dark:border-line-dark bg-field dark:bg-field-dark px-2.5 py-1.5 text-[12.5px] font-mono text-ink dark:text-ink-dark mb-2"
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
          className="w-full rounded-md border border-line dark:border-line-dark bg-field dark:bg-field-dark px-2.5 py-1.5 text-[12.5px] font-mono text-ink dark:text-ink-dark mb-2"
        />
      )}
      {!strikeIsListed && strikes.length > 0 && (
        <p className="text-[10px] text-warn-text dark:text-warn-text-dark mb-2">Strike unavailable for selected expiry.</p>
      )}

      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-ink-muted dark:text-ink-muted-dark">Premium ($)</span>
        <span className="text-[10px] text-ink-faint dark:text-ink-faint-dark">
          {selectedContract?.premium !== undefined ? "LIVE" : "MANUAL"}
        </span>
      </div>
      <input
        type="text"
        inputMode="decimal"
        value={premium}
        onChange={(e) => onPremiumChange(e.target.value)}
        className="w-full rounded-md border border-line dark:border-line-dark bg-field dark:bg-field-dark px-2.5 py-1.5 text-[12.5px] font-mono text-ink dark:text-ink-dark"
      />

      <div className="flex items-center justify-between mt-2">
        {expiries.length > 1 ? (
          <select
            value={selectedExpiry ?? ""}
            onChange={(e) => setSelectedExpiry(e.target.value)}
            className="text-[10px] rounded border border-line dark:border-line-dark bg-field dark:bg-field-dark px-1.5 py-1 text-ink-muted dark:text-ink-muted-dark"
          >
            {expiries.map((exp) => (
              <option key={exp.date} value={exp.date}>
                {formatExpiryLabel(exp.date)}
              </option>
            ))}
          </select>
        ) : (
          <span />
        )}
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
          Delta Exchange live data unavailable — manual entry enabled.
        </p>
      )}
    </div>
  );
}
