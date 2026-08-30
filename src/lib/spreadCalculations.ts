import { calculateDeltaFee } from "./deltaFees";
import { computeBreakEvens, computePayoffExtremes, detectStrategy } from "./optionPayoffEngine";
import type { Calculation, SpreadCalculatorResult, SpreadCalculatorValues } from "../types";

/**
 * Defined-risk spreads have NO stop-loss/take-profit inputs — risk comes
 * directly from the capped payoff (see optionPayoffEngine.ts), not an
 * arbitrary percentage. Capital/risk determine max spreads; margin is
 * used only afterward for leverage — same separation Calculator 3 uses.
 *
 * MARGIN NOTE: Delta doesn't publish a specific vertical-spread margin
 * formula distinct from its per-leg option margin rules, and combining
 * two option legs' margin correctly (recognizing the defined-risk
 * offset) isn't something this project can verify from public sources.
 * Estimated Required Margin here uses the position's own maximum loss —
 * a common, conservative convention for defined-risk spreads, since a
 * spread's worst-case exposure IS its maximum loss — labeled
 * "ESTIMATED" rather than presented as Delta's exact margin call.
 */

function validate(v: SpreadCalculatorValues): string | null {
  if (!Number.isFinite(v.capital) || v.capital <= 0) return "Enter a valid capital amount.";
  if (!Number.isFinite(v.riskPct) || v.riskPct <= 0) return "Enter a valid risk %.";
  if (!Number.isFinite(v.usdInr) || v.usdInr <= 0) return "Enter a valid USD/INR rate.";
  if (!Number.isFinite(v.contractSize) || v.contractSize <= 0) return "Enter a valid contract size.";
  if (!Number.isFinite(v.btcIndexPriceUSD) || v.btcIndexPriceUSD <= 0) return "Enter a valid BTC index price.";
  if (!Number.isFinite(v.leg1.strike) || v.leg1.strike <= 0 || !Number.isFinite(v.leg1.premiumUSD) || v.leg1.premiumUSD <= 0) {
    return "Enter valid Leg 1 strike and premium.";
  }
  if (!Number.isFinite(v.leg2.strike) || v.leg2.strike <= 0 || !Number.isFinite(v.leg2.premiumUSD) || v.leg2.premiumUSD <= 0) {
    return "Enter valid Leg 2 strike and premium.";
  }
  if (!Number.isFinite(v.rewardMultiple) || v.rewardMultiple <= 0) return "Enter a valid Risk : Reward multiple.";
  if (!Number.isFinite(v.marginUSD) || v.marginUSD <= 0) return "Enter a valid margin.";
  if (!Number.isFinite(v.exchangeMinLeverage) || v.exchangeMinLeverage <= 0) {
    return "Enter a valid exchange minimum leverage.";
  }
  if (!Number.isFinite(v.feeRatePct) || v.feeRatePct < 0) return "Enter a valid fee rate.";
  if (!Number.isFinite(v.premiumCapPct) || v.premiumCapPct < 0) return "Enter a valid premium cap.";
  if (!Number.isFinite(v.gstPct) || v.gstPct < 0) return "Enter a valid GST %.";
  return null;
}

export function runSpreadCalculator(v: SpreadCalculatorValues): Calculation<SpreadCalculatorResult> {
  const error = validate(v);
  if (error) return { ok: false, error };

  const strategy = detectStrategy(v.leg1, v.leg2);
  const extremes = computePayoffExtremes(v.leg1, v.leg2);
  const breakEvens = computeBreakEvens(v.leg1, v.leg2);

  const netPremiumUSD =
    (v.leg1.action === "buy" ? -v.leg1.premiumUSD : v.leg1.premiumUSD) +
    (v.leg2.action === "buy" ? -v.leg2.premiumUSD : v.leg2.premiumUSD);
  const isNetDebit = netPremiumUSD < 0;

  const leg1FeeAt1 = calculateDeltaFee(1, v.contractSize, v.btcIndexPriceUSD, v.leg1.premiumUSD, v.feeRatePct, v.premiumCapPct, v.gstPct);
  const leg2FeeAt1 = calculateDeltaFee(1, v.contractSize, v.btcIndexPriceUSD, v.leg2.premiumUSD, v.feeRatePct, v.premiumCapPct, v.gstPct);
  const feePerSpread = leg1FeeAt1.totalFeeUSD + leg2FeeAt1.totalFeeUSD;

  const grossMaxLossPerSpread = Math.abs(Math.min(extremes.minPerBTC, 0)) * v.contractSize;
  const maxLossPerSpreadWithFees = grossMaxLossPerSpread + feePerSpread;

  if (maxLossPerSpreadWithFees <= 0) {
    return {
      ok: false,
      error: "This leg combination has no capped downside — check strikes and actions (this may not be a defined-risk spread).",
    };
  }

  const riskBudgetINR = v.capital * (v.riskPct / 100);
  const riskBudgetUSD = riskBudgetINR / v.usdInr;

  if (feePerSpread >= riskBudgetUSD) {
    return { ok: false, error: "Fees exceed the available risk budget." };
  }

  const maxSpreads = Math.floor(riskBudgetUSD / maxLossPerSpreadWithFees);
  if (!Number.isFinite(maxSpreads) || maxSpreads < 1) {
    return { ok: false, error: "Risk budget is insufficient for 1 spread." };
  }

  const leg1Fee = calculateDeltaFee(maxSpreads, v.contractSize, v.btcIndexPriceUSD, v.leg1.premiumUSD, v.feeRatePct, v.premiumCapPct, v.gstPct);
  const leg2Fee = calculateDeltaFee(maxSpreads, v.contractSize, v.btcIndexPriceUSD, v.leg2.premiumUSD, v.feeRatePct, v.premiumCapPct, v.gstPct);
  const totalFeesUSD = leg1Fee.totalFeeUSD + leg2Fee.totalFeeUSD;

  const grossMaxLossUSD = Math.abs(Math.min(extremes.minPerBTC, 0)) * v.contractSize * maxSpreads;
  const grossMaxProfitUSD = Math.max(extremes.maxPerBTC, 0) * v.contractSize * maxSpreads;

  const maxLossUSD = grossMaxLossUSD + totalFeesUSD;
  const maxProfitUSD = grossMaxProfitUSD - totalFeesUSD;
  const maxLossINR = maxLossUSD * v.usdInr;
  const maxProfitINR = maxProfitUSD * v.usdInr;

  const theoreticalRewardMultiple = maxLossUSD > 0 ? maxProfitUSD / maxLossUSD : 0;

  const targetProfitUSD = maxLossUSD * v.rewardMultiple;
  const targetProfitINR = targetProfitUSD * v.usdInr;
  const targetExceedsTheoretical = targetProfitUSD > maxProfitUSD;

  const estimatedRequiredMarginUSD = maxLossUSD;
  const combinedPositionNotionalUSD = maxSpreads * v.contractSize * v.btcIndexPriceUSD * 2;
  const theoreticalLeverage = combinedPositionNotionalUSD / v.marginUSD;
  const minUsableLeverage = Math.max(theoreticalLeverage, v.exchangeMinLeverage);

  return {
    ok: true,
    value: {
      strategy,
      netPremiumUSD: Math.abs(netPremiumUSD),
      isNetDebit,
      breakEvens,
      maxSpreads,
      riskBudgetINR,
      riskBudgetUSD,
      leg1FeeUSD: leg1Fee.totalFeeUSD,
      leg2FeeUSD: leg2Fee.totalFeeUSD,
      totalFeesUSD,
      maxProfitUSD,
      maxProfitINR,
      maxLossUSD,
      maxLossINR,
      theoreticalRewardMultiple,
      targetProfitUSD,
      targetProfitINR,
      targetExceedsTheoretical,
      estimatedRequiredMarginUSD,
      marginUSD: v.marginUSD,
      combinedPositionNotionalUSD,
      theoreticalLeverage,
      exchangeMinLeverage: v.exchangeMinLeverage,
      minUsableLeverage,
      leg1FeeBreakdown: leg1Fee,
      leg2FeeBreakdown: leg2Fee,
    },
  };
}
