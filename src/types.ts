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
   Minimum Leverage Calculator — RISK / LOT-SIZING / FEE engine (additive
   — reuses calculateDailyRisk and inrToUSD from calculations.ts; does
   not affect the Premium or Lots calculators above).

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
   - Capital determines risk and lots. Margin, leverage, and Delta's
     actual margin methodology are handled separately by
     DeltaMarginCalculator (below) — this type has no margin-related
     fields at all.
   ──────────────────────────────────────────────────────────────────────── */

export interface MinLeverageCalculatorInputs {
  capital: string;
  callPremium: string;
  putPremium: string;
  riskPct: string;
  takeProfitPct: string;
  stopLossPct: string;
  usdInr: string;
  contractSize: string;
  btcIndexPrice: string;
  feeRatePct: string;
  premiumCapPct: string;
  gstPct: string;
}

export interface MinLeverageCalculatorValues {
  capital: number;
  callPremiumUSD: number;
  putPremiumUSD: number;
  riskPct: number;
  takeProfitPct: number;
  stopLossPct: number;
  usdInr: number;
  contractSize: number;
  btcIndexPriceUSD: number;
  feeRatePct: number;
  premiumCapPct: number;
  gstPct: number;
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
}

/* ────────────────────────────────────────────────────────────────────────
   Delta Exchange Margin Calculator — margin (isolated or portfolio),
   leverage, strategy identification (strangle/straddle), max profit/
   loss, risk:reward, and break-even. Composes on top of
   MinLeverageCalculatorResult (the lots/fees it needs) rather than
   recomputing them.

   Verified against guides.delta.exchange/delta-exchange-india-user-guide
   (Margin Explainer / Isolated Margin / Portfolio Margin pages, fetched
   directly while building this):
   - Isolated Margin: IM = InitialMargin% × Contracts × Multiplier × Price.
     InitialMargin% is genuinely per-contract/position-size-tier (not a
     single public constant), so it's exposed here as a labeled,
     user-editable parameter rather than invented.
   - Portfolio Margin: Margin = max(Risk Margin, Margin Floor). Risk
     Margin is Delta's documented 29-scenario price/IV stress test
     (see deltaPortfolioMargin.ts); Margin Floor uses Delta's published
     BTC parameters (Base% 0.5%, Base Notional $200,000, Slope
     0.0000005%, Cap 2%).
   - Leverage: Theoretical Required Leverage = Combined Position Notional
     ÷ Margin — Delta's margin formulas don't parameterize margin BY
     leverage the way an earlier (unverified) formula in this project
     assumed, so this is a direct ratio, not a solved equation.
   ──────────────────────────────────────────────────────────────────────── */

export type MarginMode = "isolated" | "portfolio";

export interface DeltaMarginCalculatorInputs {
  margin: string;
  marginMode: MarginMode;
  isolatedMarginPct: string;
  callStrike: string;
  putStrike: string;
  exchangeMinLeverage: string;
  /** Manual fallback when no live expiry timestamp is available from the option chain. */
  manualDaysToExpiry: string;
}

export interface DeltaMarginCalculatorValues {
  marginUSD: number;
  marginMode: MarginMode;
  isolatedMarginPct: number;
  callStrikeUSD: number;
  putStrikeUSD: number;
  exchangeMinLeverage: number;
  btcIndexPriceUSD: number;
  contractSize: number;
  usdInr: number;
  callPremiumUSD: number;
  putPremiumUSD: number;
  /** Live implied vol (%) per leg, from the option chain — undefined if unavailable, in which case Risk Margin can't be computed. */
  callIvPct: number | undefined;
  putIvPct: number | undefined;
  /** Precise settlement timestamp from the live chain, if known. */
  expirySettlementMs: number | null;
  manualDaysToExpiry: number;
  nowMs: number;
}

export interface DeltaMarginResult {
  strategy: "SHORT STRANGLE" | "SHORT STRADDLE";
  isSameDayExpiry: boolean;
  daysToExpiry: number;
  minutesToExpiry: number | null;
  expiryFactor: number;

  // Maximum profit
  maxGrossProfitUSD: number;
  maxNetProfitUSD: number;
  maxNetProfitINR: number;

  // Maximum planned loss (reuses the risk engine's worst-net-loss figures)
  maxPlannedLossUSD: number;
  maxPlannedLossINR: number;

  // Risk:reward
  rewardMultiple: number;

  // Break-even
  upperBreakEvenUSD: number;
  lowerBreakEvenUSD: number;

  // Margin
  callRequiredMarginUSD: number | null;
  putRequiredMarginUSD: number | null;
  combinedRequiredMarginUSD: number;
  marginIsEstimate: true;
  riskMarginUSD: number | null; // portfolio mode only
  marginFloorUSD: number | null; // portfolio mode only
  riskMarginUnavailableReason: string | null; // e.g. missing live IV

  // Leverage
  combinedPositionNotionalUSD: number;
  theoreticalLeverage: number;
  exchangeMinLeverage: number;
  minUsableLeverage: number;
}
