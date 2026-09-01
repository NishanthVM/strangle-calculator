# Strangle Position Sizer

A minimal, fully client-side risk-sizing calculator suite for BTC
options on Delta Exchange, split across four pages (`react-router-dom`):

- **`/` (Home)** — the Short Strangle / Short Straddle **Minimum
  Leverage Calculator**, with nav cards at the bottom linking to the
  other three.
- **`/premium-calculator`** — given capital, risk %, fees, stop loss %,
  and number of contracts, computes the maximum premium you can sell
  per leg.
- **`/lots-premium`** — the **Lots & Premium Calculator**, supporting
  both BUY and SELL, CALL and PUT, with
  live strike selection from Delta Exchange's actual option chain
  (auto-filling premium). Fees now use Delta's real fee methodology
  (order notional × rate, capped at % of premium, +GST — the same
  engine Calculator 4 uses) instead of the old flat ₹150 default, which
  has been removed entirely. SELL mode keeps the original SL%-based
  worst-case risk model; BUY mode's risk is the premium cost + fees
  (capital-bounded, since a long option's max loss is what you paid).
  Adds Risk:Reward targeting (with a warning if the target exceeds a
  capped trade's theoretical maximum), and margin/leverage — margin is
  entered independently of capital and only used afterward to compute
  leverage, floored at a configurable exchange minimum (default 1×).
- **`/` (Home) — Minimum Leverage Calculator** — a combined-risk position sizer for a
  BTC short strangle/straddle: capital and Total Risk % determine the
  maximum lots per leg (a deterministic rule — the higher-premium leg is
  modeled as the one that gets stopped out, the lower-premium leg as the
  one taken at profit — plus both legs' Delta Exchange fees). Those exact
  lots then feed Delta's actual documented margin methodology (Isolated
  or Portfolio mode — see "Delta margin methodology" below), which is
  used only after lot sizing to compute leverage against your entered
  margin, floored at a configurable exchange minimum (default 1×).
  Also shows maximum profit/loss, risk:reward, break-evens, strategy
  (strangle vs. straddle), same-day-expiry handling, and an **auto-match**
  feature that finds the opposite leg's strike with the closest live
  premium whenever you pick one leg (see "Premium auto-matching" below) —
  plus a live BTC option chain panel (Delta Exchange India public API)
  for strike classification (ATM / ITM N / OTM N) and premium/IV
  auto-fill — see "Option chain integration" below for important caveats.
- **`/defined-risk-spread`** — a generic two-leg options
  payoff engine (not hard-coded per-strategy formulas) that auto-detects
  Bull Call / Bear Put / Bull Put / Bear Call spreads or labels anything
  else "Custom Two-Leg Strategy". Each leg is independently BUY/SELL,
  CALL/PUT, with a strike selected from the same live Delta option chain
  infrastructure as the third calculator. Computes exact max profit/loss
  and break-even(s) from the payoff itself — never a stop-loss/take-profit
  %, since a vertical spread's risk is already capped by construction.

Everything recalculates instantly as you type. All position-sizing math
happens locally in the browser — the only network calls this project
makes are the option-chain-driven calculators' optional, read-only
fetches to Delta Exchange India's public market-data API for strike
classification and live premiums (see below); nothing is ever sent to
Delta, and every calculator works fully in manual mode if that fetch
fails or is unavailable.

## Stack

- React 18 + TypeScript
- Vite
- react-router-dom (client-side routing across the four pages)
- Tailwind CSS (class-based dark mode)
- lucide-react for icons

## Routing

`src/App.tsx` wraps everything in a `BrowserRouter` with four routes:

| Route | Page |
|---|---|
| `/` | Home — Minimum Leverage Calculator (short strangle/straddle) |
| `/premium-calculator` | Premium Calculator |
| `/lots-premium` | Lots & Premium Calculator (BUY/SELL) |
| `/defined-risk-spread` | Defined-Risk Option Spread Calculator |

Each page is a thin wrapper (`src/pages/*.tsx`) around the shared
`Layout` component (header, theme toggle, footer disclaimer — extracted
so it isn't duplicated four times) plus the one calculator that page
shows. The home page adds `NavCard`s at the bottom linking to the other
three.

**Deployment note**: `npm run dev` and `npm run preview` both serve
Vite's SPA fallback automatically, so refreshing any route (e.g.
`/lots-premium`) works out of the box locally — verified directly
against the preview server while building this. If you deploy to a
static host (Netlify, S3, GitHub Pages, etc.), that host needs to be
configured to serve `index.html` for unknown paths (a standard SPA
rewrite rule) or direct navigation to a non-root route will 404 in
production even though it works locally.

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
    minLeverageCalculations.ts      Minimum Leverage Calculator: risk, lot-sizing,
                                     and fees ONLY — reuses calculateDailyRisk and
                                     inrToUSD from calculations.ts
    deltaMarginCalculations.ts       Composes on minLeverageCalculations.ts's output
                                     to add margin, leverage, strategy detection,
                                     profit/loss, risk:reward, and break-even
    deltaPortfolioMargin.ts           Delta's documented Portfolio Margin methodology
                                     (shock spans, 29-scenario stress test, margin
                                     floor) — verified against official docs
    blackScholes.ts                   Standard European option pricer, used only as
                                     Portfolio Margin's scenario-repricing engine
    optionChainClassification.ts    Pure ATM/ITM N/OTM N strike classification —
                                     ranked by the actual listed strike ladder, no
                                     network dependency, fully unit-testable
    deltaApi.ts                      Delta Exchange India public API client (defensive
                                     parsing, no credentials) — see "Option chain
                                     integration" below
    format.ts                       Currency/number/date/relative-time formatting helpers
  hooks/
    useTheme.ts                      Theme state, localStorage persistence, system-preference fallback
    useOptionChain.ts                 Fetch state, expiry selection, caching, and
                                     30s auto-refresh for the live option chain
  components/
    NumberField.tsx                  Labeled numeric input
    ResultRow.tsx                     Labeled result line (supports profit/risk tone, "big" hero style)
    ErrorBanner.tsx                   Validation error message
    CardShell.tsx                      Card wrapper with title/subtitle/reset
    ThemeToggle.tsx                    Light/dark toggle button
    PremiumCalculator.tsx              Calculator 1
    LotsCalculator.tsx                 Calculator 2
    MinLeverageCalculator.tsx          Calculator 3
    OptionChainPanel.tsx                Live option chain sub-panel inside Calculator 3
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

### Minimum Leverage Calculator

Split across two composed modules, matching the two genuinely separate
concerns the spec insists on never mixing:

- **`src/lib/minLeverageCalculations.ts`** — risk, lot-sizing, and fees
  ONLY. No margin, no leverage, no strike inputs at all.
- **`src/lib/deltaMarginCalculations.ts`** — composes on top of the
  above module's output (never recomputes it) to add margin, leverage,
  strategy detection, profit/loss, risk:reward, and break-even. Calls
  into `src/lib/deltaPortfolioMargin.ts` (Delta's documented Portfolio
  Margin methodology) and `src/lib/blackScholes.ts` (a standard
  European-option pricer, used only as the repricing engine for
  Portfolio Margin's stress-test scenarios).

**Total Risk % is the maximum net loss for the ENTIRE two-leg position**
— never a per-leg budget. Margin is completely independent of
capital/risk and is used only *after* lots are already known:

```
# Risk / lots / fees (minLeverageCalculations.ts) — UNCHANGED from
# capital through to combined lots regardless of margin mode:
1. riskBudgetINR = capital × riskPct / 100      ("Maximum Total Risk ₹")
2. riskBudgetUSD = riskBudgetINR / usdInr
3. losingPremium  = max(callPremium, putPremium)   (tie → CALL)
   profitPremium  = the other leg's premium
4. grossLossPerContract = (losingPremium × slPct/100 − profitPremium × tpPct/100) × contractSize
5. feePerContract = Delta fee formula (% of order notional, capped at % of premium, +GST), CALL + PUT
6. maxContracts = floor(riskBudgetUSD / (grossLossPerContract + feePerContract))   (lots PER LEG)
7. combinedLots = maxContracts × 2

# Strategy (deltaMarginCalculations.ts):
8. strategy = callStrike === putStrike ? "SHORT STRADDLE" : "SHORT STRANGLE"

# Maximum profit / loss / risk:reward:
9.  maxGrossProfit = (callPremium + putPremium) × maxContracts × contractSize
10. maxNetProfit    = maxGrossProfit − totalFees
11. maxPlannedLoss  = the risk engine's worstNetLoss (steps 1-6 above) — reused, not recomputed
12. rewardMultiple  = maxNetProfit / maxPlannedLoss        → "Risk : Reward = 1 : rewardMultiple"

# Break-even:
13. upperBreakEven = callStrike + (callPremium + putPremium)
    lowerBreakEven = putStrike  − (callPremium + putPremium)

# Delta Exchange margin — ISOLATED mode:
14. legMargin = isolatedMarginPct/100 × maxContracts × contractSize × btcIndexPrice   (per leg, no offsetting)
    combinedMargin = callMargin + putMargin

# Delta Exchange margin — PORTFOLIO mode:
15. marginFloor = Σ max(5% × legPremiumValue, OM% × legNotional)
    (OM% computed once off the aggregate short-options notional; see
    deltaPortfolioMargin.ts for the exact Base%/BaseNotional/Slope/Cap
    parameters, all quoted directly from Delta's documentation)
16. riskMargin  = Delta's documented 29-scenario price/IV stress test
    (9 price steps × 3 IV states + 2 extreme 300%-price/⅓-weighted
    scenarios), repricing both legs with Black-Scholes at each shocked
    spot/IV and taking the maximum portfolio loss — requires live IV per
    leg; shows "Risk Margin unavailable" and falls back to Margin Floor
    alone if the option chain doesn't expose it
17. combinedMargin = max(riskMargin, marginFloor)

# Leverage (both modes) — a direct ratio, not solved from the margin formula,
# since Delta's real formulas don't parameterize margin BY leverage:
18. combinedPositionNotional = combinedLots × contractSize × btcIndexPrice
19. theoreticalLeverage = combinedPositionNotional / marginUSD
20. minUsableLeverage   = max(theoreticalLeverage, exchangeMinLeverage)   (default exchangeMinLeverage = 1×)
```

**Verified against the full test matrix** (all pass — see the "Final
validation" commit history / conversation for the exact numbers):
short strangle vs. straddle detection, asymmetric-premium losing-leg
detection in both directions, 1%-of-capital combined risk budget,
margin/capital independence (changing margin never changes lots;
changing capital changes both risk budget and lots), and the exchange
minimum leverage floor (1× by default — a small-notional case correctly
shows usable = 1× while a normal case shows usable = theoretical,
never forced to 1× unconditionally).

### Delta margin methodology — sources and honesty notes

The margin formulas above are **not invented** — they're transcribed
directly from Delta Exchange India's official public documentation,
fetched and read while building this:

- **Portfolio Margin** (shock-span tables, the IV max up/down formula,
  the 29-scenario grid, and the BTC margin-floor parameters — Base%
  0.5%, Base Notional $200,000, Slope 0.0000005%, Cap 2%): all quoted
  directly from
  `guides.delta.exchange/delta-exchange-india-user-guide/trading-guide/margin-explainer/portfolio-margin`.
  Verified numerically against that page's own worked examples (shock
  spans at $1.1M notional, IV max up/down at several DTE values) before
  being implemented — see the git history / build verification for the
  exact figures.
- **Isolated Margin** (`IM = InitialMargin% × Contracts × Multiplier ×
  Price`): the formula *structure* is quoted from
  `guides.delta.exchange/.../margin-explainer/margin-explainer`, but
  `InitialMargin%` itself is genuinely **per-contract and position-size
  dependent** — Delta publishes it live per contract at
  delta.exchange/contracts, not as a single stable constant. Rather than
  fabricate a number, this calculator exposes **Isolated Margin %** as a
  labeled, user-editable input — verify the real value for your specific
  contract on Delta Exchange before trusting the isolated-mode output.
- **The last-30-minutes expiry-day quantity reduction** (`expiryFactor`
  in `deltaPortfolioMargin.ts`): Delta's documentation describes this
  qualitatively ("30-min TWAP settlement... results in linear reduction
  of delta risk exposures... in the 30 mins leading to expiry") but
  doesn't publish an exact formula. The linear ramp implemented here is
  a reasonable modeling choice consistent with that description, not a
  quoted exchange formula — flagged as such in code comments.
- **Black-Scholes with r=0**: a standard, textbook option-pricing model
  used only as Portfolio Margin's repricing engine for the documented
  stress scenarios — not Delta-specific, and not independently verified
  against Delta's internal pricer.
- **Risk Margin requires live implied volatility** per leg from the
  option chain API, which this project has not been able to confirm the
  exact field name for (see "Option chain integration" below) — if
  unavailable, Portfolio Margin mode transparently falls back to Margin
  Floor alone rather than guessing an IV.

Every margin figure in the UI is labeled **"Estimated"** and paired with
a note to verify on the exchange before trading — this calculator models
Delta's documented methodology as accurately as public sources allow,
but is not a substitute for the exchange's own live margin quote,
especially for same-day expiry options where margin can move quickly.

## Premium auto-matching (Minimum Leverage Calculator)

`src/lib/premiumMatching.ts` — pure, no network dependency. When you pick
a strike for one leg (the "reference leg"), it searches the live chain
for the opposite-type contract whose premium is closest to the
reference leg's premium, then auto-selects that strike.

**Priority order** (verified against every worked example in the spec,
including the trickiest one):
1. Among strikes *different* from the reference leg, take whichever has
   the smallest `|candidate premium − reference premium|`. If that's
   within the buffer (default $5, editable), use it — **even if the
   same-strike candidate is numerically even closer** — because this
   calculator is for a strangle, and a different strike is preferred
   whenever it's close enough.
2. Otherwise, fall back to the same strike if it's within the buffer.
3. Otherwise, nothing qualifies — return the single globally-closest
   candidate (any strike) and flag it "Outside Buffer" rather than
   leaving the opposite leg unset.

**Loop prevention**: selecting CALL auto-sets PUT (or vice versa) by
calling `setMarginField` directly — it never goes through the same
`onSelectCallStrike`/`onSelectPutStrike` handlers a user's own dropdown
interaction uses, so there's no path for an auto-set PUT to trigger
another CALL auto-match. A `programmaticUpdateRef` guard is kept as a
defensive belt-and-braces measure even though the current wiring makes
a loop structurally impossible.

**Manual override respected**: auto-matching only fires from the
strike-selection handlers and from a chain/expiry refresh (re-matching
the reference leg's current premium against the new chain) — it never
runs on a timer or on unrelated re-renders, so a manually-chosen
opposite strike is never silently overwritten by a stray premium
refresh.

## Shared live BTC index

`src/hooks/useLiveBtcIndex.ts` is the single derivation every calculator
uses for "the live BTC index" — it's a thin wrapper around
`useOptionChain()` (the same hook Calculator 3, Calculator 4, and now
the Lots Calculator all call) plus `extractLiveIndexPrice()`. Because
`useOptionChain()` already de-duplicates network requests for the same
expiry via a module-level cache, every calculator reading the live index
sees the exact same number from the exact same fetch — there's no
separate index-fetching code path to drift out of sync. Each calculator
still keeps its own manual BTC Index Price input and its own "Use Live
Index" toggle (off by default), so enabling live data in one calculator
never silently changes another calculator's manual value.

## Option chain integration

The Minimum Leverage Calculator includes a live BTC option-chain panel
that classifies your selected CALL/PUT strikes as ATM / ITM N / OTM N,
ranked against the **actual strikes listed on Delta Exchange India for
the current expiry** — never a fixed dollar interval. It's purely a
classification/data feature: it never changes the risk, fee, margin, or
leverage formulas, and the calculator works exactly as before with
manual strike entry if the chain is unavailable.

### What it does

- Fetches live BTC option expiries and the call/put chain from Delta
  Exchange India's public REST API (`GET /v2/products`,
  `GET /v2/tickers`) — no API key or credentials involved, read-only
  market data only.
- Finds the ATM strike as whichever listed strike is closest to the BTC
  index price (ties are shown explicitly, e.g. "ATM 116,000 / 117,000
  (tied)" — never silently resolved).
- Ranks every other listed strike by its **position on the actual
  ladder**, not by dollar distance, so uneven strike spacing (e.g. 500
  apart near the money, 2,500 apart further out) still produces correct
  ITM 1 / ITM 2 / ... / OTM 1 / OTM 2 / ... labels.
- Optional "Use Live BTC Index" and "Use Live Premium" toggles (off by
  default) can populate the existing BTC Index Price / CALL Premium /
  PUT Premium inputs from live data — your manually typed values are
  never overwritten unless you explicitly enable a toggle.
- Auto-refreshes every 30 seconds, plus a manual "Refresh Chain" button;
  fetched chains are cached per-expiry so switching back to an
  already-loaded expiry (or hitting the calculator's Reset button)
  doesn't force a redundant refetch.
- On any API failure (network error, CORS, rate limit, empty chain,
  etc.) the panel shows "Unable to fetch the Delta Exchange option
  chain. Using manual strike mode." and the rest of the calculator
  — including the CALL/PUT Strike Price number fields — keeps working
  exactly as it did before this feature existed.

### Important caveats — please read before relying on this

This was built and type-checked in a sandboxed environment with **no
network route to `api.india.delta.exchange`**, so the live fetch could
not actually be executed and verified here:

- **Response field names are inferred, not confirmed.** `deltaApi.ts`
  parses fields like `strike_price`, `mark_price`, `spot_price`,
  `quotes.best_bid/best_ask`, and `greeks.delta` based on Delta's
  publicly documented v2 conventions and the request's own description
  of the endpoints — not a response I was able to fetch and inspect. If
  the live API uses different field names, only the `normalizeTicker`
  function in that file needs adjusting; every other file only sees the
  already-normalized `OptionContract` shape.
- **CORS behavior is untested.** If the browser can't call
  `api.india.delta.exchange` directly from your deployed origin, every
  request will fail with a generic network error — which the panel
  already handles via the same "Using manual strike mode" fallback as
  any other API failure, so the calculator won't break, but the live
  feature simply won't activate. A backend proxy would be the fix if
  that turns out to be the case; that's a real architecture change
  (this project has no backend), so it wasn't added speculatively.
- **The live index price is extracted from `spot_price` fields embedded
  in the option tickers themselves** (a common pattern, but not
  independently confirmed here) rather than a dedicated index endpoint.
  If that field isn't present, "Use Live BTC Index" simply stays
  disabled and greyed out.

If you run this and the live chain doesn't populate, check the browser
console/network tab for the actual response shape and error — that'll
tell us immediately whether it's a field-name mismatch (quick fix in
`normalizeTicker`) or a CORS block (needs a proxy).
