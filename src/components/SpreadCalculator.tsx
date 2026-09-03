import { useEffect, useState } from "react";
import { CardShell } from "./CardShell";
import { NumberField } from "./NumberField";
import { ResultRow } from "./ResultRow";
import { ErrorBanner } from "./ErrorBanner";
import { SpreadLegSelector } from "./SpreadLegSelector";
import { runSpreadCalculator } from "../lib/spreadCalculations";
import { useLiveBtcIndex } from "../hooks/useLiveBtcIndex";
import { formatINR, formatNumber, formatUSD } from "../lib/format";
import type { OptionAction, OptionType } from "../lib/optionPayoffEngine";
import type { SpreadCalculatorInputs, SpreadLegInputs } from "../types";

const DEFAULTS: SpreadCalculatorInputs = {
  capital: "100000",
  riskPct: "1",
  usdInr: "85",
  contractSize: "0.001",
  btcIndexPrice: "100000",
  leg1: { action: "buy", type: "call", strike: "100000", premium: "1000" },
  leg2: { action: "sell", type: "call", strike: "105000", premium: "600" },
  rewardMultiple: "2",
  margin: "10",
  exchangeMinLeverage: "1",
  feeRatePct: "0.01",
  premiumCapPct: "3.5",
  gstPct: "18",
};

export function SpreadCalculator() {
  const [inputs, setInputs] = useState<SpreadCalculatorInputs>(DEFAULTS);
  const [btcIndexOverridden, setBtcIndexOverridden] = useState(false);
  const liveIndex = useLiveBtcIndex();

  const setField = (key: keyof Omit<SpreadCalculatorInputs, "leg1" | "leg2">) => (value: string) =>
    setInputs((current) => ({ ...current, [key]: value }));

  const setBtcIndexManually = (value: string) => {
    setBtcIndexOverridden(true);
    setField("btcIndexPrice")(value);
  };

  useEffect(() => {
    if (liveIndex.price !== null && !btcIndexOverridden) {
      setField("btcIndexPrice")(String(liveIndex.price));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveIndex.price, btcIndexOverridden]);

  const setLegField =
    (legKey: "leg1" | "leg2") =>
    <K extends keyof SpreadLegInputs>(field: K) =>
    (value: SpreadLegInputs[K]) =>
      setInputs((current) => ({ ...current, [legKey]: { ...current[legKey], [field]: value } }));

  const result = runSpreadCalculator({
    capital: parseFloat(inputs.capital),
    riskPct: parseFloat(inputs.riskPct),
    usdInr: parseFloat(inputs.usdInr),
    contractSize: parseFloat(inputs.contractSize),
    btcIndexPriceUSD: parseFloat(inputs.btcIndexPrice),
    leg1: {
      action: inputs.leg1.action,
      type: inputs.leg1.type,
      strike: parseFloat(inputs.leg1.strike),
      premiumUSD: parseFloat(inputs.leg1.premium),
    },
    leg2: {
      action: inputs.leg2.action,
      type: inputs.leg2.type,
      strike: parseFloat(inputs.leg2.strike),
      premiumUSD: parseFloat(inputs.leg2.premium),
    },
    rewardMultiple: parseFloat(inputs.rewardMultiple),
    marginUSD: parseFloat(inputs.margin),
    exchangeMinLeverage: parseFloat(inputs.exchangeMinLeverage),
    feeRatePct: parseFloat(inputs.feeRatePct),
    premiumCapPct: parseFloat(inputs.premiumCapPct),
    gstPct: parseFloat(inputs.gstPct),
  });

  return (
    <CardShell
      title="Defined-Risk Option Spread Calculator"
      subtitle="Bull Call / Bear Put / Bull Put / Bear Call spreads, or any custom two-leg combination — risk comes from the actual capped payoff, not a stop-loss %"
      onReset={() => {
        setInputs(DEFAULTS);
        setBtcIndexOverridden(false);
      }}
      fullWidth
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3.5">
            <SpreadLegSelector
              legLabel="Leg 1"
              action={inputs.leg1.action}
              type={inputs.leg1.type}
              strike={inputs.leg1.strike}
              premium={inputs.leg1.premium}
              btcIndexPrice={parseFloat(inputs.btcIndexPrice)}
              onActionChange={(v: OptionAction) => setLegField("leg1")("action")(v)}
              onTypeChange={(v: OptionType) => setLegField("leg1")("type")(v)}
              onStrikeChange={setLegField("leg1")("strike")}
              onPremiumChange={setLegField("leg1")("premium")}
            />
            <SpreadLegSelector
              legLabel="Leg 2"
              action={inputs.leg2.action}
              type={inputs.leg2.type}
              strike={inputs.leg2.strike}
              premium={inputs.leg2.premium}
              btcIndexPrice={parseFloat(inputs.btcIndexPrice)}
              onActionChange={(v: OptionAction) => setLegField("leg2")("action")(v)}
              onTypeChange={(v: OptionType) => setLegField("leg2")("type")(v)}
              onStrikeChange={setLegField("leg2")("strike")}
              onPremiumChange={setLegField("leg2")("premium")}
            />
          </div>

          <NumberField label="Capital" unit="₹" value={inputs.capital} onChange={setField("capital")} />
          <NumberField label="Total Risk" unit="%" value={inputs.riskPct} onChange={setField("riskPct")} />
          <NumberField label="USD / INR" unit="" value={inputs.usdInr} onChange={setField("usdInr")} />
          <NumberField
            label="Contract Size"
            unit="BTC"
            value={inputs.contractSize}
            onChange={setField("contractSize")}
          />
          <NumberField
            label="BTC Index Price"
            unit={btcIndexOverridden ? "$ — manual" : liveIndex.price !== null ? "$ — live, auto-synced" : "$ — manual"}
            value={inputs.btcIndexPrice}
            onChange={setBtcIndexManually}
          />
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
        </div>

        <div>
          {!result.ok ? (
            <ErrorBanner message={result.error} />
          ) : (
            <>
              <div className="rounded-lg border border-line dark:border-line-dark bg-result dark:bg-result-dark px-3.5 pt-3.5 pb-1.5">
                <ResultRow big label="Strategy" value={result.value.strategy} />
                <ResultRow
                  label={result.value.isNetDebit ? "Net Debit" : "Net Credit"}
                  value={formatUSD(result.value.netPremiumUSD)}
                />
                <ResultRow
                  label="Maximum Profit"
                  value={`${formatUSD(result.value.maxProfitUSD)} · ${formatINR(result.value.maxProfitINR)}`}
                  tone="profit"
                />
                <ResultRow
                  label="Maximum Loss"
                  value={`${formatUSD(result.value.maxLossUSD)} · ${formatINR(result.value.maxLossINR)}`}
                  tone="risk"
                />
                <ResultRow
                  label="Break-even"
                  value={
                    result.value.breakEvens.length > 0
                      ? result.value.breakEvens.map((b) => formatUSD(b, 0)).join(" / ")
                      : "None"
                  }
                />
                <ResultRow label="Maximum Spreads" value={formatNumber(result.value.maxSpreads)} />
              </div>

              <div className="rounded-lg border border-line dark:border-line-dark px-3.5 py-3 mt-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted dark:text-ink-muted-dark mb-2">
                  Risk : Reward
                </div>
                <ResultRow
                  label="Maximum Risk Budget"
                  value={`${formatINR(result.value.riskBudgetINR)} / ${formatUSD(result.value.riskBudgetUSD)}`}
                />
                <ResultRow label="Theoretical Risk : Reward" value={`1 : ${formatNumber(result.value.theoreticalRewardMultiple, 2)}`} />
                <ResultRow label="Target Risk : Reward" value={`1 : ${formatNumber(parseFloat(inputs.rewardMultiple), 2)}`} />
                <ResultRow
                  label="Target Profit"
                  value={`${formatUSD(result.value.targetProfitUSD)} · ${formatINR(result.value.targetProfitINR)}`}
                  tone={result.value.targetExceedsTheoretical ? "risk" : "profit"}
                />
                {result.value.targetExceedsTheoretical && (
                  <ErrorBanner message="WARNING: Target profit exceeds the theoretical maximum profit of this spread." />
                )}
              </div>

              <div className="rounded-lg border border-line dark:border-line-dark px-3.5 py-3 mt-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted dark:text-ink-muted-dark mb-2">
                  Margin &amp; Leverage — Estimated
                </div>
                <ResultRow label="Estimated Required Margin" value={formatUSD(result.value.estimatedRequiredMarginUSD)} />
                <ResultRow label="Margin Entered" value={formatUSD(result.value.marginUSD)} />
                <ResultRow label="Theoretical Required Leverage" value={`${formatNumber(result.value.theoreticalLeverage, 2)}×`} />
                <ResultRow label="Exchange Minimum" value={`${formatNumber(result.value.exchangeMinLeverage, 2)}×`} />
                <ResultRow big label="Minimum Usable Leverage" value={`${formatNumber(result.value.minUsableLeverage, 2)}×`} />
                <p className="text-[10.5px] leading-snug text-ink-faint dark:text-ink-faint-dark mt-2">
                  Delta doesn't publish a distinct vertical-spread margin formula recognizing the defined-risk offset
                  between legs — this uses the spread's own maximum loss as a conservative estimated margin, not a
                  live exchange quote. Verify on Delta Exchange before trading.
                </p>
              </div>

              <details className="mt-3.5">
                <summary className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-ink-muted-dark cursor-pointer select-none">
                  Fee breakdown
                </summary>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div className="rounded-lg border border-line dark:border-line-dark px-3 py-2.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted dark:text-ink-muted-dark">
                      Leg 1 Fees
                    </span>
                    <div className="mt-1.5 font-mono text-xs text-ink dark:text-ink-dark space-y-0.5">
                      <div>Notional: {formatUSD(result.value.leg1FeeBreakdown.orderNotionalUSD)}</div>
                      <div>Premium Cap: {formatUSD(result.value.leg1FeeBreakdown.premiumCapUSD)}</div>
                      <div>Trading Fee: {formatUSD(result.value.leg1FeeBreakdown.tradingFeeUSD)}</div>
                      <div>Effective Fee: {formatUSD(result.value.leg1FeeBreakdown.effectiveFeeUSD)}</div>
                      <div>GST: {formatUSD(result.value.leg1FeeBreakdown.gstUSD)}</div>
                      <div>Total: {formatUSD(result.value.leg1FeeUSD)}</div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-line dark:border-line-dark px-3 py-2.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted dark:text-ink-muted-dark">
                      Leg 2 Fees
                    </span>
                    <div className="mt-1.5 font-mono text-xs text-ink dark:text-ink-dark space-y-0.5">
                      <div>Notional: {formatUSD(result.value.leg2FeeBreakdown.orderNotionalUSD)}</div>
                      <div>Premium Cap: {formatUSD(result.value.leg2FeeBreakdown.premiumCapUSD)}</div>
                      <div>Trading Fee: {formatUSD(result.value.leg2FeeBreakdown.tradingFeeUSD)}</div>
                      <div>Effective Fee: {formatUSD(result.value.leg2FeeBreakdown.effectiveFeeUSD)}</div>
                      <div>GST: {formatUSD(result.value.leg2FeeBreakdown.gstUSD)}</div>
                      <div>Total: {formatUSD(result.value.leg2FeeUSD)}</div>
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-ink-faint dark:text-ink-faint-dark mt-2">
                  Total Spread Fees: {formatUSD(result.value.totalFeesUSD)}
                </p>
              </details>

              <details className="mt-3.5">
                <summary className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-ink-muted-dark cursor-pointer select-none">
                  How this is calculated
                </summary>
                <ol className="text-[11px] leading-relaxed text-ink-faint dark:text-ink-faint-dark list-decimal pl-4 space-y-0.5 mt-2">
                  <li>Strategy is identified from each leg's action/type/strike — falls back to "Custom" if it doesn't match a standard vertical spread.</li>
                  <li>Maximum profit/loss come from a generic two-leg payoff engine, not a stop-loss/take-profit %.</li>
                  <li>Delta Exchange fees are calculated for both legs and included in both risk and profit figures.</li>
                  <li>Capital and Risk % determine the maximum number of spreads — margin never affects this.</li>
                  <li>Margin is used only afterward, to compute leverage against the combined position notional.</li>
                  <li>Your Risk:Reward target sets a desired profit; if it exceeds the spread's theoretical maximum, you'll see a warning rather than an impossible number.</li>
                </ol>
              </details>
            </>
          )}
        </div>
      </div>
    </CardShell>
  );
}
