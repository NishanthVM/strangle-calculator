import { useMemo, useState } from "react";
import { Info } from "lucide-react";
import { CardShell } from "./CardShell";
import { NumberField } from "./NumberField";
import { ResultRow } from "./ResultRow";
import { ErrorBanner } from "./ErrorBanner";
import { runLotsCalculator } from "../lib/calculations";
import { formatBTC, formatNumber, formatUSD } from "../lib/format";
import type { LotsCalculatorInputs } from "../types";

const DEFAULTS: LotsCalculatorInputs = {
  capital: "100000",
  riskPct: "1",
  fees: "150",
  premium: "25",
  stopLossPct: "400",
  takeProfitPct: "90",
  usdInr: "85",
  contractSize: "0.001",
  leverage: "200",
};

export function LotsCalculator() {
  const [inputs, setInputs] = useState<LotsCalculatorInputs>(DEFAULTS);

  const setField = (key: keyof LotsCalculatorInputs) => (value: string) =>
    setInputs((current) => ({ ...current, [key]: value }));

  const result = useMemo(
    () =>
      runLotsCalculator({
        capital: parseFloat(inputs.capital),
        riskPct: parseFloat(inputs.riskPct),
        fees: parseFloat(inputs.fees),
        premiumUSD: parseFloat(inputs.premium),
        stopLossPct: parseFloat(inputs.stopLossPct),
        takeProfitPct: parseFloat(inputs.takeProfitPct),
        usdInr: parseFloat(inputs.usdInr),
        contractSize: parseFloat(inputs.contractSize),
      }),
    [inputs]
  );

  return (
    <CardShell
      title="Lots Calculator"
      subtitle="Maximum contracts per leg for your risk budget"
      onReset={() => setInputs(DEFAULTS)}
    >
      <NumberField label="Capital" unit="₹" value={inputs.capital} onChange={setField("capital")} />
      <NumberField label="Maximum Daily Risk" unit="%" value={inputs.riskPct} onChange={setField("riskPct")} />
      <NumberField label="Fees / Brokerage" unit="₹" value={inputs.fees} onChange={setField("fees")} />
      <NumberField label="Premium per Leg" unit="$" value={inputs.premium} onChange={setField("premium")} />
      <NumberField label="Stop Loss" unit="%" value={inputs.stopLossPct} onChange={setField("stopLossPct")} />
      <NumberField label="Take Profit" unit="%" value={inputs.takeProfitPct} onChange={setField("takeProfitPct")} />
      <NumberField label="USD / INR" unit="" value={inputs.usdInr} onChange={setField("usdInr")} />
      <NumberField
        label="Contract Size"
        unit="BTC"
        value={inputs.contractSize}
        onChange={setField("contractSize")}
      />
      <NumberField label="Leverage" unit="×" value={inputs.leverage} onChange={setField("leverage")} />

      {!result.ok ? (
        <ErrorBanner message={result.error} />
      ) : (
        <>
          <div className="rounded-lg border border-line dark:border-line-dark bg-result dark:bg-result-dark px-3.5 pt-3.5 pb-1.5 mt-1.5">
            <ResultRow big label="Maximum Contracts / Leg" value={formatNumber(result.value.maxContracts)} />
            <ResultRow label="BTC Quantity" value={formatBTC(result.value.btcQty)} />
            <ResultRow label="Premium" value={formatUSD(result.value.premiumUSD)} />
            <ResultRow label="Take Profit Level" value={formatUSD(result.value.tpLevelUSD)} tone="profit" />
            <ResultRow label="Stop Loss Level" value={formatUSD(result.value.slLevelUSD)} tone="risk" />
          </div>

          <div className="rounded-lg border border-line dark:border-line-dark px-3.5 py-3 mt-3.5">
            <div className="flex items-center gap-1.5 mb-2">
              <Info size={12.5} className="text-ink-faint dark:text-ink-faint-dark" />
              <span className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-ink-muted-dark">
                Short Strangle
              </span>
            </div>
            <div className="flex justify-between text-[13px] font-mono py-0.5 text-ink dark:text-ink-dark">
              <span className="text-ink-muted dark:text-ink-muted-dark font-sans">CALL contracts</span>
              <span>{formatNumber(result.value.maxContracts)}</span>
            </div>
            <div className="flex justify-between text-[13px] font-mono py-0.5 text-ink dark:text-ink-dark">
              <span className="text-ink-muted dark:text-ink-muted-dark font-sans">PUT contracts</span>
              <span>{formatNumber(result.value.maxContracts)}</span>
            </div>
            <div className="flex justify-between text-[13px] font-mono font-semibold py-0.5 pt-1.5 mt-0.5 border-t border-line dark:border-line-dark text-ink dark:text-ink-dark">
              <span className="text-ink-muted dark:text-ink-muted-dark font-sans font-medium">Total contracts</span>
              <span>{formatNumber(result.value.maxContracts * 2)}</span>
            </div>
            <p className="text-[11px] leading-snug text-ink-faint dark:text-ink-faint-dark mt-2">
              Position size is per leg, based on a {inputs.stopLossPct}% stop loss on each leg individually — not on
              the combined strangle.
            </p>
          </div>
        </>
      )}
    </CardShell>
  );
}
