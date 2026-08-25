import { useMemo, useState } from "react";
import { CardShell } from "./CardShell";
import { NumberField } from "./NumberField";
import { ResultRow } from "./ResultRow";
import { ErrorBanner } from "./ErrorBanner";
import { runPremiumCalculator } from "../lib/calculations";
import { formatBTC, formatINR, formatUSD } from "../lib/format";
import type { PremiumCalculatorInputs } from "../types";

const DEFAULTS: PremiumCalculatorInputs = {
  capital: "100000",
  riskPct: "1",
  fees: "150",
  stopLossPct: "400",
  takeProfitPct: "90",
  usdInr: "85",
  contracts: "1000",
  contractSize: "0.001",
  leverage: "200",
};

export function PremiumCalculator() {
  const [inputs, setInputs] = useState<PremiumCalculatorInputs>(DEFAULTS);

  const setField = (key: keyof PremiumCalculatorInputs) => (value: string) =>
    setInputs((current) => ({ ...current, [key]: value }));

  const result = useMemo(
    () =>
      runPremiumCalculator({
        capital: parseFloat(inputs.capital),
        riskPct: parseFloat(inputs.riskPct),
        fees: parseFloat(inputs.fees),
        stopLossPct: parseFloat(inputs.stopLossPct),
        takeProfitPct: parseFloat(inputs.takeProfitPct),
        usdInr: parseFloat(inputs.usdInr),
        contracts: parseFloat(inputs.contracts),
        contractSize: parseFloat(inputs.contractSize),
      }),
    [inputs]
  );

  return (
    <CardShell
      title="Premium Calculator"
      subtitle="Maximum premium per leg for your risk budget"
      onReset={() => setInputs(DEFAULTS)}
    >
      <NumberField label="Capital" unit="₹" value={inputs.capital} onChange={setField("capital")} />
      <NumberField label="Maximum Daily Risk" unit="%" value={inputs.riskPct} onChange={setField("riskPct")} />
      <NumberField label="Fees / Brokerage" unit="₹" value={inputs.fees} onChange={setField("fees")} />
      <NumberField
        label="Stop Loss"
        unit="% of premium"
        value={inputs.stopLossPct}
        onChange={setField("stopLossPct")}
      />
      <NumberField
        label="Take Profit"
        unit="% of premium"
        value={inputs.takeProfitPct}
        onChange={setField("takeProfitPct")}
      />
      <NumberField label="USD / INR" unit="" value={inputs.usdInr} onChange={setField("usdInr")} />
      <NumberField
        label="Number of Contracts / Lots"
        unit="contracts"
        value={inputs.contracts}
        onChange={setField("contracts")}
      />
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
        <div className="rounded-lg border border-line dark:border-line-dark bg-result dark:bg-result-dark px-3.5 pt-3.5 pb-1.5 mt-1.5">
          <ResultRow big label="Maximum Premium / Leg" value={formatUSD(result.value.premiumUSD)} />
          <ResultRow label="Premium in INR" value={formatINR(result.value.premiumINR)} />
          <ResultRow label="BTC Quantity" value={formatBTC(result.value.btcQty)} />
          <ResultRow label="Maximum Loss at SL" value={formatUSD(result.value.maxLossUSD)} tone="risk" />
          <ResultRow label="Take Profit Level" value={formatUSD(result.value.tpLevelUSD)} tone="profit" />
          <ResultRow label="Stop Loss Level" value={formatUSD(result.value.slLevelUSD)} tone="risk" />
        </div>
      )}
    </CardShell>
  );
}
