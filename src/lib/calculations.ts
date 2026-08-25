import type {
  Calculation,
  LotsCalculatorResult,
  LotsCalculatorValues,
  PremiumCalculatorResult,
  PremiumCalculatorValues,
} from "../types";

/* ────────────────────────────────────────────────────────────────────────
   Low-level building blocks — each does exactly one calculation step.
   ──────────────────────────────────────────────────────────────────────── */

export function calculateDailyRisk(capital: number, riskPct: number): number {
  return capital * (riskPct / 100);
}

export function calculateTradingLossBudgetINR(dailyRiskINR: number, feesINR: number): number {
  return dailyRiskINR - feesINR;
}

export function inrToUSD(amountINR: number, usdInr: number): number {
  return amountINR / usdInr;
}

export function calculateBTCQuantity(contracts: number, contractSize: number): number {
  return contracts * contractSize;
}

export function calculatePremiumPerLeg(budgetUSD: number, stopLossPct: number, btcQty: number): number {
  return budgetUSD / ((stopLossPct / 100) * btcQty);
}

export function calculateMaxContracts(
  budgetUSD: number,
  premiumUSD: number,
  stopLossPct: number,
  contractSize: number
): number {
  const slLossPerBTC = premiumUSD * (stopLossPct / 100);
  const maxBTC = budgetUSD / slLossPerBTC;
  return Math.floor(maxBTC / contractSize);
}

export function calculateTakeProfitLevel(premiumUSD: number, takeProfitPct: number): number {
  return premiumUSD * (takeProfitPct / 100);
}

export function calculateStopLossLevel(premiumUSD: number, stopLossPct: number): number {
  return premiumUSD * (stopLossPct / 100);
}

export function calculateMaxLossAtSL(stopLossLevelUSD: number, btcQty: number): number {
  return stopLossLevelUSD * btcQty;
}

/* ────────────────────────────────────────────────────────────────────────
   Shared input validation
   ──────────────────────────────────────────────────────────────────────── */

function validateCommon(
  capital: number,
  riskPct: number,
  fees: number,
  stopLossPct: number,
  usdInr: number
): string | null {
  if (!Number.isFinite(capital) || capital <= 0) return "Enter a valid capital amount.";
  if (!Number.isFinite(riskPct) || riskPct <= 0) return "Enter a valid risk %.";
  if (!Number.isFinite(fees) || fees < 0) return "Enter a valid fees amount.";
  if (!Number.isFinite(stopLossPct) || stopLossPct <= 0) return "Enter a valid stop loss %.";
  if (!Number.isFinite(usdInr) || usdInr <= 0) return "Enter a valid USD/INR rate.";

  const dailyRiskINR = calculateDailyRisk(capital, riskPct);
  if (dailyRiskINR <= fees) return "Fees exceed the available daily risk budget.";

  return null;
}

/* ────────────────────────────────────────────────────────────────────────
   Calculator 1 — Premium per leg
   ──────────────────────────────────────────────────────────────────────── */

export function runPremiumCalculator(v: PremiumCalculatorValues): Calculation<PremiumCalculatorResult> {
  const commonError = validateCommon(v.capital, v.riskPct, v.fees, v.stopLossPct, v.usdInr);
  if (commonError) return { ok: false, error: commonError };

  if (!Number.isFinite(v.contracts) || v.contracts <= 0) {
    return { ok: false, error: "Enter a valid contract quantity." };
  }
  if (!Number.isFinite(v.contractSize) || v.contractSize <= 0) {
    return { ok: false, error: "Enter a valid contract size." };
  }
  if (!Number.isFinite(v.takeProfitPct) || v.takeProfitPct <= 0) {
    return { ok: false, error: "Enter a valid take profit %." };
  }

  const dailyRiskINR = calculateDailyRisk(v.capital, v.riskPct);
  const budgetINR = calculateTradingLossBudgetINR(dailyRiskINR, v.fees);
  const budgetUSD = inrToUSD(budgetINR, v.usdInr);
  const btcQty = calculateBTCQuantity(v.contracts, v.contractSize);
  const premiumUSD = calculatePremiumPerLeg(budgetUSD, v.stopLossPct, btcQty);

  if (!Number.isFinite(premiumUSD) || premiumUSD <= 0) {
    return { ok: false, error: "Inputs produce an invalid premium — check contract size and stop loss %." };
  }

  const premiumINR = premiumUSD * v.usdInr;
  const tpLevelUSD = calculateTakeProfitLevel(premiumUSD, v.takeProfitPct);
  const slLevelUSD = calculateStopLossLevel(premiumUSD, v.stopLossPct);
  const maxLossUSD = calculateMaxLossAtSL(slLevelUSD, btcQty);

  return {
    ok: true,
    value: { dailyRiskINR, budgetINR, budgetUSD, btcQty, premiumUSD, premiumINR, tpLevelUSD, slLevelUSD, maxLossUSD },
  };
}

/* ────────────────────────────────────────────────────────────────────────
   Calculator 2 — Max contracts per leg
   ──────────────────────────────────────────────────────────────────────── */

export function runLotsCalculator(v: LotsCalculatorValues): Calculation<LotsCalculatorResult> {
  const commonError = validateCommon(v.capital, v.riskPct, v.fees, v.stopLossPct, v.usdInr);
  if (commonError) return { ok: false, error: commonError };

  if (!Number.isFinite(v.premiumUSD) || v.premiumUSD <= 0) {
    return { ok: false, error: "Enter a valid premium." };
  }
  if (!Number.isFinite(v.contractSize) || v.contractSize <= 0) {
    return { ok: false, error: "Enter a valid contract size." };
  }
  if (!Number.isFinite(v.takeProfitPct) || v.takeProfitPct <= 0) {
    return { ok: false, error: "Enter a valid take profit %." };
  }

  const dailyRiskINR = calculateDailyRisk(v.capital, v.riskPct);
  const budgetINR = calculateTradingLossBudgetINR(dailyRiskINR, v.fees);
  const budgetUSD = inrToUSD(budgetINR, v.usdInr);
  const maxContracts = calculateMaxContracts(budgetUSD, v.premiumUSD, v.stopLossPct, v.contractSize);

  if (!Number.isFinite(maxContracts) || maxContracts <= 0) {
    return {
      ok: false,
      error: "Risk budget is too small for this premium and stop loss. Try a smaller stop loss % or higher capital.",
    };
  }

  const btcQty = calculateBTCQuantity(maxContracts, v.contractSize);
  const tpLevelUSD = calculateTakeProfitLevel(v.premiumUSD, v.takeProfitPct);
  const slLevelUSD = calculateStopLossLevel(v.premiumUSD, v.stopLossPct);

  return {
    ok: true,
    value: { dailyRiskINR, budgetINR, budgetUSD, maxContracts, btcQty, premiumUSD: v.premiumUSD, tpLevelUSD, slLevelUSD },
  };
}
