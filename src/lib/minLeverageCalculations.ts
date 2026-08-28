import { calculateDailyRisk, inrToUSD } from "./calculations";
import type { Calculation, MinLeverageCalculatorResult, MinLeverageCalculatorValues } from "../types";

/**
 * Minimum Leverage Calculator — combined-strangle-risk, real Delta
 * Exchange fee methodology, and leverage solved from Delta's documented
 * Approximate Initial Margin formula.
 *
 * SEQUENCE (each step strictly separated — margin never influences risk
 * or lot sizing; leverage is calculated only after lots are known):
 *
 *   capital → Total Risk % → risk budget (₹ then $)
 *   → higher premium = losing leg (reaches stop loss)
 *     lower premium  = profit leg (reaches take profit)
 *   → gross loss = losingLeg SL loss − profitLeg TP profit
 *   → Delta Exchange fee for CALL + fee for PUT (see FEE METHODOLOGY)
 *   → maximum whole lots per leg where gross loss + both fees ≤ risk budget
 *   → combined lots = lots per leg × 2
 *   → Delta's Approximate IM formula per leg, combined, solved for the
 *     leverage at which combined IM = user-entered margin (see
 *     solveTheoreticalLeverage below)
 *   → minimum usable leverage = max(theoretical leverage, exchange minimum)
 *
 * RISK MODEL: a fixed rule, not a max()-of-two-scenarios approach — the
 * higher-premium leg is always modeled as the one that gets stopped out,
 * the lower-premium leg as the one taken at profit. Equal premiums
 * default to CALL as the losing leg.
 *
 * FEE METHODOLOGY (Delta Exchange's documented maker-fee structure for
 * BTC options, reproduced here from the user-supplied reference values —
 * not independently re-verified against live exchange docs, hence the
 * "Estimated" labeling in the UI and the fully editable rate/cap/GST
 * inputs):
 *   orderNotional     = contracts × contractSize × btcIndexPrice
 *   percentageFee      = orderNotional × feeRatePct / 100
 *   premiumCap          = premiumCapPct/100 × contracts × contractSize × premium
 *   effectiveFee         = MIN(percentageFee, premiumCap)
 *   totalFeeWithGST       = effectiveFee × (1 + gstPct/100)
 * computed separately for CALL and PUT, then summed.
 *
 * LEVERAGE: solved from Delta's documented Approximate IM formula (see
 * solveTheoreticalLeverage below), NOT from premium exposure or a plain
 * notional/margin ratio.
 *
 * LINEARITY NOTE: percentageFee and premiumCap are both linear in
 * contract count N with no offset (they're 0 at N=0), so MIN of two such
 * lines is itself linear in N for all N > 0 — whichever term has the
 * smaller per-contract slope determines the effective fee at every N.
 * Combined with gross loss also being linear in N, "largest N with
 * total ≤ budget" reduces to a single division; no iterative or
 * binary search is mathematically necessary here, even though the
 * MIN() makes the fee formula piecewise on its face.
 */

export function calculateOrderNotional(contracts: number, contractSize: number, btcIndexPriceUSD: number): number {
  return contracts * contractSize * btcIndexPriceUSD;
}

export function calculatePercentageFee(orderNotionalUSD: number, feeRatePct: number): number {
  return orderNotionalUSD * (feeRatePct / 100);
}

export function calculatePremiumCap(
  premiumCapPct: number,
  contracts: number,
  contractSize: number,
  premiumUSD: number
): number {
  return (premiumCapPct / 100) * contracts * contractSize * premiumUSD;
}

export function calculateEffectiveFee(percentageFeeUSD: number, premiumCapUSD: number): number {
  return Math.min(percentageFeeUSD, premiumCapUSD);
}

export function calculateTotalFeeWithGST(effectiveFeeUSD: number, gstPct: number): number {
  return effectiveFeeUSD * (1 + gstPct / 100);
}

/** Full Delta-methodology fee for one leg, for a given contract count. */
function legFee(
  contracts: number,
  contractSize: number,
  btcIndexPriceUSD: number,
  premiumUSD: number,
  feeRatePct: number,
  premiumCapPct: number,
  gstPct: number
) {
  const orderNotionalUSD = calculateOrderNotional(contracts, contractSize, btcIndexPriceUSD);
  const percentageFeeUSD = calculatePercentageFee(orderNotionalUSD, feeRatePct);
  const premiumCapUSD = calculatePremiumCap(premiumCapPct, contracts, contractSize, premiumUSD);
  const effectiveFeeUSD = calculateEffectiveFee(percentageFeeUSD, premiumCapUSD);
  const totalFeeUSD = calculateTotalFeeWithGST(effectiveFeeUSD, gstPct);
  return { orderNotionalUSD, percentageFeeUSD, premiumCapUSD, effectiveFeeUSD, totalFeeUSD };
}

/**
 * Delta Exchange's documented Approximate Initial Margin formula for
 * selling one option leg:
 *
 *   IM = premiumComponent + (underlyingNotional / leverage) − OTMAmount
 *
 * where premiumComponent = premium × contracts × contractSize, and
 * underlyingNotional = btcIndexPrice × contracts × contractSize (the
 * same notional convention as the fee calculation above).
 *
 * OTM AMOUNT: Delta's formula names this term but the reference material
 * available here only gives the per-BTC moneyness definition
 * (max(strike − price, 0) for a CALL, max(price − strike, 0) for a PUT),
 * not its exact scaling inside the IM formula. Since it must combine
 * additively with underlyingNotional (which IS scaled by contracts ×
 * contractSize), this implementation scales OTM the same way — that's
 * an explicit judgment call, not something quoted from Delta
 * documentation, and is called out here rather than presented as
 * verified.
 */
export function calculateOTMAmount(
  strikeUSD: number,
  btcIndexPriceUSD: number,
  isCall: boolean,
  contracts: number,
  contractSize: number
): number {
  const otmPerBTC = isCall ? Math.max(strikeUSD - btcIndexPriceUSD, 0) : Math.max(btcIndexPriceUSD - strikeUSD, 0);
  return otmPerBTC * contracts * contractSize;
}

/**
 * Solves Delta's Approximate IM formula for the combined two-leg
 * strangle: given the margin the user has entered (treated as the
 * target combined IM), what's the lowest leverage L where
 * combinedIM(L) ≤ marginEntered?
 *
 * combinedIM(L) = combinedPremiumComponent + combinedUnderlyingNotional/L − combinedOTMAmount
 *
 * combinedIM(L) is strictly decreasing in L (more leverage → less
 * margin required), so the boundary case combinedIM(L) = marginEntered
 * is exactly the bare-minimum leverage — solving directly:
 *
 *   L = combinedUnderlyingNotional / (marginEntered − combinedPremiumComponent + combinedOTMAmount)
 *
 * Returns null if the denominator isn't positive — meaning the entered
 * margin can't cover the position's premium/OTM terms at ANY leverage,
 * however high.
 */
export function solveTheoreticalLeverage(
  combinedUnderlyingNotionalUSD: number,
  combinedPremiumComponentUSD: number,
  combinedOTMAmountUSD: number,
  marginUSD: number
): number | null {
  const denominator = marginUSD - combinedPremiumComponentUSD + combinedOTMAmountUSD;
  if (denominator <= 0) return null;
  return combinedUnderlyingNotionalUSD / denominator;
}

/** Delta's Approximate IM for one leg, at a given leverage — used to display the margin actually required at the usable leverage. */
export function calculateLegInitialMargin(
  premiumComponentUSD: number,
  underlyingNotionalUSD: number,
  otmAmountUSD: number,
  leverage: number
): number {
  return premiumComponentUSD + underlyingNotionalUSD / leverage - otmAmountUSD;
}

export function calculateMinUsableLeverage(theoreticalLeverage: number, exchangeMinLeverage: number): number {
  return Math.max(theoreticalLeverage, exchangeMinLeverage);
}

export function calculateRiskUtilizationPct(worstNetLossUSD: number, budgetUSD: number): number {
  return (worstNetLossUSD / budgetUSD) * 100;
}

function validateInputs(v: MinLeverageCalculatorValues): string | null {
  if (!Number.isFinite(v.capital) || v.capital <= 0) return "Enter a valid capital amount.";
  if (
    !Number.isFinite(v.callPremiumUSD) ||
    v.callPremiumUSD <= 0 ||
    !Number.isFinite(v.putPremiumUSD) ||
    v.putPremiumUSD <= 0
  ) {
    return "Enter valid CALL and PUT premiums.";
  }
  if (!Number.isFinite(v.riskPct) || v.riskPct <= 0) return "Enter a valid risk %.";
  if (!Number.isFinite(v.takeProfitPct) || v.takeProfitPct <= 0) return "Enter a valid take profit %.";
  if (!Number.isFinite(v.stopLossPct) || v.stopLossPct <= 0) return "Enter a valid stop loss %.";
  if (!Number.isFinite(v.usdInr) || v.usdInr <= 0) return "Enter a valid USD/INR rate.";
  if (!Number.isFinite(v.marginUSD) || v.marginUSD <= 0) return "Enter a valid margin.";
  if (!Number.isFinite(v.contractSize) || v.contractSize <= 0) return "Enter a valid contract size.";
  if (!Number.isFinite(v.btcIndexPriceUSD) || v.btcIndexPriceUSD <= 0) return "Enter a valid BTC index price.";
  if (!Number.isFinite(v.callStrikeUSD) || v.callStrikeUSD <= 0) return "Enter a valid CALL strike price.";
  if (!Number.isFinite(v.putStrikeUSD) || v.putStrikeUSD <= 0) return "Enter a valid PUT strike price.";
  if (!Number.isFinite(v.feeRatePct) || v.feeRatePct < 0) return "Enter a valid fee rate.";
  if (!Number.isFinite(v.premiumCapPct) || v.premiumCapPct < 0) return "Enter a valid premium cap.";
  if (!Number.isFinite(v.gstPct) || v.gstPct < 0) return "Enter a valid GST %.";
  if (!Number.isFinite(v.exchangeMinLeverage) || v.exchangeMinLeverage <= 0) {
    return "Enter a valid exchange minimum leverage.";
  }
  return null;
}

export function runMinLeverageCalculator(v: MinLeverageCalculatorValues): Calculation<MinLeverageCalculatorResult> {
  const error = validateInputs(v);
  if (error) return { ok: false, error };

  const riskBudgetINR = calculateDailyRisk(v.capital, v.riskPct); // "Maximum Total Risk ₹" for the combined strangle
  const riskBudgetUSD = inrToUSD(riskBudgetINR, v.usdInr);

  // Higher premium = losing leg (reaches SL); lower premium = profit leg (reaches TP). Tie → CALL loses.
  const isCallLosingLeg = v.callPremiumUSD >= v.putPremiumUSD;
  const losingPremiumUSD = isCallLosingLeg ? v.callPremiumUSD : v.putPremiumUSD;
  const profitPremiumUSD = isCallLosingLeg ? v.putPremiumUSD : v.callPremiumUSD;

  const losingLegSLLossPerBTC = losingPremiumUSD * (v.stopLossPct / 100);
  const profitLegTPProfitPerBTC = profitPremiumUSD * (v.takeProfitPct / 100);
  const grossLossPerBTC = losingLegSLLossPerBTC - profitLegTPProfitPerBTC;
  const grossLossPerContract = grossLossPerBTC * v.contractSize;

  // Per-1-contract fee figures (linear coefficients — see LINEARITY NOTE above).
  const callFeeAt1 = legFee(1, v.contractSize, v.btcIndexPriceUSD, v.callPremiumUSD, v.feeRatePct, v.premiumCapPct, v.gstPct);
  const putFeeAt1 = legFee(1, v.contractSize, v.btcIndexPriceUSD, v.putPremiumUSD, v.feeRatePct, v.premiumCapPct, v.gstPct);
  const feePerContract = callFeeAt1.totalFeeUSD + putFeeAt1.totalFeeUSD;

  const worstNetLossPerContract = grossLossPerContract + feePerContract;

  if (worstNetLossPerContract <= 0) {
    return {
      ok: false,
      error: "Selected stop loss / take profit / premium values don't produce a worst-case loss — check your inputs.",
    };
  }

  if (feePerContract >= riskBudgetUSD) {
    return { ok: false, error: "Fees exceed the available total strangle risk budget." };
  }

  const maxContracts = Math.floor(riskBudgetUSD / worstNetLossPerContract);
  if (!Number.isFinite(maxContracts) || maxContracts < 1) {
    return { ok: false, error: "Risk budget is insufficient for 1 contract per leg." };
  }

  // Recompute fee figures at the actual contract count for accurate display (fee is linear, but
  // we recompute via the real function rather than multiplying to keep the display path honest).
  const callFee = legFee(
    maxContracts,
    v.contractSize,
    v.btcIndexPriceUSD,
    v.callPremiumUSD,
    v.feeRatePct,
    v.premiumCapPct,
    v.gstPct
  );
  const putFee = legFee(
    maxContracts,
    v.contractSize,
    v.btcIndexPriceUSD,
    v.putPremiumUSD,
    v.feeRatePct,
    v.premiumCapPct,
    v.gstPct
  );
  const totalFeeUSD = callFee.totalFeeUSD + putFee.totalFeeUSD;

  const grossLossUSD = grossLossPerContract * maxContracts;
  const worstNetLossUSD = grossLossUSD + totalFeeUSD;
  const worstNetLossINR = worstNetLossUSD * v.usdInr;
  const riskUtilizationPct = calculateRiskUtilizationPct(worstNetLossUSD, riskBudgetUSD);

  const totalContracts = maxContracts * 2; // combined lots (CALL leg + PUT leg)

  const callPremiumComponentUSD = v.callPremiumUSD * maxContracts * v.contractSize;
  const putPremiumComponentUSD = v.putPremiumUSD * maxContracts * v.contractSize;
  const combinedPremiumComponentUSD = callPremiumComponentUSD + putPremiumComponentUSD;

  const callUnderlyingNotionalUSD = v.btcIndexPriceUSD * maxContracts * v.contractSize;
  const putUnderlyingNotionalUSD = v.btcIndexPriceUSD * maxContracts * v.contractSize;
  const combinedUnderlyingNotionalUSD = callUnderlyingNotionalUSD + putUnderlyingNotionalUSD;

  const callOTMAmountUSD = calculateOTMAmount(v.callStrikeUSD, v.btcIndexPriceUSD, true, maxContracts, v.contractSize);
  const putOTMAmountUSD = calculateOTMAmount(v.putStrikeUSD, v.btcIndexPriceUSD, false, maxContracts, v.contractSize);
  const combinedOTMAmountUSD = callOTMAmountUSD + putOTMAmountUSD;

  const theoreticalLeverage = solveTheoreticalLeverage(
    combinedUnderlyingNotionalUSD,
    combinedPremiumComponentUSD,
    combinedOTMAmountUSD,
    v.marginUSD
  );

  if (theoreticalLeverage === null) {
    return {
      ok: false,
      error: "Entered margin can't cover this position's premium/OTM requirement at any leverage — increase margin.",
    };
  }

  const minUsableLeverage = calculateMinUsableLeverage(theoreticalLeverage, v.exchangeMinLeverage);
  const isLowLeverage = theoreticalLeverage < 1;

  const callInitialMarginUSD = calculateLegInitialMargin(
    callPremiumComponentUSD,
    callUnderlyingNotionalUSD,
    callOTMAmountUSD,
    minUsableLeverage
  );
  const putInitialMarginUSD = calculateLegInitialMargin(
    putPremiumComponentUSD,
    putUnderlyingNotionalUSD,
    putOTMAmountUSD,
    minUsableLeverage
  );
  const combinedRequiredMarginUSD = callInitialMarginUSD + putInitialMarginUSD;

  return {
    ok: true,
    value: {
      riskBudgetINR,
      riskBudgetUSD,
      isCallLosingLeg,
      losingLegSLLossUSD: losingLegSLLossPerBTC * maxContracts * v.contractSize,
      profitLegTPProfitUSD: profitLegTPProfitPerBTC * maxContracts * v.contractSize,
      grossLossUSD,
      callOrderNotionalUSD: callFee.orderNotionalUSD,
      putOrderNotionalUSD: putFee.orderNotionalUSD,
      callPercentageFeeUSD: callFee.percentageFeeUSD,
      putPercentageFeeUSD: putFee.percentageFeeUSD,
      callPremiumCapUSD: callFee.premiumCapUSD,
      putPremiumCapUSD: putFee.premiumCapUSD,
      callEffectiveFeeUSD: callFee.effectiveFeeUSD,
      putEffectiveFeeUSD: putFee.effectiveFeeUSD,
      callTotalFeeUSD: callFee.totalFeeUSD,
      putTotalFeeUSD: putFee.totalFeeUSD,
      totalFeeUSD,
      worstNetLossUSD,
      worstNetLossINR,
      riskUtilizationPct,
      maxContracts,
      totalContracts,
      callPremiumComponentUSD,
      putPremiumComponentUSD,
      combinedPremiumComponentUSD,
      callUnderlyingNotionalUSD,
      putUnderlyingNotionalUSD,
      combinedUnderlyingNotionalUSD,
      callOTMAmountUSD,
      putOTMAmountUSD,
      combinedOTMAmountUSD,
      marginUSD: v.marginUSD,
      theoreticalLeverage,
      exchangeMinLeverage: v.exchangeMinLeverage,
      minUsableLeverage,
      callInitialMarginUSD,
      putInitialMarginUSD,
      combinedRequiredMarginUSD,
      isLowLeverage,
    },
  };
}
