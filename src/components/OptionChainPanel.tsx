import { useEffect, useMemo, useState } from "react";
import { Info, RotateCw } from "lucide-react";
import { useOptionChain } from "../hooks/useOptionChain";
import { buildStrikeLadder, classifyStrike, findATMStrikes, type OptionSide } from "../lib/optionChainClassification";
import { extractLiveIndexPrice, type OptionChain, type OptionContract } from "../lib/deltaApi";
import { formatExpiryLabel, formatNumber, formatRelativeTime, formatUSD } from "../lib/format";

interface OptionChainPanelProps {
  manualBtcIndexPrice: number;
  callStrike: string;
  putStrike: string;
  onSelectCallStrike: (strike: string) => void;
  onSelectPutStrike: (strike: string) => void;
  onUseLiveIndex: (price: number) => void;
  onUseLiveCallPremium: (premium: number) => void;
  onUseLivePutPremium: (premium: number) => void;
  /** Fired whenever the selected CALL/PUT contract's live implied volatility is known/changes (independent of the premium toggle — IV is a market observable, not a user override). */
  onCallIvChange: (ivPct: number | null) => void;
  onPutIvChange: (ivPct: number | null) => void;
  /** Fired whenever the selected expiry's precise settlement timestamp is known/changes. */
  onExpiryInfoChange: (settlementMs: number | null) => void;
  /** Fired whenever the full fetched chain changes (new data, new expiry, or cleared) — lets the parent run its own logic (e.g. premium matching) against the same data without a second fetch. */
  onChainDataChange: (chain: OptionChain | null) => void;
  /** Bumped by the parent's Reset button — resets this panel's own toggles without discarding the cached chain. */
  resetSignal: number;
}

function findContractForStrike(contracts: OptionContract[], strike: number): OptionContract | undefined {
  return contracts.find((c) => c.strike === strike);
}

export function OptionChainPanel({
  manualBtcIndexPrice,
  callStrike,
  putStrike,
  onSelectCallStrike,
  onSelectPutStrike,
  onUseLiveIndex,
  onUseLiveCallPremium,
  onUseLivePutPremium,
  onCallIvChange,
  onPutIvChange,
  onExpiryInfoChange,
  onChainDataChange,
  resetSignal,
}: OptionChainPanelProps) {
  const {
    expiries,
    selectedExpiry,
    selectedExpirySettlementMs,
    chain,
    loading,
    error,
    lastUpdated,
    setSelectedExpiry,
    refresh,
  } = useOptionChain();

  useEffect(() => {
    onChainDataChange(chain);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain]);

  const [useLiveIndex, setUseLiveIndex] = useState(false);
  const [useLiveCallPremium, setUseLiveCallPremium] = useState(false);
  const [useLivePutPremium, setUseLivePutPremium] = useState(false);
  const [chainTableOpen, setChainTableOpen] = useState(false);

  // Reset only this panel's toggle state and expiry selection — never touches the cached chain data.
  useEffect(() => {
    setUseLiveIndex(false);
    setUseLiveCallPremium(false);
    setUseLivePutPremium(false);
    setChainTableOpen(false);
    if (expiries.length > 0) setSelectedExpiry(expiries[0].date); // nearest/current expiry
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  const liveIndexPrice = chain ? extractLiveIndexPrice(chain) : null;
  const effectiveIndexPrice = useLiveIndex && liveIndexPrice !== null ? liveIndexPrice : manualBtcIndexPrice;

  useEffect(() => {
    onExpiryInfoChange(selectedExpirySettlementMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedExpirySettlementMs]);

  // Push the live index up to the parent whenever it's enabled and a fresh value is available.
  useEffect(() => {
    if (useLiveIndex && liveIndexPrice !== null) onUseLiveIndex(liveIndexPrice);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useLiveIndex, liveIndexPrice]);

  const callStrikes = useMemo(() => buildStrikeLadder((chain?.calls ?? []).map((c) => c.strike)), [chain]);
  const putStrikes = useMemo(() => buildStrikeLadder((chain?.puts ?? []).map((c) => c.strike)), [chain]);
  // Per the spec, CALL and PUT share the same underlying strike ladder for ranking purposes.
  const combinedLadder = useMemo(() => buildStrikeLadder([...callStrikes, ...putStrikes]), [callStrikes, putStrikes]);

  const atm = useMemo(
    () => (combinedLadder.length > 0 ? findATMStrikes(combinedLadder, effectiveIndexPrice) : null),
    [combinedLadder, effectiveIndexPrice]
  );

  const parsedCallStrike = parseFloat(callStrike);
  const parsedPutStrike = parseFloat(putStrike);

  const callClassification =
    atm && Number.isFinite(parsedCallStrike)
      ? classifyStrike(parsedCallStrike, combinedLadder, atm, "call" as OptionSide, effectiveIndexPrice)
      : null;
  const putClassification =
    atm && Number.isFinite(parsedPutStrike)
      ? classifyStrike(parsedPutStrike, combinedLadder, atm, "put" as OptionSide, effectiveIndexPrice)
      : null;

  const selectedCallContract = chain && Number.isFinite(parsedCallStrike) ? findContractForStrike(chain.calls, parsedCallStrike) : undefined;
  const selectedPutContract = chain && Number.isFinite(parsedPutStrike) ? findContractForStrike(chain.puts, parsedPutStrike) : undefined;

  // Push live premiums up to the parent whenever enabled and the selected strike has a listed contract.
  useEffect(() => {
    if (useLiveCallPremium && selectedCallContract?.premium !== undefined) {
      onUseLiveCallPremium(selectedCallContract.premium);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useLiveCallPremium, selectedCallContract?.premium]);

  useEffect(() => {
    if (useLivePutPremium && selectedPutContract?.premium !== undefined) {
      onUseLivePutPremium(selectedPutContract.premium);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useLivePutPremium, selectedPutContract?.premium]);

  useEffect(() => {
    onCallIvChange(selectedCallContract?.markIvPct ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCallContract?.markIvPct]);

  useEffect(() => {
    onPutIvChange(selectedPutContract?.markIvPct ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPutContract?.markIvPct]);

  const hasChain = chain !== null && combinedLadder.length > 0;

  return (
    <div className="rounded-lg border border-line dark:border-line-dark px-3.5 py-3 mt-3.5">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Info size={12.5} className="text-ink-faint dark:text-ink-faint-dark" />
          <span className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-ink-muted-dark">
            BTC Option Chain
          </span>
        </div>
        <button
          onClick={refresh}
          disabled={loading || !selectedExpiry}
          className="flex items-center gap-1 text-[11px] text-ink-muted dark:text-ink-muted-dark border border-line dark:border-line-dark rounded-md px-2 py-1 disabled:opacity-50"
        >
          <RotateCw size={11} className={loading ? "animate-spin" : ""} />
          Refresh Chain
        </button>
      </div>

      {error && (
        <p className="text-[11px] leading-snug text-warn-text dark:text-warn-text-dark bg-warn-bg dark:bg-warn-bg-dark border border-warn-border dark:border-warn-border-dark rounded-md px-2.5 py-2 mb-2.5">
          Unable to fetch the Delta Exchange option chain. Using manual strike mode. ({error})
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[11px] text-ink-faint dark:text-ink-faint-dark mb-2.5">
        <div>
          Data Source: <span className="text-ink dark:text-ink-dark">Delta Exchange India</span>
        </div>
        <div>Last Updated: {formatRelativeTime(lastUpdated)}</div>
      </div>

      <label className="block mb-2.5">
        <span className="text-[12.5px] font-medium text-ink-muted dark:text-ink-muted-dark block mb-1">
          BTC Expiry
        </span>
        <select
          value={selectedExpiry ?? ""}
          onChange={(e) => setSelectedExpiry(e.target.value)}
          disabled={expiries.length === 0}
          className="w-full rounded-md border border-line dark:border-line-dark bg-field dark:bg-field-dark px-2.5 py-2 text-[13px] text-ink dark:text-ink-dark disabled:opacity-50"
        >
          {expiries.length === 0 && <option>Unavailable</option>}
          {expiries.map((exp) => (
            <option key={exp.date} value={exp.date}>
              {formatExpiryLabel(exp.date)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 mb-2.5 text-[12px] text-ink dark:text-ink-dark">
        <input
          type="checkbox"
          checked={useLiveIndex}
          onChange={(e) => setUseLiveIndex(e.target.checked)}
          disabled={liveIndexPrice === null}
        />
        Use Live BTC Index
        {liveIndexPrice !== null && (
          <span className="text-ink-faint dark:text-ink-faint-dark font-mono">({formatUSD(liveIndexPrice, 0)})</span>
        )}
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2.5">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12.5px] font-medium text-ink-muted dark:text-ink-muted-dark">CALL Strike</span>
            {callClassification && (
              <span className="text-[10.5px] font-mono px-1.5 py-0.5 rounded border border-line dark:border-line-dark text-ink dark:text-ink-dark">
                {callClassification.label}
              </span>
            )}
          </div>
          {callStrikes.length > 0 ? (
            <select
              value={callStrike}
              onChange={(e) => onSelectCallStrike(e.target.value)}
              className="w-full rounded-md border border-line dark:border-line-dark bg-field dark:bg-field-dark px-2.5 py-2 text-[13px] font-mono text-ink dark:text-ink-dark"
            >
              <option value={callStrike} disabled hidden={callStrikes.includes(parsedCallStrike)}>
                {callStrike} (manual)
              </option>
              {callStrikes.map((s) => (
                <option key={s} value={s}>
                  {formatUSD(s, 0)}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-[11px] text-ink-faint dark:text-ink-faint-dark">
              No live chain — enter the CALL Strike Price field above manually.
            </p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12.5px] font-medium text-ink-muted dark:text-ink-muted-dark">PUT Strike</span>
            {putClassification && (
              <span className="text-[10.5px] font-mono px-1.5 py-0.5 rounded border border-line dark:border-line-dark text-ink dark:text-ink-dark">
                {putClassification.label}
              </span>
            )}
          </div>
          {putStrikes.length > 0 ? (
            <select
              value={putStrike}
              onChange={(e) => onSelectPutStrike(e.target.value)}
              className="w-full rounded-md border border-line dark:border-line-dark bg-field dark:bg-field-dark px-2.5 py-2 text-[13px] font-mono text-ink dark:text-ink-dark"
            >
              <option value={putStrike} disabled hidden={putStrikes.includes(parsedPutStrike)}>
                {putStrike} (manual)
              </option>
              {putStrikes.map((s) => (
                <option key={s} value={s}>
                  {formatUSD(s, 0)}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-[11px] text-ink-faint dark:text-ink-faint-dark">
              No live chain — enter the PUT Strike Price field above manually.
            </p>
          )}
        </div>
      </div>

      {atm && (
        <div className="text-[11px] font-mono text-ink-faint dark:text-ink-faint-dark mb-2.5">
          BTC Index {formatUSD(effectiveIndexPrice, 0)} · ATM {formatUSD(atm.primaryStrike, 0)}
          {atm.isTie && ` / ${formatUSD(atm.tiedStrikes[1], 0)} (tied)`}
        </div>
      )}

      {hasChain && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-1">
          <div className="rounded-lg border border-line dark:border-line-dark px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted dark:text-ink-muted-dark">
                CALL
              </span>
              <label className="flex items-center gap-1 text-[10.5px] text-ink-faint dark:text-ink-faint-dark">
                <input
                  type="checkbox"
                  checked={useLiveCallPremium}
                  onChange={(e) => setUseLiveCallPremium(e.target.checked)}
                  disabled={selectedCallContract?.premium === undefined}
                />
                Use Live Premium
              </label>
            </div>
            <div className="mt-1.5 font-mono text-xs text-ink dark:text-ink-dark space-y-0.5">
              <div>Strike: {formatUSD(parsedCallStrike, 0)}</div>
              {callClassification && <div>Classification: {callClassification.label}</div>}
              {Number.isFinite(effectiveIndexPrice) && (
                <div>
                  Distance from Index:{" "}
                  {parsedCallStrike - effectiveIndexPrice >= 0 ? "+" : ""}
                  {formatUSD(parsedCallStrike - effectiveIndexPrice, 0)}
                </div>
              )}
              {selectedCallContract?.premium !== undefined && <div>Premium: {formatUSD(selectedCallContract.premium)}</div>}
              {selectedCallContract?.delta !== undefined && <div>Delta: {formatNumber(selectedCallContract.delta, 2)}</div>}
              {selectedCallContract?.bid !== undefined && <div>Bid: {formatUSD(selectedCallContract.bid)}</div>}
              {selectedCallContract?.ask !== undefined && <div>Ask: {formatUSD(selectedCallContract.ask)}</div>}
              {selectedCallContract?.symbol && <div>Symbol: {selectedCallContract.symbol}</div>}
              {!selectedCallContract && <div className="text-ink-faint dark:text-ink-faint-dark">Not listed on Delta for this expiry — manual strike.</div>}
            </div>
          </div>

          <div className="rounded-lg border border-line dark:border-line-dark px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted dark:text-ink-muted-dark">
                PUT
              </span>
              <label className="flex items-center gap-1 text-[10.5px] text-ink-faint dark:text-ink-faint-dark">
                <input
                  type="checkbox"
                  checked={useLivePutPremium}
                  onChange={(e) => setUseLivePutPremium(e.target.checked)}
                  disabled={selectedPutContract?.premium === undefined}
                />
                Use Live Premium
              </label>
            </div>
            <div className="mt-1.5 font-mono text-xs text-ink dark:text-ink-dark space-y-0.5">
              <div>Strike: {formatUSD(parsedPutStrike, 0)}</div>
              {putClassification && <div>Classification: {putClassification.label}</div>}
              {Number.isFinite(effectiveIndexPrice) && (
                <div>
                  Distance from Index:{" "}
                  {parsedPutStrike - effectiveIndexPrice >= 0 ? "+" : ""}
                  {formatUSD(parsedPutStrike - effectiveIndexPrice, 0)}
                </div>
              )}
              {selectedPutContract?.premium !== undefined && <div>Premium: {formatUSD(selectedPutContract.premium)}</div>}
              {selectedPutContract?.delta !== undefined && <div>Delta: {formatNumber(selectedPutContract.delta, 2)}</div>}
              {selectedPutContract?.bid !== undefined && <div>Bid: {formatUSD(selectedPutContract.bid)}</div>}
              {selectedPutContract?.ask !== undefined && <div>Ask: {formatUSD(selectedPutContract.ask)}</div>}
              {selectedPutContract?.symbol && <div>Symbol: {selectedPutContract.symbol}</div>}
              {!selectedPutContract && <div className="text-ink-faint dark:text-ink-faint-dark">Not listed on Delta for this expiry — manual strike.</div>}
            </div>
          </div>
        </div>
      )}

      {hasChain && (
        <details className="mt-2.5" open={chainTableOpen} onToggle={(e) => setChainTableOpen((e.target as HTMLDetailsElement).open)}>
          <summary className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-ink-muted-dark cursor-pointer select-none">
            View BTC Option Chain
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-[11px] font-mono border-collapse min-w-[560px]">
              <thead>
                <tr className="text-ink-faint dark:text-ink-faint-dark border-b border-line dark:border-line-dark">
                  <th className="text-left py-1 pr-2">Strike</th>
                  <th className="text-right py-1 pr-2">CALL</th>
                  <th className="text-left py-1 pr-2">Class</th>
                  <th className="text-right py-1 pr-2">PUT</th>
                  <th className="text-left py-1">Class</th>
                </tr>
              </thead>
              <tbody>
                {combinedLadder
                  .slice()
                  .reverse()
                  .map((strike) => {
                    const call = findContractForStrike(chain!.calls, strike);
                    const put = findContractForStrike(chain!.puts, strike);
                    const callClass = atm ? classifyStrike(strike, combinedLadder, atm, "call", effectiveIndexPrice) : null;
                    const putClass = atm ? classifyStrike(strike, combinedLadder, atm, "put", effectiveIndexPrice) : null;
                    const isAtmRow = atm?.tiedStrikes.includes(strike);
                    const isSelected = strike === parsedCallStrike || strike === parsedPutStrike;
                    return (
                      <tr
                        key={strike}
                        className={`border-b border-line dark:border-line-dark ${
                          isAtmRow ? "bg-result dark:bg-result-dark" : ""
                        } ${isSelected ? "text-accent dark:text-accent-dark" : "text-ink dark:text-ink-dark"}`}
                      >
                        <td className="py-1 pr-2">{formatUSD(strike, 0)}</td>
                        <td className="text-right py-1 pr-2">{call?.premium !== undefined ? formatUSD(call.premium) : "—"}</td>
                        <td className="py-1 pr-2 text-ink-faint dark:text-ink-faint-dark">{callClass?.label ?? "—"}</td>
                        <td className="text-right py-1 pr-2">{put?.premium !== undefined ? formatUSD(put.premium) : "—"}</td>
                        <td className="py-1 text-ink-faint dark:text-ink-faint-dark">{putClass?.label ?? "—"}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
