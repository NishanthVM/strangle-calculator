import { computeMarginFloor, computeRiskMargin, expiryFactor } from "./deltaPortfolioMargin";
import type { DeltaMarginCalculatorValues, DeltaMarginResult, MinLeverageCalculatorResult } from "../types";

/**
 * Composes on top of runMinLeverageCalculator's output (lots, fees, and
 * worst-net-loss are already correct there — never recomputed here) to
 * produce: strategy identification, same-day expiry handling, Delta
 * margin (isolated or portfolio), leverage, maximum profit, risk:reward,
 * and break-even.
 *
 * MARGIN IS ALWAYS AN ESTIMATE — see the marginIsEstimate flag and the
 * per-mode caveats below. Never presented as a live exchange quote.
 */

function validate(v: DeltaMarginCalculatorValues): string | null {
  if (!Number.isFinite(v.marginUSD) || v.marginUSD <= 0) return "Enter a valid margin.";
  if (!Number.isFinite(v.callStrikeUSD) || v.callStrikeUSD <= 0) return "Enter a valid CALL strike price.";
  if (!Number.isFinite(v.putStrikeUSD) || v.putStrikeUSD <= 0) return "Enter a valid PUT strike price.";
  if (!Number.isFinite(v.exchangeMinLeverage) || v.exchangeMinLeverage <= 0) {
    return "Enter a valid exchange minimum leverage.";
  }
  if (v.marginMode === "isolated" && (!Number.isFinite(v.isolatedMarginPct) || v.isolatedMarginPct <= 0)) {
    return "Enter a valid isolated margin %.";
  }
  if (!Number.isFinite(v.manualDaysToExpiry) || v.manualDaysToExpiry <= 0) {
    return "Enter a valid days-to-expiry (used when no live expiry is selected).";
  }
  return null;
}

export function runDeltaMarginCalculation(
  risk: MinLeverageCalculatorResult,
  v: DeltaMarginCalculatorValues
): { ok: true; value: DeltaMarginResult } | { ok: false; error: string } {
  const error = validate(v);
  if (error) return { ok: false, error };

  const strategy = v.callStrikeUSD === v.putStrikeUSD ? "SHORT STRADDLE" : "SHORT STRANGLE";

  // ── Same-day expiry / time-to-expiry ──────────────────────────────────
  let daysToExpiry = v.manualDaysToExpiry;
  let minutesToExpiry: number | null = null;
  let isSameDayExpiry = false;
  if (v.expirySettlementMs !== null) {
    const msRemaining = v.expirySettlementMs - v.nowMs;
    minutesToExpiry = Math.max(msRemaining, 0) / 60000;
    daysToExpiry = Math.max(msRemaining, 1000) / (1000 * 60 * 60 * 24);
    const nowDate = new Date(v.nowMs);
    const settleDate = new Date(v.expirySettlementMs);
    isSameDayExpiry =
      nowDate.getUTCFullYear() === settleDate.getUTCFullYear() &&
      nowDate.getUTCMonth() === settleDate.getUTCMonth() &&
      nowDate.getUTCDate() === settleDate.getUTCDate();
  }
  const expiryFactorValue = minutesToExpiry !== null ? expiryFactor(minutesToExpiry) : 1;

  // ── Maximum profit (both legs expire worthless) ───────────────────────
  const maxGrossProfitUSD = (v.callPremiumUSD + v.putPremiumUSD) * risk.maxContracts * v.contractSize;
  const maxNetProfitUSD = maxGrossProfitUSD - risk.totalFeeUSD;
  const maxNetProfitINR = maxNetProfitUSD * v.usdInr;

  // ── Maximum planned loss (already computed by the risk engine) ────────
  const maxPlannedLossUSD = risk.worstNetLossUSD;
  const maxPlannedLossINR = risk.worstNetLossINR;

  // ── Risk:reward ─────────────────────────────────────────────────────
  const rewardMultiple = maxPlannedLossUSD > 0 ? maxNetProfitUSD / maxPlannedLossUSD : 0;

  // ── Break-even ──────────────────────────────────────────────────────
  const combinedPremiumUSD = v.callPremiumUSD + v.putPremiumUSD;
  const upperBreakEvenUSD = v.callStrikeUSD + combinedPremiumUSD;
  const lowerBreakEvenUSD = v.putStrikeUSD - combinedPremiumUSD;

  // ── Combined position notional (used for leverage regardless of margin mode) ──
  const callQtyBTC = risk.maxContracts * v.contractSize;
  const putQtyBTC = risk.maxContracts * v.contractSize;
  const combinedPositionNotionalUSD = (callQtyBTC + putQtyBTC) * v.btcIndexPriceUSD;

  // ── Margin ──────────────────────────────────────────────────────────
  let callRequiredMarginUSD: number | null = null;
  let putRequiredMarginUSD: number | null = null;
  let combinedRequiredMarginUSD: number;
  let riskMarginUSD: number | null = null;
  let marginFloorUSD: number | null = null;
  let riskMarginUnavailableReason: string | null = null;

  if (v.marginMode === "isolated") {
    // IM = InitialMargin% x Contracts x Multiplier x Price. Multiplier = contractSize (BTC per contract); Price = BTC index.
    callRequiredMarginUSD = (v.isolatedMarginPct / 100) * risk.maxContracts * v.contractSize * v.btcIndexPriceUSD;
    putRequiredMarginUSD = (v.isolatedMarginPct / 100) * risk.maxContracts * v.contractSize * v.btcIndexPriceUSD;
    combinedRequiredMarginUSD = callRequiredMarginUSD + putRequiredMarginUSD; // no offsetting in isolated mode
  } else {
    const floor = computeMarginFloor(v.callPremiumUSD, v.putPremiumUSD, callQtyBTC, putQtyBTC, v.btcIndexPriceUSD);
    marginFloorUSD = floor.totalFloorUSD;

    if (v.callIvPct === undefined || v.putIvPct === undefined) {
      riskMarginUnavailableReason =
        "Live implied volatility not provided by the option chain API for one or both legs — Risk Margin can't be computed. Showing Margin Floor only, a conservative lower bound.";
      combinedRequiredMarginUSD = marginFloorUSD;
    } else {
      const qtyFactor = isSameDayExpiry ? expiryFactorValue : 1;
      const risk29 = computeRiskMargin(
        v.btcIndexPriceUSD,
        { strike: v.callStrikeUSD, ivDecimal: v.callIvPct / 100, qtyBTC: callQtyBTC },
        { strike: v.putStrikeUSD, ivDecimal: v.putIvPct / 100, qtyBTC: putQtyBTC },
        daysToExpiry,
        qtyFactor
      );
      riskMarginUSD = risk29.riskMarginUSD;
      combinedRequiredMarginUSD = Math.max(riskMarginUSD, marginFloorUSD);
    }
  }

  // ── Leverage: Combined Position Notional / Margin — a direct ratio, not solved from the margin formula ──
  const theoreticalLeverage = combinedPositionNotionalUSD / v.marginUSD;
  const minUsableLeverage = Math.max(theoreticalLeverage, v.exchangeMinLeverage);

  return {
    ok: true,
    value: {
      strategy,
      isSameDayExpiry,
      daysToExpiry,
      minutesToExpiry,
      expiryFactor: expiryFactorValue,
      maxGrossProfitUSD,
      maxNetProfitUSD,
      maxNetProfitINR,
      maxPlannedLossUSD,
      maxPlannedLossINR,
      rewardMultiple,
      upperBreakEvenUSD,
      lowerBreakEvenUSD,
      callRequiredMarginUSD,
      putRequiredMarginUSD,
      combinedRequiredMarginUSD,
      marginIsEstimate: true,
      riskMarginUSD,
      marginFloorUSD,
      riskMarginUnavailableReason,
      combinedPositionNotionalUSD,
      theoreticalLeverage,
      exchangeMinLeverage: v.exchangeMinLeverage,
      minUsableLeverage,
    },
  };
}
