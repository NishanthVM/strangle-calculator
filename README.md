# Strangle Position Sizer

A minimal, fully client-side risk-sizing calculator suite for short
strangle positions on Delta Exchange BTC options. Three calculators:

- **Premium Calculator** — given capital, risk %, fees, stop loss %, and
  number of contracts, computes the maximum premium you can sell per leg.
- **Lots Calculator** — given capital, risk %, fees, premium, and stop
  loss %, computes the maximum number of contracts you can sell per leg.
- **Minimum Leverage Calculator** — models the combined risk of a two-leg
  short strangle using a deterministic rule (the higher-premium leg is
  the one that gets stopped out, the lower-premium leg is the one taken
  at profit), includes Delta Exchange's documented fee methodology for
  both legs, finds the maximum lots per leg that keeps the worst-case net
  loss within your Total Risk % of capital, then solves Delta's
  documented Approximate Initial Margin formula (per leg, combined) for
  the leverage that makes the required margin equal your entered margin
  — never displaying a usable leverage below the exchange's configured
  minimum. Margin is completely independent of capital/risk and only
  enters the picture after lot sizing is done.

Everything recalculates instantly as you type. No backend, no external
API calls — all math happens in the browser.

## Stack

- React 18 + TypeScript
- Vite
- Tailwind CSS (class-based dark mode)
- lucide-react for icons

## Getting started

```bash
npm install
npm run dev
```

Then open the printed local URL (typically `http://localhost:5173`).

## Build for production

```bash
npm run build
npm run preview   # serve the production build locally to check it
```

The production build is emitted to `dist/`.

## Project structure

```
src/
  types.ts                          Shared TypeScript types for all three calculators
  lib/
    calculations.ts                 Pure, typed calculation + validation functions
                                     for the Premium and Lots calculators
    minLeverageCalculations.ts      Minimum Leverage Calculator logic — reuses
                                     calculateDailyRisk, calculateTradingLossBudgetINR,
                                     inrToUSD, calculateBTCQuantity, and
                                     calculateMaxContracts from calculations.ts
                                     rather than duplicating them
    format.ts                       Currency/number formatting helpers
  hooks/
    useTheme.ts                      Theme state, localStorage persistence, system-preference fallback
  components/
    NumberField.tsx                  Labeled numeric input
    ResultRow.tsx                     Labeled result line (supports profit/risk tone, "big" hero style)
    ErrorBanner.tsx                   Validation error message
    CardShell.tsx                      Card wrapper with title/subtitle/reset
    ThemeToggle.tsx                    Light/dark toggle button
    PremiumCalculator.tsx              Calculator 1
    LotsCalculator.tsx                 Calculator 2
    MinLeverageCalculator.tsx          Calculator 3
  App.tsx                            Page layout
  main.tsx                           React entry point
  index.css                          Tailwind directives + base styles
```

Each calculator's logic has no dependency on React — it's plain, typed
functions you could unit test or reuse elsewhere directly.

## Theme

The color theme (light/dark) is:

1. Read from `localStorage` (`strangle-calc-theme`) if previously set.
2. Otherwise inferred from the OS-level `prefers-color-scheme`.
3. Applied via an inline script in `index.html` *before* React mounts,
   so there's no flash of the wrong theme on load.

Toggling the theme (top-right button) persists the choice for next visit.
All three calculators share this one theme system.

## Formulas

### Premium / Lots calculators (`src/lib/calculations.ts`)

```
dailyRiskINR      = capital × riskPct / 100
budgetINR         = dailyRiskINR − fees          (must be > 0, else error)
budgetUSD         = budgetINR / usdInr
btcQty            = contracts × contractSize

# Premium Calculator
premiumUSD        = budgetUSD / ((stopLossPct / 100) × btcQty)

# Lots Calculator
slLossPerBTC      = premiumUSD × (stopLossPct / 100)
maxContracts      = floor((budgetUSD / slLossPerBTC) / contractSize)

# Shared
takeProfitLevel   = premiumUSD × takeProfitPct / 100
stopLossLevel     = premiumUSD × stopLossPct / 100
maxLossAtSL       = stopLossLevel × btcQty
```

### Minimum Leverage Calculator (`src/lib/minLeverageCalculations.ts`)

**Total Risk % is the maximum net loss for the ENTIRE two-leg strangle.**
The **higher-premium leg is deterministically the losing leg** (reaches
stop loss); the lower-premium leg is the profit leg (reaches take
profit) — not a max() of two scenarios. Equal premiums default to CALL
as the losing leg.

```
1. riskBudgetINR = capital × riskPct / 100      ("Maximum Total Risk ₹")
2. riskBudgetUSD = riskBudgetINR / usdInr

3. losingPremium  = max(callPremium, putPremium)   (tie → CALL)
   profitPremium  = the other leg's premium
4. grossLossPerBTC = losingPremium × slPct/100 − profitPremium × tpPct/100
5. grossLossPerContract = grossLossPerBTC × contractSize

# Delta Exchange fee methodology, per leg — a % of order notional, capped
# at a % of premium value, plus GST:
6. orderNotional  = contracts × contractSize × btcIndexPrice
   percentageFee   = orderNotional × feeRatePct/100
   premiumCap       = premiumCapPct/100 × contracts × contractSize × premium
   effectiveFee      = MIN(percentageFee, premiumCap)
   totalFee           = effectiveFee × (1 + gstPct/100)
   (computed separately for CALL and PUT, then summed)

7. maxContracts = floor(riskBudgetUSD / (grossLossPerContract-at-N=1 + fee-per-contract))
   (linear in N — see LINEARITY NOTE in the source file for why no
   iteration/binary-search is mathematically necessary here)
8. combinedLots = maxContracts × 2

# Leverage is solved from Delta Exchange's documented Approximate Initial
# Margin formula, NOT from premium exposure or a plain notional/margin
# ratio. Per leg:
#   IM = premiumComponent + (underlyingNotional / leverage) − OTMAmount
#   premiumComponent   = premium × contracts × contractSize
#   underlyingNotional = btcIndexPrice × contracts × contractSize
#   OTMAmount           = max(strike − price, 0) [CALL] or max(price − strike, 0) [PUT], × contracts × contractSize
# Combined IM(leverage) is strictly decreasing in leverage, so solving
# combinedIM(L) = marginEntered for L gives exactly the bare-minimum
# leverage:
9.  L = combinedUnderlyingNotional / (marginEntered − combinedPremiumComponent + combinedOTMAmount)
10. minUsableLeverage = max(L, exchangeMinLeverage)
```

**OTM amount scaling**: Delta's formula names an OTM term but the
reference material only gives its per-BTC moneyness definition, not its
exact scaling inside the IM formula. Since it must combine additively
with `underlyingNotional` (which IS scaled by `contracts × contractSize`),
this implementation scales OTM the same way — an explicit judgment call,
documented in `minLeverageCalculations.ts`, not something quoted from
Delta's docs.

Verified against the spec's test matrix (all pass):

| Test | Result |
|---|---|
| Reference example (CALL $78 / PUT $77, margin $796, strikes $105k/$95k) | 47 lots/leg, theoretical 7.47×, **usable = 16× (exchange floor)** — the previous 0.02× bug is gone |
| Defaults (CALL $25 / PUT $25, margin $10) | 147 lots/leg, theoretical 19.96× (above the floor, so usable = theoretical); required margin at that leverage recomputes to exactly $10, confirming the algebraic solve is correct |
| CALL $78 / PUT $77 | CALL correctly identified as losing leg (higher premium) |
| CALL $77 / PUT $78 | PUT correctly identified as losing leg |
| Margin $796 → $500 | Lots unchanged (47 both times) — margin never affects lot sizing |
| Capital 100k → 200k | Lots roughly double (47 → 94) |
| Small-margin case | Theoretical leverage (20.03×) exceeds the exchange minimum, so usable = theoretical rather than being clamped to 16× |

Edge cases verified: fees alone exceeding the risk budget, budget too
small for 1 contract, inputs producing no positive worst-case loss, and
entered margin insufficient to cover the position at any leverage all
return clear error messages — never `NaN`/`Infinity`/negative values.

**Note on the older Take Profit Level example:** an earlier iteration of
this spec had one worked example for the Lots Calculator whose Take
Profit Level looked inconsistent with the formula demonstrated
elsewhere. This implementation uses the consistent formula throughout
(`premium × TP%`).
