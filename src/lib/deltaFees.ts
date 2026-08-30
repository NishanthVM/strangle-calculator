/**
 * Delta Exchange India's documented option trading fee methodology,
 * shared across calculators 1, 2, and 4. Same structure Calculator 3
 * already uses internally (minLeverageCalculations.ts) — kept as a
 * separate module here rather than refactoring Calculator 3 to import
 * it, to avoid any regression risk to Calculator 3's already-verified
 * behavior.
 *
 * Verified exactly against both attached screenshots:
 *   BUY/Taker: 100 contracts, $300 premium, 0.001 BTC, $100,000 index
 *     → notional $10,000, cap $1.05, trading fee $1, effective $1, total $1.18
 *   SELL/Maker: 500 contracts, $50 premium, 0.001 BTC, $100,000 index
 *     → notional $50,000, cap $0.875, trading fee $5, effective $0.875, total $1.0325
 *
 * Both screenshots use the same 0.01% fee rate for taker and maker, so
 * this module uses one configurable Fee Rate % rather than inventing a
 * taker/maker split Delta's own examples don't actually show.
 */

export interface DeltaFeeBreakdown {
  optionPremiumUSD: number;
  orderNotionalUSD: number;
  premiumCapUSD: number;
  tradingFeeUSD: number;
  effectiveFeeUSD: number;
  gstUSD: number;
  totalFeeUSD: number;
}

export function calculateOrderNotional(contracts: number, contractSize: number, btcIndexPriceUSD: number): number {
  return contracts * contractSize * btcIndexPriceUSD;
}

export function calculatePremiumCap(
  premiumCapPct: number,
  contracts: number,
  contractSize: number,
  premiumUSD: number
): number {
  return (premiumCapPct / 100) * contracts * contractSize * premiumUSD;
}

export function calculateTradingFee(orderNotionalUSD: number, feeRatePct: number): number {
  return orderNotionalUSD * (feeRatePct / 100);
}

export function calculateEffectiveFee(tradingFeeUSD: number, premiumCapUSD: number): number {
  return Math.min(tradingFeeUSD, premiumCapUSD);
}

export function calculateTotalFee(effectiveFeeUSD: number, gstPct: number): number {
  return effectiveFeeUSD * (1 + gstPct / 100);
}

export function calculateDeltaFee(
  contracts: number,
  contractSize: number,
  btcIndexPriceUSD: number,
  premiumUSD: number,
  feeRatePct: number,
  premiumCapPct: number,
  gstPct: number
): DeltaFeeBreakdown {
  const orderNotionalUSD = calculateOrderNotional(contracts, contractSize, btcIndexPriceUSD);
  const premiumCapUSD = calculatePremiumCap(premiumCapPct, contracts, contractSize, premiumUSD);
  const tradingFeeUSD = calculateTradingFee(orderNotionalUSD, feeRatePct);
  const effectiveFeeUSD = calculateEffectiveFee(tradingFeeUSD, premiumCapUSD);
  const totalFeeUSD = calculateTotalFee(effectiveFeeUSD, gstPct);
  const gstUSD = totalFeeUSD - effectiveFeeUSD;
  return { optionPremiumUSD: premiumUSD, orderNotionalUSD, premiumCapUSD, tradingFeeUSD, effectiveFeeUSD, gstUSD, totalFeeUSD };
}
