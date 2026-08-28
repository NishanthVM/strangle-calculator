/**
 * ATM / ITM / OTM classification based on the ACTUAL ranked ladder of
 * strikes available on the exchange for a given expiry — never a fixed
 * price interval. This module has no network dependency; it's pure
 * functions over a list of strikes, so it can be tested in isolation
 * from the Delta API client.
 *
 * Rules (mirrors real option moneyness):
 *   CALL: strikes below the index are ITM, strikes above are OTM.
 *   PUT:  strikes above the index are ITM, strikes below are OTM.
 *   ATM:  the listed strike(s) closest to the index price. A tie (index
 *         exactly equidistant from two strikes) is reported explicitly
 *         rather than silently resolved — see findATMStrikes.
 *
 * Levels count ladder POSITIONS from the ATM anchor, not dollar
 * distance — so uneven strike spacing (e.g. 500 apart near the money,
 * 2500 apart further out) still produces ITM 1 / ITM 2 / ... correctly.
 */

export type OptionSide = "call" | "put";

export interface AtmResult {
  /** The strike used as the ranking anchor for ITM/OTM levels — the lower one when tied. */
  primaryStrike: number;
  /** All strikes tied for closest-to-index (length 1 unless there's a genuine tie). */
  tiedStrikes: number[];
  isTie: boolean;
}

export interface StrikeClassification {
  kind: "ATM" | "ITM" | "OTM";
  /** Ladder distance from the ATM anchor. 0 for ATM, 1/2/3/... for ITM or OTM. */
  level: number;
  /** Human label, e.g. "ATM", "ITM 2", "OTM 1". */
  label: string;
  isTie: boolean;
}

export interface UnlistedClassification {
  kind: "UNLISTED";
  /** Best-effort moneyness vs. the raw index — NOT a ladder rank, since the strike isn't on the ladder. */
  theoreticalMoneyness: "ITM" | "OTM" | "ATM";
  label: string;
}

/** Sorted, de-duplicated ascending strike ladder. */
export function buildStrikeLadder(strikes: number[]): number[] {
  return Array.from(new Set(strikes.filter((s) => Number.isFinite(s)))).sort((a, b) => a - b);
}

/**
 * Finds the strike(s) closest to the index price. Returns every strike
 * tied for the minimum distance (normally just one), plus the lower of
 * them as the ranking anchor for classifying every other strike.
 */
export function findATMStrikes(sortedStrikes: number[], indexPrice: number): AtmResult | null {
  if (sortedStrikes.length === 0) return null;

  let minDistance = Infinity;
  for (const strike of sortedStrikes) {
    const distance = Math.abs(strike - indexPrice);
    if (distance < minDistance) minDistance = distance;
  }

  const tiedStrikes = sortedStrikes.filter((s) => Math.abs(s - indexPrice) === minDistance);
  const primaryStrike = Math.min(...tiedStrikes);

  return { primaryStrike, tiedStrikes, isTie: tiedStrikes.length > 1 };
}

/** Classifies one strike, given the full ladder and the ATM result already computed for that ladder. */
export function classifyStrike(
  strike: number,
  sortedStrikes: number[],
  atm: AtmResult,
  side: OptionSide,
  indexPrice: number
): StrikeClassification | UnlistedClassification {
  const strikeIndex = sortedStrikes.indexOf(strike);

  if (strikeIndex === -1) {
    // Not on the exchange's ladder for this expiry — report theoretical
    // moneyness vs. the real index rather than a ladder rank.
    return classifyUnlistedStrike(strike, indexPrice, side);
  }

  if (atm.tiedStrikes.includes(strike)) {
    return { kind: "ATM", level: 0, label: atm.isTie ? "ATM (tied)" : "ATM", isTie: atm.isTie };
  }

  const anchorIndex = sortedStrikes.indexOf(atm.primaryStrike);
  const offset = strikeIndex - anchorIndex; // negative = lower strike, positive = higher strike

  if (side === "call") {
    if (offset < 0) return { kind: "ITM", level: -offset, label: `ITM ${-offset}`, isTie: false };
    return { kind: "OTM", level: offset, label: `OTM ${offset}`, isTie: false };
  }

  // put
  if (offset < 0) return { kind: "OTM", level: -offset, label: `OTM ${-offset}`, isTie: false };
  return { kind: "ITM", level: offset, label: `ITM ${offset}`, isTie: false };
}

/**
 * Classifies a strike against the real index price directly (used for
 * strikes not found on the ladder, where a ladder rank isn't possible).
 * Exposed separately so callers don't have to fake an AtmResult.
 */
export function classifyUnlistedStrike(strike: number, indexPrice: number, side: OptionSide): UnlistedClassification {
  let theoreticalMoneyness: "ITM" | "OTM" | "ATM";
  if (strike === indexPrice) theoreticalMoneyness = "ATM";
  else if (side === "call") theoreticalMoneyness = strike < indexPrice ? "ITM" : "OTM";
  else theoreticalMoneyness = strike > indexPrice ? "ITM" : "OTM";
  return { kind: "UNLISTED", theoreticalMoneyness, label: `${theoreticalMoneyness} (unlisted / not on chain)` };
}
