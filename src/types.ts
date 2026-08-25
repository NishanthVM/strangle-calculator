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
