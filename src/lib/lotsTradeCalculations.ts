import { calculateDeltaFee } from "./deltaFees";
import type { Calculation, LotsTradeCalculatorResult, LotsTradeCalculatorValues } from "../types";

/**
 * The Lots Calculator, extended with BUY/SELL trade modes and Delta's
 * real fee methodology (calculateDeltaFee, shared with Calculator 4) in
 * place of the old flat ₹150 fee. Nothing in calculations.ts is touched
 * by this file — the Premium Calculator, which imports from
 * calculations.ts directly, is completely unaffected.
 *
 * BUY mode: risk = premium cost + fees (bounded by risk budget). Profit
 * is theoretically uncapped (long option), so no "target exceeds max"
 * check applies — the target is labeled "RR-Based Target Profit" only.
 *
 * SELL mode: same SL%-based worst-case model the original calculator
 * used (now with dynamic fees instead of a flat ₹ fee). Theoretical max
 * profit is capped at the credit received minus fees (short option
 * profits max out when the option expires worthless) — the target IS
 * checked against this cap.
 *
 * Both modes: margin is independent of capital/risk and is used only
 * after lots are known, for leverage = position notional / margin,
 * floored at exchangeMinLeverage (default 1×).
 */

function validate(v: LotsTradeCalculatorValues): string | null {
  if (!Number.isFinite(v.capital) || v.capital <= 0) return "Enter a valid capital amount.";
  if (!Number.isFinite(v.riskPct) || v.riskPct <= 0) return "Enter a valid risk %.";
  if (!Number.isFinite(v.premiumUSD) || v.premiumUSD <= 0) return "Enter a valid premium.";
  if (!Number.isFinite(v.usdInr) || v.usdInr <= 0) return "Enter a valid USD/INR rate.";
  if (!Number.isFinite(v.contractSize) || v.contractSize <= 0) return "Enter a valid contract size.";
  if (!Number.isFinite(v.btcIndexPriceUSD) || v.btcIndexPriceUSD <= 0) return "Enter a valid BTC index price.";
  if (!Number.isFinite(v.feeRatePct) || v.feeRatePct < 0) return "Enter a valid fee rate.";
  if (!Number.isFinite(v.premiumCapPct) || v.premiumCapPct < 0) return "Enter a valid premium cap.";
  if (!Number.isFinite(v.gstPct) || v.gstPct < 0) return "Enter a valid GST %.";
  if (v.tradeMode === "sell" && (!Number.isFinite(v.stopLossPct) || v.stopLossPct <= 0)) {
    return "Enter a valid stop loss %.";
  }
  if (!Number.isFinite(v.rewardMultiple) || v.rewardMultiple <= 0) return "Enter a valid risk:reward target.";
  if (!Number.isFinite(v.marginUSD) || v.marginUSD <= 0) return "Enter a valid margin.";
  if (!Number.isFinite(v.exchangeMinLeverage) || v.exchangeMinLeverage <= 0) {
    return "Enter a valid exchange minimum leverage.";
  }
  return null;
}

export function runLotsTradeCalculator(v: LotsTradeCalculatorValues): Calculation<LotsTradeCalculatorResult> {
  const error = validate(v);
  if (error) return { ok: false, error };

  const riskBudgetINR = v.capital * (v.riskPct / 100);
  const riskBudgetUSD = riskBudgetINR / v.usdInr;

  const feeAt1 = calculateDeltaFee(1, v.contractSize, v.btcIndexPriceUSD, v.premiumUSD, v.feeRatePct, v.premiumCapPct, v.gstPct);

  let maxContracts: number;

  if (v.tradeMode === "buy") {
    const premiumCostPerContract = v.premiumUSD * v.contractSize;
    const totalCostPerContract = premiumCostPerContract + feeAt1.totalFeeUSD;
    maxContracts = Math.floor(riskBudgetUSD / totalCostPerContract);
  } else {
    const slLossPerBTC = v.premiumUSD * (v.stopLossPct / 100);
    const worstLossPerContract = slLossPerBTC * v.contractSize + feeAt1.totalFeeUSD;
    maxContracts = Math.floor(riskBudgetUSD / worstLossPerContract);
  }

  if (!Number.isFinite(maxContracts) || maxContracts < 1) {
    return { ok: false, error: "Risk budget is insufficient for 1 contract at the selected parameters." };
  }

  const feeBreakdown = calculateDeltaFee(
    maxContracts,
    v.contractSize,
    v.btcIndexPriceUSD,
    v.premiumUSD,
    v.feeRatePct,
    v.premiumCapPct,
    v.gstPct
  );
  const totalFeesUSD = feeBreakdown.totalFeeUSD;
  const totalFeesINR = totalFeesUSD * v.usdInr;

  let calculatedRiskUSD: number;
  let optionCostUSD: number | null = null;
  let theoreticalMaxProfitUSD: number | null = null;

  if (v.tradeMode === "buy") {
    optionCostUSD = v.premiumUSD * v.contractSize * maxContracts;
    calculatedRiskUSD = optionCostUSD + totalFeesUSD;
  } else {
    const grossLossUSD = v.premiumUSD * (v.stopLossPct / 100) * v.contractSize * maxContracts;
    calculatedRiskUSD = grossLossUSD + totalFeesUSD;
    theoreticalMaxProfitUSD = v.premiumUSD * v.contractSize * maxContracts - totalFeesUSD;
  }
  const calculatedRiskINR = calculatedRiskUSD * v.usdInr;
  const theoreticalMaxProfitINR = theoreticalMaxProfitUSD !== null ? theoreticalMaxProfitUSD * v.usdInr : null;

  const targetProfitUSD = calculatedRiskUSD * v.rewardMultiple;
  const targetProfitINR = targetProfitUSD * v.usdInr;
  const targetExceedsTheoretical = theoreticalMaxProfitUSD !== null && targetProfitUSD > theoreticalMaxProfitUSD;

  const positionNotionalUSD = maxContracts * v.contractSize * v.btcIndexPriceUSD;
  const theoreticalLeverage = positionNotionalUSD / v.marginUSD;
  const minUsableLeverage = Math.max(theoreticalLeverage, v.exchangeMinLeverage);

  return {
    ok: true,
    value: {
      riskBudgetINR,
      riskBudgetUSD,
      maxContracts,
      premiumUSD: v.premiumUSD,
      positionNotionalUSD,
      feeBreakdown,
      totalFeesUSD,
      totalFeesINR,
      calculatedRiskUSD,
      calculatedRiskINR,
      optionCostUSD,
      theoreticalMaxProfitUSD,
      theoreticalMaxProfitINR,
      targetProfitUSD,
      targetProfitINR,
      targetExceedsTheoretical,
      marginUSD: v.marginUSD,
      theoreticalLeverage,
      exchangeMinLeverage: v.exchangeMinLeverage,
      minUsableLeverage,
    },
  };
}
