import { useMemo, useState } from "react";
import { Info } from "lucide-react";
import { CardShell } from "./CardShell";
import { NumberField } from "./NumberField";
import { ResultRow } from "./ResultRow";
import { ErrorBanner } from "./ErrorBanner";
import { OptionChainPanel } from "./OptionChainPanel";
import { runMinLeverageCalculator } from "../lib/minLeverageCalculations";
import { formatINR, formatNumber, formatUSD } from "../lib/format";
import type { MinLeverageCalculatorInputs } from "../types";

const DEFAULTS: MinLeverageCalculatorInputs = {
  capital: "100000",
  callPremium: "25",
  putPremium: "25",
  riskPct: "1",
  takeProfitPct: "90",
  stopLossPct: "400",
  usdInr: "85",
  margin: "10",
  contractSize: "0.001",
  btcIndexPrice: "100000",
  callStrike: "105000",
  putStrike: "95000",
  feeRatePct: "0.01",
  premiumCapPct: "3.5",
  gstPct: "18",
  exchangeMinLeverage: "16",
};

export function MinLeverageCalculator() {
  const [inputs, setInputs] = useState<MinLeverageCalculatorInputs>(DEFAULTS);
  const [panelResetSignal, setPanelResetSignal] = useState(0);

  const setField = (key: keyof MinLeverageCalculatorInputs) => (value: string) =>
    setInputs((current) => ({ ...current, [key]: value }));

  const result = useMemo(
    () =>
      runMinLeverageCalculator({
        capital: parseFloat(inputs.capital),
        callPremiumUSD: parseFloat(inputs.callPremium),
        putPremiumUSD: parseFloat(inputs.putPremium),
        riskPct: parseFloat(inputs.riskPct),
        takeProfitPct: parseFloat(inputs.takeProfitPct),
        stopLossPct: parseFloat(inputs.stopLossPct),
        usdInr: parseFloat(inputs.usdInr),
        marginUSD: parseFloat(inputs.margin),
        contractSize: parseFloat(inputs.contractSize),
        btcIndexPriceUSD: parseFloat(inputs.btcIndexPrice),
        callStrikeUSD: parseFloat(inputs.callStrike),
        putStrikeUSD: parseFloat(inputs.putStrike),
        feeRatePct: parseFloat(inputs.feeRatePct),
        premiumCapPct: parseFloat(inputs.premiumCapPct),
        gstPct: parseFloat(inputs.gstPct),
        exchangeMinLeverage: parseFloat(inputs.exchangeMinLeverage),
      }),
    [inputs]
  );

  return (
    <CardShell
      title="Minimum Leverage Calculator"
      subtitle="Combined two-leg strangle risk sizing, then leverage solved from Delta's margin formula — never below the exchange floor"
      onReset={() => {
        setInputs(DEFAULTS);
        setPanelResetSignal((s) => s + 1);
      }}
      fullWidth
    >
      <p className="text-[11px] leading-snug text-ink-faint dark:text-ink-faint-dark -mt-1 mb-3.5">
        Capital determines the maximum risk and therefore the maximum lots. Margin is independent of capital and is
        used only after the lot size has been calculated. Minimum leverage is solved from Delta Exchange's Approximate
        Initial Margin formula for both legs combined. The displayed usable leverage cannot be below the exchange's
        configured minimum leverage.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
        <div>
          <NumberField label="Capital" unit="₹" value={inputs.capital} onChange={setField("capital")} />
          <NumberField label="CALL Premium" unit="$" value={inputs.callPremium} onChange={setField("callPremium")} />
          <NumberField label="PUT Premium" unit="$" value={inputs.putPremium} onChange={setField("putPremium")} />
          <NumberField
            label="Total Risk"
            unit="% (combined strangle)"
            value={inputs.riskPct}
            onChange={setField("riskPct")}
          />
          <NumberField
            label="Total Take Profit"
            unit="%"
            value={inputs.takeProfitPct}
            onChange={setField("takeProfitPct")}
          />
          <NumberField label="Total Stop Loss" unit="%" value={inputs.stopLossPct} onChange={setField("stopLossPct")} />
          <NumberField label="USD / INR" unit="" value={inputs.usdInr} onChange={setField("usdInr")} />
          <NumberField
            label="Margin Available / Required"
            unit="$ — independent of capital"
            value={inputs.margin}
            onChange={setField("margin")}
          />
          <NumberField
            label="Contract Size"
            unit="BTC"
            value={inputs.contractSize}
            onChange={setField("contractSize")}
          />
          <NumberField
            label="BTC Index Price"
            unit="$"
            value={inputs.btcIndexPrice}
            onChange={setField("btcIndexPrice")}
          />
          <NumberField label="CALL Strike Price" unit="$" value={inputs.callStrike} onChange={setField("callStrike")} />
          <NumberField label="PUT Strike Price" unit="$" value={inputs.putStrike} onChange={setField("putStrike")} />
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
            label="Exchange Minimum Leverage"
            unit="×"
            value={inputs.exchangeMinLeverage}
            onChange={setField("exchangeMinLeverage")}
          />
        </div>

        <div>
          {!result.ok ? (
            <ErrorBanner message={result.error} />
          ) : (
            <>
              <div className="rounded-lg border border-line dark:border-line-dark bg-result dark:bg-result-dark px-3.5 pt-3.5 pb-1.5">
                <ResultRow big label="Minimum Usable Leverage" value={`${formatNumber(result.value.minUsableLeverage, 2)}×`} />
                <ResultRow label="Theoretical Minimum Leverage" value={`${formatNumber(result.value.theoreticalLeverage, 2)}×`} />
                <ResultRow label="Delta Exchange Minimum" value={`${formatNumber(result.value.exchangeMinLeverage, 2)}×`} />
                <ResultRow label="Maximum Lots / Leg" value={formatNumber(result.value.maxContracts)} />
                <ResultRow label="Combined Lots" value={formatNumber(result.value.totalContracts)} />
              </div>

              <div className="rounded-lg border border-line dark:border-line-dark px-3.5 py-3 mt-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted dark:text-ink-muted-dark mb-2">
                  Total Strangle Risk
                </div>
                <ResultRow label="CALL Lots" value={formatNumber(result.value.maxContracts)} />
                <ResultRow label="PUT Lots" value={formatNumber(result.value.maxContracts)} />
                <ResultRow label="Combined Lots" value={formatNumber(result.value.totalContracts)} />
                <ResultRow
                  label="Total Risk Budget"
                  value={`${formatINR(result.value.riskBudgetINR)} / ${formatUSD(result.value.riskBudgetUSD)}`}
                />
                <ResultRow label="Losing Leg" value={result.value.isCallLosingLeg ? "CALL" : "PUT"} tone="risk" />
                <ResultRow
                  label={`${inputs.stopLossPct}% SL Loss`}
                  value={formatUSD(result.value.losingLegSLLossUSD)}
                  tone="risk"
                />
                <ResultRow
                  label={`${inputs.takeProfitPct}% TP Profit`}
                  value={formatUSD(result.value.profitLegTPProfitUSD)}
                  tone="profit"
                />
                <ResultRow label="CALL Fee" value={formatUSD(result.value.callTotalFeeUSD)} />
                <ResultRow label="PUT Fee" value={formatUSD(result.value.putTotalFeeUSD)} />
                <ResultRow label="Total Fees" value={formatUSD(result.value.totalFeeUSD)} />
                <ResultRow
                  label="Worst Net Loss"
                  value={`${formatUSD(result.value.worstNetLossUSD)} / ${formatINR(result.value.worstNetLossINR)}`}
                  tone="risk"
                />
                <ResultRow label="Risk Utilization" value={`${formatNumber(result.value.riskUtilizationPct, 2)}%`} />
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3.5">
                <div className="rounded-lg border border-line dark:border-line-dark px-3 py-2.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted dark:text-ink-muted-dark">
                    CALL Fee Breakdown
                  </span>
                  <div className="mt-1.5 font-mono text-xs text-ink dark:text-ink-dark space-y-0.5">
                    <div>Order Notional: {formatUSD(result.value.callOrderNotionalUSD)}</div>
                    <div>Percentage Fee: {formatUSD(result.value.callPercentageFeeUSD)}</div>
                    <div>Premium Cap: {formatUSD(result.value.callPremiumCapUSD)}</div>
                    <div>Effective Fee: {formatUSD(result.value.callEffectiveFeeUSD)}</div>
                    <div>Total (+GST): {formatUSD(result.value.callTotalFeeUSD)}</div>
                  </div>
                </div>
                <div className="rounded-lg border border-line dark:border-line-dark px-3 py-2.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted dark:text-ink-muted-dark">
                    PUT Fee Breakdown
                  </span>
                  <div className="mt-1.5 font-mono text-xs text-ink dark:text-ink-dark space-y-0.5">
                    <div>Order Notional: {formatUSD(result.value.putOrderNotionalUSD)}</div>
                    <div>Percentage Fee: {formatUSD(result.value.putPercentageFeeUSD)}</div>
                    <div>Premium Cap: {formatUSD(result.value.putPremiumCapUSD)}</div>
                    <div>Effective Fee: {formatUSD(result.value.putEffectiveFeeUSD)}</div>
                    <div>Total (+GST): {formatUSD(result.value.putTotalFeeUSD)}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-line dark:border-line-dark px-3.5 py-3 mt-3.5">
                <div className="flex items-center gap-1.5 mb-2">
                  <Info size={12.5} className="text-ink-faint dark:text-ink-faint-dark" />
                  <span className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-ink-muted-dark">
                    Delta Exchange Margin
                  </span>
                </div>
                <ResultRow label="CALL Initial Margin" value={formatUSD(result.value.callInitialMarginUSD)} />
                <ResultRow label="PUT Initial Margin" value={formatUSD(result.value.putInitialMarginUSD)} />
                <ResultRow label="Combined Required Margin" value={formatUSD(result.value.combinedRequiredMarginUSD)} tone="risk" />
                <ResultRow label="Margin Entered" value={formatUSD(result.value.marginUSD)} />
                <ResultRow label="Theoretical Minimum Leverage" value={`${formatNumber(result.value.theoreticalLeverage, 2)}×`} />
                <ResultRow label="Delta Exchange Minimum Leverage" value={`${formatNumber(result.value.exchangeMinLeverage, 2)}×`} />
                <ResultRow big label="Bare Minimum Usable Leverage" value={`${formatNumber(result.value.minUsableLeverage, 2)}×`} />
              </div>

              {result.value.isLowLeverage && (
                <p className="text-[11px] leading-snug text-ink-faint dark:text-ink-faint-dark mt-2">
                  The theoretical leverage solved from Delta's margin formula is below 1× — the exchange's{" "}
                  {formatNumber(result.value.exchangeMinLeverage, 2)}× minimum is what actually applies here.
                </p>
              )}

              <details className="mt-3.5">
                <summary className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-ink-muted-dark cursor-pointer select-none">
                  How this is calculated
                </summary>
                <ol className="text-[11px] leading-relaxed text-ink-faint dark:text-ink-faint-dark list-decimal pl-4 space-y-0.5 mt-2">
                  <li>Capital determines the total 1% risk budget.</li>
                  <li>Higher premium is treated as the losing leg.</li>
                  <li>Higher-premium leg is assumed to hit the configured stop loss.</li>
                  <li>Lower-premium leg is assumed to reach the configured take profit.</li>
                  <li>Fees for both CALL and PUT are calculated using the Delta Exchange fee methodology.</li>
                  <li>Maximum whole-number lots are calculated so the total net loss stays within the 1% capital risk.</li>
                  <li>
                    Those calculated lots are then used to calculate Delta Exchange's estimated combined
                    option-selling margin.
                  </li>
                  <li>The user's entered margin is NOT used for risk or lot sizing.</li>
                  <li>The entered margin is used only to determine the leverage required to carry the calculated position.</li>
                  <li>The final usable leverage cannot be below the configured Delta Exchange minimum leverage.</li>
                </ol>
              </details>
            </>
          )}
        </div>
      </div>

      <OptionChainPanel
        manualBtcIndexPrice={parseFloat(inputs.btcIndexPrice)}
        callStrike={inputs.callStrike}
        putStrike={inputs.putStrike}
        onSelectCallStrike={setField("callStrike")}
        onSelectPutStrike={setField("putStrike")}
        onUseLiveIndex={(price) => setField("btcIndexPrice")(String(price))}
        onUseLiveCallPremium={(premium) => setField("callPremium")(String(premium))}
        onUseLivePutPremium={(premium) => setField("putPremium")(String(premium))}
        resetSignal={panelResetSignal}
      />
    </CardShell>
  );
}
