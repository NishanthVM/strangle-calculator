import { useMemo, useRef, useState } from "react";
import { CardShell } from "./CardShell";
import { NumberField } from "./NumberField";
import { ResultRow } from "./ResultRow";
import { ErrorBanner } from "./ErrorBanner";
import { OptionChainPanel } from "./OptionChainPanel";
import { runMinLeverageCalculator } from "../lib/minLeverageCalculations";
import { runDeltaMarginCalculation } from "../lib/deltaMarginCalculations";
import { findClosestPremiumMatch } from "../lib/premiumMatching";
import { formatINR, formatNumber, formatUSD } from "../lib/format";
import type { OptionChain } from "../lib/deltaApi";
import type { DeltaMarginCalculatorInputs, MarginMode, MinLeverageCalculatorInputs } from "../types";

const RISK_DEFAULTS: MinLeverageCalculatorInputs = {
  capital: "100000",
  callPremium: "25",
  putPremium: "25",
  riskPct: "1",
  takeProfitPct: "90",
  stopLossPct: "400",
  usdInr: "85",
  contractSize: "0.001",
  btcIndexPrice: "100000",
  feeRatePct: "0.01",
  premiumCapPct: "3.5",
  gstPct: "18",
};

const MARGIN_DEFAULTS: DeltaMarginCalculatorInputs = {
  margin: "10",
  marginMode: "isolated",
  isolatedMarginPct: "10",
  callStrike: "105000",
  putStrike: "95000",
  exchangeMinLeverage: "1",
  manualDaysToExpiry: "0.5",
};

function formatTimeToExpiry(minutesRemaining: number): string {
  const totalSeconds = Math.max(Math.round(minutesRemaining * 60), 0);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function MinLeverageCalculator() {
  const [inputs, setInputs] = useState<MinLeverageCalculatorInputs>(RISK_DEFAULTS);
  const [marginInputs, setMarginInputs] = useState<DeltaMarginCalculatorInputs>(MARGIN_DEFAULTS);
  const [panelResetSignal, setPanelResetSignal] = useState(0);

  const [callIvPct, setCallIvPct] = useState<number | null>(null);
  const [putIvPct, setPutIvPct] = useState<number | null>(null);
  const [expirySettlementMs, setExpirySettlementMs] = useState<number | null>(null);

  const [chainData, setChainData] = useState<OptionChain | null>(null);
  const [autoMatchEnabled, setAutoMatchEnabled] = useState(true);
  const [matchingBuffer, setMatchingBuffer] = useState("5");
  const [referenceLeg, setReferenceLeg] = useState<"call" | "put" | null>(null);
  // Set right before a leg is updated PROGRAMMATICALLY (by the matching algorithm) so that
  // update doesn't itself trigger another round of matching — prevents CALL→PUT→CALL loops.
  const programmaticUpdateRef = useRef(false);

  const setField = (key: keyof MinLeverageCalculatorInputs) => (value: string) =>
    setInputs((current) => ({ ...current, [key]: value }));
  const setMarginField = (key: keyof DeltaMarginCalculatorInputs) => (value: string) =>
    setMarginInputs((current) => ({ ...current, [key]: value }));

  const handleChainDataChange = (chain: OptionChain | null) => {
    setChainData(chain);
    // Expiry/chain refresh: re-run matching against the reference leg's CURRENT premium in
    // the new chain, if that leg's strike still exists there — never mixes expiries.
    if (!autoMatchEnabled || !referenceLeg || !chain) return;
    const refStrike = parseFloat(referenceLeg === "call" ? marginInputs.callStrike : marginInputs.putStrike);
    const refContracts = referenceLeg === "call" ? chain.calls : chain.puts;
    const refContract = refContracts.find((c) => c.strike === refStrike);
    if (!refContract || refContract.premium === undefined) return;
    runMatch(referenceLeg, refStrike, refContract.premium, chain);
  };

  function runMatch(leg: "call" | "put", strike: number, premium: number, chain: OptionChain) {
    const candidates = (leg === "call" ? chain.puts : chain.calls)
      .filter((c) => c.premium !== undefined)
      .map((c) => ({ strike: c.strike, premium: c.premium as number }));
    const match = findClosestPremiumMatch(strike, premium, candidates, parseFloat(matchingBuffer));
    if (!match) return;
    programmaticUpdateRef.current = true;
    if (leg === "call") {
      setMarginField("putStrike")(String(match.strike));
      setField("putPremium")(String(match.premium));
    } else {
      setMarginField("callStrike")(String(match.strike));
      setField("callPremium")(String(match.premium));
    }
  }

  const handleSelectCallStrike = (strike: string) => {
    setMarginField("callStrike")(strike);
    if (programmaticUpdateRef.current) {
      programmaticUpdateRef.current = false;
      return; // this update came from the matcher itself — don't re-trigger matching
    }
    setReferenceLeg("call");
    if (!autoMatchEnabled || !chainData) return;
    const contract = chainData.calls.find((c) => c.strike === parseFloat(strike));
    if (contract?.premium === undefined) return;
    setField("callPremium")(String(contract.premium));
    runMatch("call", parseFloat(strike), contract.premium, chainData);
  };

  const handleSelectPutStrike = (strike: string) => {
    setMarginField("putStrike")(strike);
    if (programmaticUpdateRef.current) {
      programmaticUpdateRef.current = false;
      return;
    }
    setReferenceLeg("put");
    if (!autoMatchEnabled || !chainData) return;
    const contract = chainData.puts.find((c) => c.strike === parseFloat(strike));
    if (contract?.premium === undefined) return;
    setField("putPremium")(String(contract.premium));
    runMatch("put", parseFloat(strike), contract.premium, chainData);
  };

  const callPremiumNum = parseFloat(inputs.callPremium);
  const putPremiumNum = parseFloat(inputs.putPremium);
  const premiumDifference = Number.isFinite(callPremiumNum) && Number.isFinite(putPremiumNum) ? Math.abs(callPremiumNum - putPremiumNum) : null;
  const bufferNum = parseFloat(matchingBuffer);
  const withinBuffer = premiumDifference !== null && Number.isFinite(bufferNum) ? premiumDifference <= bufferNum : null;

  const riskResult = useMemo(
    () =>
      runMinLeverageCalculator({
        capital: parseFloat(inputs.capital),
        callPremiumUSD: parseFloat(inputs.callPremium),
        putPremiumUSD: parseFloat(inputs.putPremium),
        riskPct: parseFloat(inputs.riskPct),
        takeProfitPct: parseFloat(inputs.takeProfitPct),
        stopLossPct: parseFloat(inputs.stopLossPct),
        usdInr: parseFloat(inputs.usdInr),
        contractSize: parseFloat(inputs.contractSize),
        btcIndexPriceUSD: parseFloat(inputs.btcIndexPrice),
        feeRatePct: parseFloat(inputs.feeRatePct),
        premiumCapPct: parseFloat(inputs.premiumCapPct),
        gstPct: parseFloat(inputs.gstPct),
      }),
    [inputs]
  );

  const marginResult = useMemo(() => {
    if (!riskResult.ok) return null;
    return runDeltaMarginCalculation(riskResult.value, {
      marginUSD: parseFloat(marginInputs.margin),
      marginMode: marginInputs.marginMode,
      isolatedMarginPct: parseFloat(marginInputs.isolatedMarginPct),
      callStrikeUSD: parseFloat(marginInputs.callStrike),
      putStrikeUSD: parseFloat(marginInputs.putStrike),
      exchangeMinLeverage: parseFloat(marginInputs.exchangeMinLeverage),
      btcIndexPriceUSD: parseFloat(inputs.btcIndexPrice),
      contractSize: parseFloat(inputs.contractSize),
      usdInr: parseFloat(inputs.usdInr),
      callPremiumUSD: parseFloat(inputs.callPremium),
      putPremiumUSD: parseFloat(inputs.putPremium),
      callIvPct: callIvPct ?? undefined,
      putIvPct: putIvPct ?? undefined,
      expirySettlementMs,
      manualDaysToExpiry: parseFloat(marginInputs.manualDaysToExpiry),
      nowMs: Date.now(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    riskResult,
    marginInputs,
    inputs.btcIndexPrice,
    inputs.contractSize,
    inputs.usdInr,
    inputs.callPremium,
    inputs.putPremium,
    callIvPct,
    putIvPct,
    expirySettlementMs,
  ]);

  return (
    <CardShell
      title="Minimum Leverage Calculator"
      subtitle="Combined two-leg strangle/straddle risk, Delta Exchange margin, and profit/loss — all in one place"
      onReset={() => {
        setInputs(RISK_DEFAULTS);
        setMarginInputs(MARGIN_DEFAULTS);
        setPanelResetSignal((s) => s + 1);
      }}
      fullWidth
    >
      <p className="text-[11px] leading-snug text-ink-faint dark:text-ink-faint-dark -mt-1 mb-3.5">
        Capital determines the maximum risk and therefore the maximum lots. Margin is independent of capital and is
        used only after the lot size has been calculated, to determine leverage against Delta Exchange's actual
        margin methodology.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted dark:text-ink-muted-dark mb-1.5">
            Risk & Position Sizing
          </div>
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

          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted dark:text-ink-muted-dark mb-1.5 mt-4">
            Margin & Strategy
          </div>
          <NumberField
            label="Margin Available / Required"
            unit="$ — independent of capital"
            value={marginInputs.margin}
            onChange={setMarginField("margin")}
          />
          <label className="block mb-3">
            <span className="text-[12.5px] font-medium text-ink-muted dark:text-ink-muted-dark block mb-1.5">
              Margin Mode
            </span>
            <select
              value={marginInputs.marginMode}
              onChange={(e) => setMarginField("marginMode")(e.target.value as MarginMode)}
              className="w-full rounded-md border border-line dark:border-line-dark bg-field dark:bg-field-dark px-2.5 py-2 text-[13px] text-ink dark:text-ink-dark"
            >
              <option value="isolated">Isolated</option>
              <option value="portfolio">Portfolio</option>
            </select>
          </label>
          {marginInputs.marginMode === "isolated" && (
            <NumberField
              label="Isolated Margin %"
              unit="% — Delta's actual % is per-contract; verify on Delta"
              value={marginInputs.isolatedMarginPct}
              onChange={setMarginField("isolatedMarginPct")}
            />
          )}
          <NumberField
            label="CALL Strike Price"
            unit="$"
            value={marginInputs.callStrike}
            onChange={setMarginField("callStrike")}
          />
          <NumberField
            label="PUT Strike Price"
            unit="$"
            value={marginInputs.putStrike}
            onChange={setMarginField("putStrike")}
          />
          <NumberField
            label="Exchange Minimum Leverage"
            unit="×"
            value={marginInputs.exchangeMinLeverage}
            onChange={setMarginField("exchangeMinLeverage")}
          />
          <NumberField
            label="Days to Expiry (manual fallback)"
            unit="days — used when no live expiry is selected"
            value={marginInputs.manualDaysToExpiry}
            onChange={setMarginField("manualDaysToExpiry")}
          />

          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted dark:text-ink-muted-dark mb-1.5 mt-4">
            Auto-Match Premium
          </div>
          <label className="flex items-center gap-2 mb-3 text-[12.5px] text-ink dark:text-ink-dark">
            <input type="checkbox" checked={autoMatchEnabled} onChange={(e) => setAutoMatchEnabled(e.target.checked)} />
            Auto-match opposite leg by closest live premium
          </label>
          <NumberField
            label="Premium Matching Buffer"
            unit="$ — prefer a different strike within this buffer"
            value={matchingBuffer}
            onChange={setMatchingBuffer}
          />
        </div>

        <div>
          {!riskResult.ok ? (
            <ErrorBanner message={riskResult.error} />
          ) : !marginResult ? null : !marginResult.ok ? (
            <ErrorBanner message={marginResult.error} />
          ) : (
            <>
              <div className="rounded-lg border border-line dark:border-line-dark px-3.5 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted dark:text-ink-muted-dark mb-2">
                  Premium Balance
                </div>
                <ResultRow label="CALL Premium" value={formatUSD(callPremiumNum)} />
                <ResultRow label="PUT Premium" value={formatUSD(putPremiumNum)} />
                <ResultRow label="Premium Difference" value={premiumDifference !== null ? formatUSD(premiumDifference) : "—"} />
                <ResultRow label="Matching Buffer" value={formatUSD(bufferNum)} />
                <ResultRow
                  label="Status"
                  value={withinBuffer === null ? "—" : withinBuffer ? "✓ Within Buffer" : "⚠ Outside Buffer"}
                  tone={withinBuffer === false ? "risk" : withinBuffer === true ? "profit" : "neutral"}
                />
                <ResultRow label="Reference Leg" value={referenceLeg ? referenceLeg.toUpperCase() : "None yet"} />
              </div>

              <div className="rounded-lg border border-line dark:border-line-dark bg-result dark:bg-result-dark px-3.5 pt-3.5 pb-1.5 mt-3.5">
                <ResultRow big label="Strategy" value={marginResult.value.strategy} />
                <ResultRow
                  label="Expiry"
                  value={
                    marginResult.value.isSameDayExpiry
                      ? "SAME-DAY EXPIRY"
                      : `${formatNumber(marginResult.value.daysToExpiry, 1)} days out`
                  }
                  tone={marginResult.value.isSameDayExpiry ? "risk" : "neutral"}
                />
                {marginResult.value.isSameDayExpiry && marginResult.value.minutesToExpiry !== null && (
                  <ResultRow
                    label="Time to Expiry"
                    value={formatTimeToExpiry(marginResult.value.minutesToExpiry)}
                    tone="risk"
                  />
                )}
                <ResultRow label="Maximum Lots / Leg" value={formatNumber(riskResult.value.maxContracts)} />
                <ResultRow label="Combined Lots" value={formatNumber(riskResult.value.totalContracts)} />
              </div>

              <div className="rounded-lg border border-line dark:border-line-dark px-3.5 py-3 mt-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted dark:text-ink-muted-dark mb-2">
                  Profit / Loss Summary
                </div>
                <ResultRow
                  big
                  label="Maximum Profit"
                  value={`${formatINR(marginResult.value.maxNetProfitINR)} · ${formatUSD(marginResult.value.maxNetProfitUSD)}`}
                />
                <ResultRow
                  label="Maximum Planned Loss"
                  value={`${formatINR(marginResult.value.maxPlannedLossINR)} · ${formatUSD(marginResult.value.maxPlannedLossUSD)}`}
                  tone="risk"
                />
                <ResultRow
                  label="Risk : Reward"
                  value={`1 : ${formatNumber(marginResult.value.rewardMultiple, 2)}`}
                  tone={marginResult.value.rewardMultiple >= 1 ? "profit" : "risk"}
                />
                <ResultRow label="Gross Profit (both worthless)" value={formatUSD(marginResult.value.maxGrossProfitUSD)} />
                <ResultRow label="Upper Break-even" value={formatUSD(marginResult.value.upperBreakEvenUSD, 0)} />
                <ResultRow label="Lower Break-even" value={formatUSD(marginResult.value.lowerBreakEvenUSD, 0)} />
                <p className="text-[10.5px] leading-snug text-ink-faint dark:text-ink-faint-dark mt-2">
                  Maximum profit assumes both legs expire worthless — a theoretical expiry outcome, not necessarily
                  today's mark-to-market P&amp;L. Maximum planned loss reflects this calculator's configured risk/SL
                  model, not the theoretical unlimited loss of an uncovered short option.
                </p>
              </div>

              <div className="rounded-lg border border-line dark:border-line-dark px-3.5 py-3 mt-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted dark:text-ink-muted-dark mb-2">
                  Delta Exchange Margin — Estimated
                </div>
                <ResultRow label="Margin Mode" value={marginInputs.marginMode === "isolated" ? "Isolated" : "Portfolio"} />
                {marginInputs.marginMode === "isolated" ? (
                  <>
                    <ResultRow label="CALL Required Margin" value={formatUSD(marginResult.value.callRequiredMarginUSD ?? 0)} />
                    <ResultRow label="PUT Required Margin" value={formatUSD(marginResult.value.putRequiredMarginUSD ?? 0)} />
                  </>
                ) : (
                  <>
                    <ResultRow
                      label="Risk Margin"
                      value={marginResult.value.riskMarginUSD !== null ? formatUSD(marginResult.value.riskMarginUSD) : "Unavailable"}
                    />
                    <ResultRow
                      label="Margin Floor"
                      value={marginResult.value.marginFloorUSD !== null ? formatUSD(marginResult.value.marginFloorUSD) : "—"}
                    />
                  </>
                )}
                <ResultRow label="Combined Required Margin" value={formatUSD(marginResult.value.combinedRequiredMarginUSD)} tone="risk" />
                {marginResult.value.riskMarginUnavailableReason && (
                  <p className="text-[10.5px] leading-snug text-warn-text dark:text-warn-text-dark mt-1.5">
                    {marginResult.value.riskMarginUnavailableReason}
                  </p>
                )}
                <ResultRow label="Margin Entered" value={formatUSD(parseFloat(marginInputs.margin))} />
                <ResultRow label="Theoretical Required Leverage" value={`${formatNumber(marginResult.value.theoreticalLeverage, 2)}×`} />
                <ResultRow label="Exchange Minimum" value={`${formatNumber(marginResult.value.exchangeMinLeverage, 2)}×`} />
                <ResultRow big label="Minimum Usable Leverage" value={`${formatNumber(marginResult.value.minUsableLeverage, 2)}×`} />
                <p className="text-[10.5px] leading-snug text-ink-faint dark:text-ink-faint-dark mt-2">
                  Same-day expiry margin can change rapidly as the option approaches expiry. Delta Exchange may
                  update margin parameters and risk calculations. Verify the required margin on the exchange before
                  placing the trade.
                </p>
              </div>

              <details className="mt-3.5">
                <summary className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-ink-muted-dark cursor-pointer select-none">
                  How this is calculated
                </summary>
                <ol className="text-[11px] leading-relaxed text-ink-faint dark:text-ink-faint-dark list-decimal pl-4 space-y-0.5 mt-2">
                  <li>Capital and Total Risk % determine the maximum total risk budget for the combined strangle/straddle.</li>
                  <li>The higher-premium leg is treated as the losing leg (stop loss); the lower-premium leg as the profit leg (take profit).</li>
                  <li>Delta Exchange fees are calculated for both CALL and PUT and included in the risk budget.</li>
                  <li>The largest whole lots-per-leg satisfying the risk budget is found — this determines position size, not margin.</li>
                  <li>Those exact calculated lots feed into Delta's margin calculation (isolated: per-contract %; portfolio: max(Risk Margin, Margin Floor)).</li>
                  <li>Margin is independent of capital and risk — it only uses the already-calculated lots.</li>
                  <li>User-entered margin determines leverage: Combined Position Notional ÷ Margin.</li>
                  <li>Exchange minimum leverage sets a floor — usable leverage is never below it.</li>
                  <li>Maximum profit assumes both options expire worthless; risk/reward uses net (after-fee) values.</li>
                </ol>
              </details>
            </>
          )}
        </div>
      </div>

      <OptionChainPanel
        manualBtcIndexPrice={parseFloat(inputs.btcIndexPrice)}
        callStrike={marginInputs.callStrike}
        putStrike={marginInputs.putStrike}
        onSelectCallStrike={handleSelectCallStrike}
        onSelectPutStrike={handleSelectPutStrike}
        onUseLiveIndex={(price) => setField("btcIndexPrice")(String(price))}
        onUseLiveCallPremium={(premium) => setField("callPremium")(String(premium))}
        onUseLivePutPremium={(premium) => setField("putPremium")(String(premium))}
        onCallIvChange={setCallIvPct}
        onPutIvChange={setPutIvPct}
        onExpiryInfoChange={setExpirySettlementMs}
        onChainDataChange={handleChainDataChange}
        resetSignal={panelResetSignal}
      />
    </CardShell>
  );
}
