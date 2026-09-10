import { runMinLeverageCalculator } from "./minLeverageCalculations";
import { runDeltaMarginCalculation } from "./deltaMarginCalculations";
import type { Calculation, MinLeverageCalculatorValues, DeltaMarginCalculatorValues } from "../types";

/**
 * Live Trade Execution reuses the EXACT SAME two functions the
 * Minimum Leverage Calculator page uses — runMinLeverageCalculator for
 * risk/lots/fees, then runDeltaMarginCalculation composed on top for
 * margin/leverage/strategy/profit/loss. No formula is duplicated here;
 * this module only wires the two calls together and adds the
 * Leverage Buffer step, which belongs to live execution specifically
 * (the sizing calculators have no concept of an execution buffer).
 */

export interface LiveTradeCalcInput {
  risk: MinLeverageCalculatorValues;
  margin: DeltaMarginCalculatorValues;
  /** Extra leverage added on top of the calculated minimum, before execution. Default 3. */
  leverageBufferX: number;
}

export interface LiveTradeCalcResult {
  maxContracts: number;
  totalContracts: number;
  worstNetLossUSD: number;
  worstNetLossINR: number;
  totalFeeUSD: number;
  calculatedLeverage: number; // minUsableLeverage from the existing engine
  leverageBufferX: number;
  totalLeverage: number; // calculatedLeverage + leverageBufferX
  strategy: "SHORT STRANGLE" | "SHORT STRADDLE";
  maxNetProfitUSD: number;
  maxNetProfitINR: number;
  maxPlannedLossUSD: number;
  maxPlannedLossINR: number;
  upperBreakEvenUSD: number;
  lowerBreakEvenUSD: number;
  isSameDayExpiry: boolean;
  minutesToExpiry: number | null;
}

export function runLiveTradeCalculation(
  input: LiveTradeCalcInput
): Calculation<LiveTradeCalcResult> {
  const riskResult = runMinLeverageCalculator(input.risk);
  if (!riskResult.ok) return riskResult;

  const marginResult = runDeltaMarginCalculation(riskResult.value, input.margin);
  if (!marginResult.ok) return marginResult;

  const calculatedLeverage = marginResult.value.minUsableLeverage;
  const totalLeverage = calculatedLeverage + input.leverageBufferX;

  return {
    ok: true,
    value: {
      maxContracts: riskResult.value.maxContracts,
      totalContracts: riskResult.value.totalContracts,
      worstNetLossUSD: riskResult.value.worstNetLossUSD,
      worstNetLossINR: riskResult.value.worstNetLossINR,
      totalFeeUSD: riskResult.value.totalFeeUSD,
      calculatedLeverage,
      leverageBufferX: input.leverageBufferX,
      totalLeverage,
      strategy: marginResult.value.strategy,
      maxNetProfitUSD: marginResult.value.maxNetProfitUSD,
      maxNetProfitINR: marginResult.value.maxNetProfitINR,
      maxPlannedLossUSD: marginResult.value.maxPlannedLossUSD,
      maxPlannedLossINR: marginResult.value.maxPlannedLossINR,
      upperBreakEvenUSD: marginResult.value.upperBreakEvenUSD,
      lowerBreakEvenUSD: marginResult.value.lowerBreakEvenUSD,
      isSameDayExpiry: marginResult.value.isSameDayExpiry,
      minutesToExpiry: marginResult.value.minutesToExpiry,
    },
  };
}
