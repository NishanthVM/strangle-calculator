import { blackScholesPrice } from "./blackScholes";

/**
 * Delta Exchange India's documented Portfolio Margin methodology, for a
 * two-leg short strangle/straddle (short CALL + short PUT).
 *
 * SOURCE: guides.delta.exchange/delta-exchange-india-user-guide/
 * trading-guide/margin-explainer/portfolio-margin — fetched and read in
 * full while building this file. Every constant and formula below
 * (shock span tables, IV max up/down formula, the 29-scenario grid
 * including the two extreme 300%-price / 1/3-weighted scenarios, and the
 * margin-floor Base%/Base-Notional/Slope/Cap parameters) is quoted
 * directly from that documentation, not invented or approximated.
 *
 * Margin = max(Risk Margin, Margin Floor)
 */

const BTC_MARGIN_FLOOR_PARAMS = {
  basePct: 0.005, // 0.5%
  baseNotionalUSD: 200000,
  slope: 0.000000005, // "0.0000005%" expressed as a decimal fraction
  capPct: 0.02, // 2%
};

export function priceShockSpan(notionalUSD: number): number {
  if (notionalUSD <= 100000) return 0.01;
  if (notionalUSD <= 2350000) return 0.01 + 0.00000004 * (notionalUSD - 100000);
  return 0.1;
}

export function volDownShockSpan(notionalUSD: number): number {
  if (notionalUSD <= 100000) return 0.06;
  if (notionalUSD <= 2100000) return 0.06 + 0.00000012 * (notionalUSD - 100000);
  return 0.3;
}

export function volUpShockSpan(notionalUSD: number): number {
  if (notionalUSD <= 100000) return 0.09;
  if (notionalUSD <= 2100000) return 0.09 + 0.00000018 * (notionalUSD - 100000);
  return 0.45;
}

/** IV max up/down = shock span x (30/DTE)^0.30 -- Delta's documented formula. */
export function ivShockAmount(volShockSpan: number, dteInDays: number): number {
  const safeDte = Math.max(dteInDays, 1 / (24 * 60)); // guard against divide-by-zero in the final minute of expiry
  return volShockSpan * Math.pow(30 / safeDte, 0.3);
}

/**
 * The last-30-minutes expiry-day position-size reduction Delta's docs
 * describe qualitatively ("30-min TWAP settlement... results in linear
 * reduction of delta risk exposures... in the 30 mins leading to
 * expiry"). Delta's public documentation doesn't publish the exact
 * formula, so this linear ramp (1.0 down to 0.0 over the final 30
 * minutes) is a reasonable modeling choice consistent with the
 * documented qualitative behavior -- not a quoted formula. Flagged in
 * the UI rather than presented as an exact exchange figure.
 */
export function expiryFactor(minutesToExpiry: number): number {
  if (minutesToExpiry > 30) return 1;
  if (minutesToExpiry <= 0) return 0;
  return minutesToExpiry / 30;
}

interface LegInput {
  strike: number;
  ivDecimal: number;
  qtyBTC: number;
}

export interface RiskMarginScenario {
  label: string;
  priceMovePct: number;
  ivState: "up" | "unchanged" | "down";
  loss: number;
}

export interface RiskMarginResult {
  riskMarginUSD: number;
  currentCombinedValueUSD: number;
  priceShockSpanPct: number;
  volUpShockSpanPct: number;
  volDownShockSpanPct: number;
  ivMaxUpPct: number;
  ivMaxDownPct: number;
  scenarioCount: number;
  worstScenario: RiskMarginScenario;
}

/**
 * Runs Delta's documented 29-scenario stress test for a short CALL +
 * short PUT portfolio and returns the maximum loss (Risk Margin).
 *
 * `effectiveQtyFactor` applies the same-day last-30-minutes size
 * reduction (see expiryFactor above) to both legs' quantities uniformly
 * -- pass 1 to skip it.
 */
export function computeRiskMargin(
  spot: number,
  call: LegInput,
  put: LegInput,
  dteInDays: number,
  effectiveQtyFactor: number
): RiskMarginResult {
  const combinedNotional = (call.qtyBTC + put.qtyBTC) * spot;
  const priceSpan = priceShockSpan(combinedNotional);
  const volUpSpan = volUpShockSpan(combinedNotional);
  const volDownSpan = volDownShockSpan(combinedNotional);
  const ivUp = ivShockAmount(volUpSpan, dteInDays);
  const ivDown = ivShockAmount(volDownSpan, dteInDays);
  const tYears = Math.max(dteInDays, 1 / (24 * 60)) / 365;

  const callQty = call.qtyBTC * effectiveQtyFactor;
  const putQty = put.qtyBTC * effectiveQtyFactor;

  const currentCallValue = blackScholesPrice(spot, call.strike, tYears, call.ivDecimal, true) * callQty;
  const currentPutValue = blackScholesPrice(spot, put.strike, tYears, put.ivDecimal, false) * putQty;
  const currentCombinedValueUSD = currentCallValue + currentPutValue;

  const priceSteps = [0, 0.33, 0.5, 0.67, 1.0];
  const scenarios: RiskMarginScenario[] = [];

  for (const step of priceSteps) {
    const directions = step === 0 ? [1] : [1, -1];
    for (const dir of directions) {
      const priceMovePct = dir * step * priceSpan;
      const shockedSpot = spot * (1 + priceMovePct);
      for (const ivState of ["up", "unchanged", "down"] as const) {
        const callVol =
          ivState === "up" ? call.ivDecimal + ivUp : ivState === "down" ? Math.max(call.ivDecimal - ivDown, 0.001) : call.ivDecimal;
        const putVol =
          ivState === "up" ? put.ivDecimal + ivUp : ivState === "down" ? Math.max(put.ivDecimal - ivDown, 0.001) : put.ivDecimal;
        const callVal = blackScholesPrice(shockedSpot, call.strike, tYears, callVol, true) * callQty;
        const putVal = blackScholesPrice(shockedSpot, put.strike, tYears, putVol, false) * putQty;
        // Short position: loses money when combined option value rises above current value.
        const loss = callVal + putVal - currentCombinedValueUSD;
        scenarios.push({
          label: `Price ${dir > 0 ? "+" : "-"}${(step * priceSpan * 100).toFixed(2)}%, IV ${ivState}`,
          priceMovePct,
          ivState,
          loss,
        });
      }
    }
  }

  // Extreme scenarios: 3x price span, IV up, only 1/3 of the resulting loss counted.
  for (const dir of [1, -1] as const) {
    const shockedSpot = spot * (1 + dir * 3 * priceSpan);
    const callVal = blackScholesPrice(shockedSpot, call.strike, tYears, call.ivDecimal + ivUp, true) * callQty;
    const putVal = blackScholesPrice(shockedSpot, put.strike, tYears, put.ivDecimal + ivUp, false) * putQty;
    const rawLoss = callVal + putVal - currentCombinedValueUSD;
    scenarios.push({
      label: `Extreme ${dir > 0 ? "up" : "down"} 300%, IV up (1/3 weighted)`,
      priceMovePct: dir * 3 * priceSpan,
      ivState: "up",
      loss: rawLoss / 3,
    });
  }

  let worstScenario = scenarios[0];
  for (const s of scenarios) if (s.loss > worstScenario.loss) worstScenario = s;
  const riskMarginUSD = Math.max(worstScenario.loss, 0);

  return {
    riskMarginUSD,
    currentCombinedValueUSD,
    priceShockSpanPct: priceSpan * 100,
    volUpShockSpanPct: volUpSpan * 100,
    volDownShockSpanPct: volDownSpan * 100,
    ivMaxUpPct: ivUp * 100,
    ivMaxDownPct: ivDown * 100,
    scenarioCount: scenarios.length,
    worstScenario,
  };
}

export interface MarginFloorLegResult {
  premiumValueUSD: number;
  notionalUSD: number;
  fivePctPremium: number;
  omPctTimesNotional: number;
  floorUSD: number;
}

export interface MarginFloorResult {
  omPct: number;
  aggregateShortNotionalUSD: number;
  call: MarginFloorLegResult;
  put: MarginFloorLegResult;
  totalFloorUSD: number;
}

/**
 * Margin Floor for short options (BTC): OM% is computed once off the
 * AGGREGATE short-options notional (both legs combined), then applied
 * per leg as max(5% x premium value, OM% x leg notional), summed.
 */
export function computeMarginFloor(
  callPremiumUSD: number,
  putPremiumUSD: number,
  callQtyBTC: number,
  putQtyBTC: number,
  spot: number
): MarginFloorResult {
  const callNotional = callQtyBTC * spot;
  const putNotional = putQtyBTC * spot;
  const aggregateShortNotionalUSD = callNotional + putNotional;

  const { basePct, baseNotionalUSD, slope, capPct } = BTC_MARGIN_FLOOR_PARAMS;
  let omPct = basePct;
  if (aggregateShortNotionalUSD > baseNotionalUSD) {
    omPct = basePct + slope * (aggregateShortNotionalUSD - baseNotionalUSD);
  }
  omPct = Math.min(omPct, capPct);

  const callPremiumValue = callPremiumUSD * callQtyBTC;
  const putPremiumValue = putPremiumUSD * putQtyBTC;

  const callFivePct = 0.05 * callPremiumValue;
  const callOmTimesNotional = omPct * callNotional;
  const putFivePct = 0.05 * putPremiumValue;
  const putOmTimesNotional = omPct * putNotional;

  const call: MarginFloorLegResult = {
    premiumValueUSD: callPremiumValue,
    notionalUSD: callNotional,
    fivePctPremium: callFivePct,
    omPctTimesNotional: callOmTimesNotional,
    floorUSD: Math.max(callFivePct, callOmTimesNotional),
  };
  const put: MarginFloorLegResult = {
    premiumValueUSD: putPremiumValue,
    notionalUSD: putNotional,
    fivePctPremium: putFivePct,
    omPctTimesNotional: putOmTimesNotional,
    floorUSD: Math.max(putFivePct, putOmTimesNotional),
  };

  return { omPct: omPct * 100, aggregateShortNotionalUSD, call, put, totalFloorUSD: call.floorUSD + put.floorUSD };
}
