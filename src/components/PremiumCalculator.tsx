import { useState } from "react";
import { CardShell } from "./CardShell";
import { NumberField } from "./NumberField";
import { ResultRow } from "./ResultRow";
import { ErrorBanner } from "./ErrorBanner";
import { LotsStrikeSelector } from "./LotsStrikeSelector";
import { runLotsTradeCalculator } from "../lib/lotsTradeCalculations";
import { formatINR, formatNumber, formatUSD } from "../lib/format";
import type { LotsTradeCalculatorInputs, TradeAction } from "../types";

const DEFAULTS: LotsTradeCalculatorInputs = {
  tradeMode: "sell",
  optionType: "call",
  capital: "100000",
  riskPct: "1",
  strike: "100000",
  premium: "25",
  stopLossPct: "400",
  takeProfitPct: "90",
  usdInr: "85",
  contractSize: "0.001",
  btcIndexPrice: "100000",
  feeRatePct: "0.01",
  premiumCapPct: "3.5",
  gstPct: "18",
  rewardMultiple: "2",
  margin: "10",
  exchangeMinLeverage: "1",
};

export function PremiumCalculator() {
  const [inputs, setInputs] = useState<LotsTradeCalculatorInputs>(DEFAULTS);
  const [btcIndexOverridden, setBtcIndexOverridden] = useState(false);
  const [liveIndex, setLiveIndex] = useState<number | null>(null);

  const setField = (key: keyof LotsTradeCalculatorInputs) => (value: string) =>
    setInputs((current) => ({ ...current, [key]: value }));

  const setBtcIndexManually = (value: string) => {
    setBtcIndexOverridden(true);
    setField("btcIndexPrice")(value);
  };

  const handleLiveIndexChange = (price: number | null) => {
    setLiveIndex(price);
    if (price !== null && !btcIndexOverridden) {
      setField("btcIndexPrice")(String(price));
    }
  };

  const effectiveBtcIndex = parseFloat(inputs.btcIndexPrice);

  const result = runLotsTradeCalculator({
    tradeMode: inputs.tradeMode,
    capital: parseFloat(inputs.capital),
    riskPct: parseFloat(inputs.riskPct),
    premiumUSD: parseFloat(inputs.premium),
    stopLossPct: parseFloat(inputs.stopLossPct),
    takeProfitPct: parseFloat(inputs.takeProfitPct),
    usdInr: parseFloat(inputs.usdInr),
    contractSize: parseFloat(inputs.contractSize),
    btcIndexPriceUSD: effectiveBtcIndex,
    feeRatePct: parseFloat(inputs.feeRatePct),
    premiumCapPct: parseFloat(inputs.premiumCapPct),
    gstPct: parseFloat(inputs.gstPct),
    rewardMultiple: parseFloat(inputs.rewardMultiple),
    marginUSD: parseFloat(inputs.margin),
    exchangeMinLeverage: parseFloat(inputs.exchangeMinLeverage),
  });

  return (
    <CardShell
      title="Premium Calculator"
      subtitle="BUY or SELL, CALL or PUT — live from Delta Exchange's option chain"
      onReset={() => {
        setInputs(DEFAULTS);
        setBtcIndexOverridden(false);
      }}
    >
      <div className="grid grid-cols-2 gap-2 mb-3">
        <select
          value={inputs.tradeMode}
          onChange={(e) => setField("tradeMode")(e.target.value as TradeAction)}
          className="rounded-md border border-line dark:border-line-dark bg-field dark:bg-field-dark px-2.5 py-2 text-[13px] text-ink dark:text-ink-dark"
        >
          <option value="buy">BUY</option>
          <option value="sell">SELL</option>
        </select>
        <select
          value={inputs.optionType}
          onChange={(e) => setField("optionType")(e.target.value as "call" | "put")}
          className="rounded-md border border-line dark:border-line-dark bg-field dark:bg-field-dark px-2.5 py-2 text-[13px] text-ink dark:text-ink-dark"
        >
          <option value="call">CALL</option>
          <option value="put">PUT</option>
        </select>
      </div>

      <LotsStrikeSelector
        optionType={inputs.optionType}
        strike={inputs.strike}
        premium={inputs.premium}
        btcIndexPrice={effectiveBtcIndex}
        onStrikeChange={setField("strike")}
        onPremiumChange={setField("premium")}
        onLiveIndexChange={handleLiveIndexChange}
      />

      <NumberField
        label="BTC Index Price"
        unit={btcIndexOverridden ? "$ — manual" : liveIndex !== null ? "$ — live, auto-synced" : "$ — manual"}
        value={inputs.btcIndexPrice}
        onChange={setBtcIndexManually}
      />
      {btcIndexOverridden && liveIndex !== null && (
        <button
          onClick={() => {
            setBtcIndexOverridden(false);
            setField("btcIndexPrice")(String(liveIndex));
          }}
          className="text-[10px] text-ink-faint dark:text-ink-faint-dark underline -mt-2 mb-2"
        >
          Resume live sync ({formatUSD(liveIndex, 0)})
        </button>
      )}
      <NumberField label="Capital" unit="₹" value={inputs.capital} onChange={setField("capital")} />
      <NumberField label="Risk" unit="%" value={inputs.riskPct} onChange={setField("riskPct")} />
      {inputs.tradeMode === "sell" && (
        <>
          <NumberField label="Stop Loss" unit="%" value={inputs.stopLossPct} onChange={setField("stopLossPct")} />
          <NumberField label="Take Profit" unit="%" value={inputs.takeProfitPct} onChange={setField("takeProfitPct")} />
        </>
      )}
      <NumberField label="USD / INR" unit="" value={inputs.usdInr} onChange={setField("usdInr")} />
      <NumberField label="Contract Size" unit="BTC" value={inputs.contractSize} onChange={setField("contractSize")} />
      <NumberField
        label="Delta Exchange Fee Rate"
        unit="% — estimate"
        value={inputs.feeRatePct}
        onChange={setField("feeRatePct")}
      />
      <NumberField
        label="Premium Cap"
        unit="% — estimate"
        value={inputs.premiumCapPct}
        onChange={setField("premiumCapPct")}
      />
      <NumberField label="GST" unit="% — estimate" value={inputs.gstPct} onChange={setField("gstPct")} />
      <NumberField
        label="Risk : Reward Target"
        unit="→ 1 : X"
        value={inputs.rewardMultiple}
        onChange={setField("rewardMultiple")}
      />
      <NumberField
        label="Margin Available / Required"
        unit="$ — independent of capital"
        value={inputs.margin}
        onChange={setField("margin")}
      />
      <NumberField
        label="Exchange Minimum Leverage"
        unit="×"
        value={inputs.exchangeMinLeverage}
        onChange={setField("exchangeMinLeverage")}
      />

      {!result.ok ? (
        <ErrorBanner message={result.error} />
      ) : (
        <>
          <div className="rounded-lg border border-line dark:border-line-dark bg-result dark:bg-result-dark px-3.5 pt-3.5 pb-1.5 mt-1.5">
            <ResultRow big label="Maximum Lots" value={formatNumber(result.value.maxContracts)} />
            <ResultRow label="Premium" value={formatUSD(result.value.premiumUSD)} />
            <ResultRow label="Position Notional" value={formatUSD(result.value.positionNotionalUSD)} />
            {result.value.optionCostUSD !== null && (
              <ResultRow label="Option Cost" value={formatUSD(result.value.optionCostUSD)} />
            )}
            <ResultRow
              label="Total Fees"
              value={`${formatUSD(result.value.totalFeesUSD)} · ${formatINR(result.value.totalFeesINR)}`}
            />
          </div>

          <div className="rounded-lg border border-line dark:border-line-dark px-3.5 py-3 mt-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted dark:text-ink-muted-dark mb-2">
              Risk : Reward
            </div>
            <ResultRow
              label="Risk Budget"
              value={`${formatINR(result.value.riskBudgetINR)} / ${formatUSD(result.value.riskBudgetUSD)}`}
            />
            <ResultRow
              label="Calculated Risk"
              value={`${formatUSD(result.value.calculatedRiskUSD)} · ${formatINR(result.value.calculatedRiskINR)}`}
              tone="risk"
            />
            {result.value.theoreticalMaxProfitUSD !== null ? (
              <ResultRow
                label="Theoretical Max Profit"
                value={`${formatUSD(result.value.theoreticalMaxProfitUSD)} · ${formatINR(result.value.theoreticalMaxProfitINR ?? 0)}`}
                tone="profit"
              />
            ) : (
              <ResultRow label="Profit Potential" value="Uncapped (long option)" tone="profit" />
            )}
            <ResultRow
              label={result.value.theoreticalMaxProfitUSD !== null ? "Target Profit" : "RR-Based Target Profit"}
              value={`${formatUSD(result.value.targetProfitUSD)} · ${formatINR(result.value.targetProfitINR)}`}
              tone={result.value.targetExceedsTheoretical ? "risk" : "profit"}
            />
            <ResultRow label="Risk : Reward" value={`1 : ${formatNumber(parseFloat(inputs.rewardMultiple), 2)}`} />
            {result.value.targetExceedsTheoretical && (
              <ErrorBanner message="WARNING: Target profit exceeds the theoretical maximum profit of this trade." />
            )}
          </div>

          <div className="rounded-lg border border-line dark:border-line-dark px-3.5 py-3 mt-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted dark:text-ink-muted-dark mb-2">
              Margin &amp; Leverage — Estimated
            </div>
            <ResultRow label="Margin Entered" value={formatUSD(result.value.marginUSD)} />
            <ResultRow label="Theoretical Required Leverage" value={`${formatNumber(result.value.theoreticalLeverage, 2)}×`} />
            <ResultRow label="Exchange Minimum" value={`${formatNumber(result.value.exchangeMinLeverage, 2)}×`} />
            <ResultRow big label="Minimum Usable Leverage" value={`${formatNumber(result.value.minUsableLeverage, 2)}×`} />
            <p className="text-[10.5px] leading-snug text-ink-faint dark:text-ink-faint-dark mt-2">
              This is the bare minimum leverage needed to carry the calculated position with your entered margin —
              not the maximum leverage Delta Exchange allows. Margin never affects the lot calculation above.
            </p>
          </div>

          <details className="mt-3.5">
            <summary className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-ink-muted-dark cursor-pointer select-none">
              Fee breakdown
            </summary>
            <div className="mt-2 font-mono text-xs text-ink dark:text-ink-dark space-y-0.5">
              <div>Option Premium: {formatUSD(result.value.feeBreakdown.optionPremiumUSD)}</div>
              <div>Order Notional: {formatUSD(result.value.feeBreakdown.orderNotionalUSD)}</div>
              <div>3.5% Premium Cap: {formatUSD(result.value.feeBreakdown.premiumCapUSD)}</div>
              <div>Trading Fee: {formatUSD(result.value.feeBreakdown.tradingFeeUSD)}</div>
              <div>Effective Trading Fee: {formatUSD(result.value.feeBreakdown.effectiveFeeUSD)}</div>
              <div>GST: {formatUSD(result.value.feeBreakdown.gstUSD)}</div>
              <div className="font-semibold">Total Fee: {formatUSD(result.value.feeBreakdown.totalFeeUSD)}</div>
            </div>
          </details>
        </>
      )}
    </CardShell>
  );
}
