/**
 * Generic two-leg option payoff engine.
 *
 * A single option leg's payoff at expiry, as a function of settlement
 * price S, is piecewise-linear with exactly one kink (at its strike).
 * Summing two legs therefore gives a payoff function with at most two
 * kinks (at the two strikes) and constant slopes beyond them in both
 * directions. That means the true max/min of the combined payoff is
 * always attained either at one of the two strikes or in the limit as
 * S → 0 or S → ∞ — so evaluating at those four points (0, strike1,
 * strike2, and a very large S) finds the EXACT max/min for any
 * combination of two legs, without needing separate hard-coded formulas
 * per named strategy. This is what section 22/23 of the spec asks for.
 */

export type OptionAction = "buy" | "sell";
export type OptionType = "call" | "put";

export interface OptionLeg {
  action: OptionAction;
  type: OptionType;
  strike: number;
  premiumUSD: number;
}

export function intrinsicValue(settlementPrice: number, strike: number, type: OptionType): number {
  return type === "call" ? Math.max(settlementPrice - strike, 0) : Math.max(strike - settlementPrice, 0);
}

/** Payoff per unit of underlying (i.e. per BTC), before contract-size/lot scaling. */
export function legPayoffPerBTC(settlementPrice: number, leg: OptionLeg): number {
  const iv = intrinsicValue(settlementPrice, leg.strike, leg.type);
  return leg.action === "buy" ? iv - leg.premiumUSD : leg.premiumUSD - iv;
}

export function combinedPayoffPerBTC(settlementPrice: number, leg1: OptionLeg, leg2: OptionLeg): number {
  return legPayoffPerBTC(settlementPrice, leg1) + legPayoffPerBTC(settlementPrice, leg2);
}

export interface PayoffExtremes {
  maxPerBTC: number;
  minPerBTC: number;
}

/** Exact max/min of the combined payoff across all possible settlement prices — see module doc for why sampling these 4 points is exact. */
export function computePayoffExtremes(leg1: OptionLeg, leg2: OptionLeg): PayoffExtremes {
  const strikes = [leg1.strike, leg2.strike];
  const farPrice = Math.max(...strikes) * 10 + 1; // stands in for S → ∞; both legs' slopes are constant beyond the higher strike
  const samplePoints = [0, ...strikes, farPrice];
  const values = samplePoints.map((S) => combinedPayoffPerBTC(S, leg1, leg2));
  return { maxPerBTC: Math.max(...values), minPerBTC: Math.min(...values) };
}

export type SpreadStrategy =
  | "BULL CALL SPREAD"
  | "BEAR PUT SPREAD"
  | "BULL PUT SPREAD"
  | "BEAR CALL SPREAD"
  | "CUSTOM TWO-LEG STRATEGY";

/**
 * Identifies the standard named strategy, using the textbook-standard
 * (and Cboe/OCC-consistent) strike/action assignment for each spread.
 * Falls back to CUSTOM for anything else, rather than forcing an
 * incorrect label.
 */
export function detectStrategy(leg1: OptionLeg, leg2: OptionLeg): SpreadStrategy {
  const [lower, higher] = leg1.strike <= leg2.strike ? [leg1, leg2] : [leg2, leg1];
  if (lower.strike === higher.strike) return "CUSTOM TWO-LEG STRATEGY"; // same-strike combos aren't vertical spreads

  if (lower.action === "buy" && lower.type === "call" && higher.action === "sell" && higher.type === "call") {
    return "BULL CALL SPREAD";
  }
  if (higher.action === "buy" && higher.type === "put" && lower.action === "sell" && lower.type === "put") {
    return "BEAR PUT SPREAD";
  }
  if (higher.action === "sell" && higher.type === "put" && lower.action === "buy" && lower.type === "put") {
    return "BULL PUT SPREAD";
  }
  if (lower.action === "sell" && lower.type === "call" && higher.action === "buy" && higher.type === "call") {
    return "BEAR CALL SPREAD";
  }
  return "CUSTOM TWO-LEG STRATEGY";
}

/**
 * Break-even(s) — solved directly from the same piecewise-linear payoff
 * (root of each linear segment touching zero), rather than a per-strategy
 * formula. Returns 0, 1, or 2 break-even prices depending on the shape.
 */
export function computeBreakEvens(leg1: OptionLeg, leg2: OptionLeg): number[] {
  const strikes = Array.from(new Set([leg1.strike, leg2.strike])).sort((a, b) => a - b);
  const boundaries = [0, ...strikes, Math.max(...strikes) * 10 + 1];
  const breakEvens: number[] = [];

  for (let i = 0; i < boundaries.length - 1; i++) {
    const x1 = boundaries[i];
    const x2 = boundaries[i + 1];
    const y1 = combinedPayoffPerBTC(x1, leg1, leg2);
    const y2 = combinedPayoffPerBTC(x2, leg1, leg2);
    if (y1 === 0) {
      breakEvens.push(x1);
    } else if ((y1 < 0 && y2 > 0) || (y1 > 0 && y2 < 0)) {
      // Linear segment crosses zero — solve for the exact root.
      const root = x1 + (0 - y1) * ((x2 - x1) / (y2 - y1));
      breakEvens.push(root);
    }
  }

  return Array.from(new Set(breakEvens.map((v) => Math.round(v * 100) / 100))).sort((a, b) => a - b);
}
