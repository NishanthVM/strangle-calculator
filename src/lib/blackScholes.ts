/**
 * Standard Black-Scholes European option pricing (r = 0).
 *
 * This is the well-known textbook formula, not something specific to
 * Delta Exchange — used here purely as the repricing engine for Delta's
 * documented portfolio-margin stress-test scenarios (see
 * deltaPortfolioMargin.ts), which require repricing each leg under
 * shocked spot price and implied volatility.
 *
 * Risk-free rate is assumed 0%, a standard simplification for short-dated
 * crypto derivatives margining and consistent with Delta's own examples,
 * which don't reference a discount rate. Not independently verified
 * against Delta's internal pricer — flagged here rather than presented
 * as exact.
 */

function erf(x: number): number {
  // Abramowitz & Stegun 7.1.26 approximation (~1.5e-7 max error) — standard, deterministic.
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

export function normCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

/**
 * European option price per unit of underlying (i.e. price "per BTC",
 * matching this app's premium convention — multiply by BTC quantity for
 * a position's total value).
 */
export function blackScholesPrice(
  spot: number,
  strike: number,
  timeToExpiryYears: number,
  volatility: number,
  isCall: boolean
): number {
  if (timeToExpiryYears <= 0) {
    return isCall ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);
  }
  const vol = volatility > 0 ? volatility : 0.0001; // guard against a zero/invalid IV blowing up d1/d2
  const sqrtT = Math.sqrt(timeToExpiryYears);
  const d1 = (Math.log(spot / strike) + 0.5 * vol * vol * timeToExpiryYears) / (vol * sqrtT);
  const d2 = d1 - vol * sqrtT;
  if (isCall) return spot * normCdf(d1) - strike * normCdf(d2);
  return strike * normCdf(-d2) - spot * normCdf(-d1);
}
