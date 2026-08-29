import { calculateDailyRisk, inrToUSD } from "./calculations";
import type { Calculation, MinLeverageCalculatorResult, MinLeverageCalculatorValues } from "../types";

/**
 * Minimum Leverage Calculator — combined-strangle RISK, LOT-SIZING, and
 * FEE engine only. Margin, leverage, straddle/strangle detection, max
 * profit/loss, and risk:reward all live in deltaMarginCalculations.ts,
 * which composes on top of this module's output rather than duplicating
 * it (see runDeltaMarginCalculation there).
 *
 * SEQUENCE (risk-based sizing happens BEFORE anything margin-related —
 * margin/leverage never influence lot sizing):
 *
 *   capital → Total Risk % → risk budget (₹ then $)
 *   → higher premium = losing leg (reaches stop loss)
 *     lower premium  = profit leg (reaches take profit)
 *   → gross loss = losingLeg SL loss − profitLeg TP profit
 *   → Delta Exchange fee for CALL + fee for PUT (see FEE METHODOLOGY)
 *   → maximum whole lots per leg where gross loss + both fees ≤ risk budget
 *   → combined lots = lots per leg × 2
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
  if (!Number.isFinite(v.contractSize) || v.contractSize <= 0) return "Enter a valid contract size.";
  if (!Number.isFinite(v.btcIndexPriceUSD) || v.btcIndexPriceUSD <= 0) return "Enter a valid BTC index price.";
  if (!Number.isFinite(v.feeRatePct) || v.feeRatePct < 0) return "Enter a valid fee rate.";
  if (!Number.isFinite(v.premiumCapPct) || v.premiumCapPct < 0) return "Enter a valid premium cap.";
  if (!Number.isFinite(v.gstPct) || v.gstPct < 0) return "Enter a valid GST %.";
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
    },
  };
}
