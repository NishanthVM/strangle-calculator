/**
 * Domain types for the short-strangle position-sizing calculators.
 */

export type Theme = "light" | "dark";

/** Raw string form of every numeric input, as typed by the user. */
export interface PremiumCalculatorInputs {
  capital: string;
  riskPct: string;
  fees: string;
  stopLossPct: string;
  takeProfitPct: string;
  usdInr: string;
  contracts: string;
  contractSize: string;
  leverage: string;
}

export interface LotsCalculatorInputs {
  capital: string;
  riskPct: string;
  fees: string;
  premium: string;
  stopLossPct: string;
  takeProfitPct: string;
  usdInr: string;
  contractSize: string;
  leverage: string;
}

/** Parsed numeric form of PremiumCalculatorInputs, before validation. */
export interface PremiumCalculatorValues {
  capital: number;
  riskPct: number;
  fees: number;
  stopLossPct: number;
  takeProfitPct: number;
  usdInr: number;
  contracts: number;
  contractSize: number;
}

export interface LotsCalculatorValues {
  capital: number;
  riskPct: number;
  fees: number;
  premiumUSD: number;
  stopLossPct: number;
  takeProfitPct: number;
  usdInr: number;
  contractSize: number;
}

export interface PremiumCalculatorResult {
  dailyRiskINR: number;
  budgetINR: number;
  budgetUSD: number;
  btcQty: number;
  premiumUSD: number;
  premiumINR: number;
  tpLevelUSD: number;
  slLevelUSD: number;
  maxLossUSD: number;
}

export interface LotsCalculatorResult {
  dailyRiskINR: number;
  budgetINR: number;
  budgetUSD: number;
  maxContracts: number;
  btcQty: number;
  premiumUSD: number;
  tpLevelUSD: number;
  slLevelUSD: number;
}

/** Either a computed result or a validation error message — never both. */
export type Calculation<T> = { ok: true; value: T } | { ok: false; error: string };

/* ────────────────────────────────────────────────────────────────────────
   Minimum Leverage Calculator (additive — reuses calculateDailyRisk and
   inrToUSD from calculations.ts; does not affect the Premium or Lots
   calculators above).

   CRITICAL MODEL:
   - Total Risk % is the maximum NET loss for the ENTIRE two-leg strangle,
     not a per-leg budget.
   - The HIGHER-premium leg is deterministically treated as the losing
     leg (reaches stop loss); the LOWER-premium leg is the profit leg
     (reaches take profit).
   - Fees follow Delta Exchange's documented methodology: a % of order
     notional, capped at a % of the leg's premium value, plus GST —
     calculated separately for each leg, and recalculated at the actual
     lot count (not multiplied naively).
   - Capital determines risk and lots. Margin is completely independent
     of capital/risk and is used ONLY after lots are known.
   - Leverage is solved from Delta's documented Approximate Initial
     Margin formula (premium + underlying notional/leverage − OTM
     amount), NOT from premium exposure or notional/margin directly —
     the entered margin is treated as the target IM, and the calculator
     solves algebraically for the leverage that makes the combined IM
     equal to it. That's the theoretical bare-minimum leverage; the
     displayed usable leverage is never below the exchange's configured
     minimum.
   ──────────────────────────────────────────────────────────────────────── */

export interface MinLeverageCalculatorInputs {
  capital: string;
  callPremium: string;
  putPremium: string;
  riskPct: string;
  takeProfitPct: string;
  stopLossPct: string;
  usdInr: string;
  margin: string;
  contractSize: string;
  btcIndexPrice: string;
  callStrike: string;
  putStrike: string;
  feeRatePct: string;
  premiumCapPct: string;
  gstPct: string;
  exchangeMinLeverage: string;
}

export interface MinLeverageCalculatorValues {
  capital: number;
  callPremiumUSD: number;
  putPremiumUSD: number;
  riskPct: number;
  takeProfitPct: number;
  stopLossPct: number;
  usdInr: number;
  marginUSD: number;
  contractSize: number;
  btcIndexPriceUSD: number;
  callStrikeUSD: number;
  putStrikeUSD: number;
  feeRatePct: number;
  premiumCapPct: number;
  gstPct: number;
  exchangeMinLeverage: number;
}

export interface MinLeverageCalculatorResult {
  riskBudgetINR: number;
  riskBudgetUSD: number;
  /** true = CALL is the (higher-premium) losing leg; false = PUT is. */
  isCallLosingLeg: boolean;
  losingLegSLLossUSD: number;
  profitLegTPProfitUSD: number;
  grossLossUSD: number;
  callOrderNotionalUSD: number;
  putOrderNotionalUSD: number;
  callPercentageFeeUSD: number;
  putPercentageFeeUSD: number;
  callPremiumCapUSD: number;
  putPremiumCapUSD: number;
  callEffectiveFeeUSD: number;
  putEffectiveFeeUSD: number;
  callTotalFeeUSD: number;
  putTotalFeeUSD: number;
  totalFeeUSD: number;
  worstNetLossUSD: number;
  worstNetLossINR: number;
  riskUtilizationPct: number;
  maxContracts: number;
  totalContracts: number;
  // Delta Exchange Approximate IM formula components (per leg, at maxContracts):
  callPremiumComponentUSD: number;
  putPremiumComponentUSD: number;
  combinedPremiumComponentUSD: number;
  callUnderlyingNotionalUSD: number;
  putUnderlyingNotionalUSD: number;
  combinedUnderlyingNotionalUSD: number;
  callOTMAmountUSD: number;
  putOTMAmountUSD: number;
  combinedOTMAmountUSD: number;
  marginUSD: number;
  theoreticalLeverage: number;
  exchangeMinLeverage: number;
  minUsableLeverage: number;
  // Required margin (Delta IM) at the actual usable leverage, for display:
  callInitialMarginUSD: number;
  putInitialMarginUSD: number;
  combinedRequiredMarginUSD: number;
  isLowLeverage: boolean;
}
