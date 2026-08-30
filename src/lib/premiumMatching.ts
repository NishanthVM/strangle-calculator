/**
 * Finds the opposite-leg strike whose live premium is closest to a
 * reference leg's premium — the core of Calculator 3's auto-match
 * feature.
 *
 * PRIORITY ORDER (verified against every example in the spec):
 *   1. Among DIFFERENT-strike candidates, take the one with the smallest
 *      |candidate premium − reference premium|. If that's within the
 *      buffer, use it — even if the SAME-strike candidate happens to be
 *      numerically even closer (Calculator 3 is for a strangle, so a
 *      different strike is preferred whenever it's "close enough").
 *   2. Otherwise, if the same-strike candidate exists and is within the
 *      buffer, fall back to it (same strike only when no different-strike
 *      alternative qualifies).
 *   3. Otherwise, no candidate is within the buffer — return the
 *      globally closest candidate (any strike) with withinBuffer=false,
 *      never leaving the result blank.
 */

export interface PremiumCandidate {
  strike: number;
  premium: number;
}

export interface PremiumMatchResult {
  strike: number;
  premium: number;
  difference: number;
  withinBuffer: boolean;
}

export function findClosestPremiumMatch(
  referenceStrike: number,
  referencePremium: number,
  candidates: PremiumCandidate[],
  bufferUSD: number
): PremiumMatchResult | null {
  const valid = candidates.filter((c) => Number.isFinite(c.premium) && Number.isFinite(c.strike));
  if (valid.length === 0) return null;

  const withDiff = valid.map((c) => ({ ...c, difference: Math.abs(c.premium - referencePremium) }));
  const differentStrike = withDiff.filter((c) => c.strike !== referenceStrike).sort((a, b) => a.difference - b.difference);
  const sameStrike = withDiff.find((c) => c.strike === referenceStrike);

  if (differentStrike.length > 0 && differentStrike[0].difference <= bufferUSD) {
    return { ...differentStrike[0], withinBuffer: true };
  }
  if (sameStrike && sameStrike.difference <= bufferUSD) {
    return { ...sameStrike, withinBuffer: true };
  }

  const globalBest = [...withDiff].sort((a, b) => a.difference - b.difference)[0];
  return { ...globalBest, withinBuffer: globalBest.difference <= bufferUSD };
}
