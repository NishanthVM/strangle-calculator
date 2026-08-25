# Strangle Position Sizer

A minimal, fully client-side risk-sizing calculator for short strangle
positions on Delta Exchange BTC options. Two calculators:

- **Premium Calculator** — given capital, risk %, fees, stop loss %, and
  number of contracts, computes the maximum premium you can sell per leg.
- **Lots Calculator** — given capital, risk %, fees, premium, and stop
  loss %, computes the maximum number of contracts you can sell per leg.

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
  types.ts                    Shared TypeScript types for the domain
  lib/
    calculations.ts           Pure, typed calculation + validation functions
    format.ts                 Currency/number formatting helpers
  hooks/
    useTheme.ts                Theme state, localStorage persistence, system-preference fallback
  components/
    NumberField.tsx            Labeled numeric input
    ResultRow.tsx               Labeled result line (supports profit/risk tone, "big" hero style)
    ErrorBanner.tsx             Validation error message
    CardShell.tsx                Card wrapper with title/subtitle/reset
    ThemeToggle.tsx              Light/dark toggle button
    PremiumCalculator.tsx        Calculator 1
    LotsCalculator.tsx           Calculator 2 (includes the short strangle summary panel)
  App.tsx                      Page layout
  main.tsx                     React entry point
  index.css                    Tailwind directives + base styles
```

The calculation logic in `src/lib/calculations.ts` has no dependency on
React — it's plain, typed functions you could unit test or reuse
elsewhere directly.

## Theme

The color theme (light/dark) is:

1. Read from `localStorage` (`strangle-calc-theme`) if previously set.
2. Otherwise inferred from the OS-level `prefers-color-scheme`.
3. Applied via an inline script in `index.html` *before* React mounts,
   so there's no flash of the wrong theme on load.

Toggling the theme (top-right button) persists the choice for next visit.

## Formulas

All formulas live in `src/lib/calculations.ts`:

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

Verified against the reference examples from the spec:

| Capital | Contracts | Premium | Result |
|---|---|---|---|
| ₹100,000 | 1,000 | — | $2.50 premium/leg |
| ₹61,000  | 1,000 | — | $1.35 premium/leg |
| ₹100,000 | —     | $25 | 100 contracts, 0.10 BTC |
| ₹61,000  | —     | $25 | 54 contracts, 0.054 BTC |

**Note on Take Profit Level:** the original spec's worked example for the
Lots Calculator showed a Take Profit Level inconsistent with the formula
demonstrated in the Premium Calculator's own example (`premium × TP%`).
This implementation uses the consistent formula throughout — e.g. a $25
premium at 90% TP shows as $22.50, not the $2.50 that appeared in that
one example.
