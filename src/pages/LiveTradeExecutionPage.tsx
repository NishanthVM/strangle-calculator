import { useEffect, useMemo, useRef, useState } from "react";
import { Layout } from "../components/Layout";
import { OtherCalculatorsNav } from "../components/OtherCalculatorsNav";
import { AuthGate } from "../components/AuthGate";
import { ResultRow } from "../components/ResultRow";
import { ErrorBanner } from "../components/ErrorBanner";
import { NumberField } from "../components/NumberField";
import { useOptionChain } from "../hooks/useOptionChain";
import { buildStrikeLadder } from "../lib/optionChainClassification";
import { runLiveTradeCalculation } from "../lib/liveTradeCalculations";
import { findClosestPremiumMatch } from "../lib/premiumMatching";
import { normalizePosition, findPositionForProduct, type NormalizedLegPosition } from "../lib/positionNormalize";
import { formatExpiryLabel, formatINR, formatNumber, formatRelativeTime, formatUSD } from "../lib/format";

/**
 * ============================================================================
 * SAFETY DESIGN — read before enabling Live mode.
 * ============================================================================
 * DRY RUN (default ON, independent of REAL/DEMO environment below):
 *   Live option chain, the exact same risk/margin/leverage engine as the
 *   Minimum Leverage Calculator, the Leverage Buffer + 200x cap math, and
 *   the full order-payload preview. Never calls any Delta-mutating route.
 *
 * REAL vs DEMO (environment selector): which Delta Exchange environment
 *   credentials/orders target. Defaults to REAL per spec — this is
 *   orthogonal to Dry Run, which is what actually gates whether an order
 *   is sent at all. Dry Run stays ON by default regardless of environment.
 *
 * LIVE order placement, leverage-setting, and position-fetch code (in
 * api/_lib/deltaClient.js) has NOT been executed against a real Delta
 * account from this build environment — no network route to Delta's API
 * here. Test Connection first, then test with the smallest possible size.
 *
 * This page itself requires a separate app-level login (api/_lib/auth.js)
 * so the public Vercel URL alone can't be used to access it.
 */

const MAX_EXECUTION_LEVERAGE = 200; // mirrored server-side in api/delta/place-strangle.js — never trust only the client value

interface TradeSnapshot {
  timestamp: number;
  strategy: string;
  expiryLabel: string;
  callStrike: number;
  putStrike: number;
  callProductId?: number;
  putProductId?: number;
  callLots: number;
  putLots: number;
  callPremium: number;
  putPremium: number;
  calculatedLeverage: number;
  leverageBuffer: number;
  totalLeverage: number;
  executedLeverage: number;
  leverageWasCapped: boolean;
  estimatedMargin: number;
  maxPlannedLossINR: number;
  maxNetProfitINR: number;
  upperBreakEvenUSD: number;
  lowerBreakEvenUSD: number;
  isDryRun: boolean;
  environment: "real" | "demo";
  callOrder?: unknown;
  putOrder?: unknown;
}

function formatIST(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false }) + " IST";
}

/** Same-origin only — this app is designed to be deployed as one Vercel project (static + /api together). No separate backend URL to configure. */
async function apiFetch(path: string, body: unknown): Promise<{ ok: boolean; error?: string; result?: unknown }> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return {
      ok: false,
      error: `Could not reach ${path}. If running locally, /api routes only work under \`vercel dev\` (not plain \`npm run dev\`) — see README.`,
    };
  }
  const text = await res.text();
  let json: { ok?: boolean; error?: string; result?: unknown };
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    return { ok: false, error: `Non-JSON response from ${path} (status ${res.status}): ${text.slice(0, 200) || "(empty)"}` };
  }
  if (res.status === 401) return { ok: false, error: "Session expired — please log in again." };
  if (!res.ok || json.ok === false) return { ok: false, error: json.error ?? `Request failed (status ${res.status}).` };
  return { ok: true, result: json.result };
}

function LiveTradeExecutionInner() {
  const [environment, setEnvironment] = useState<"real" | "demo">("real");
  const { expiries, selectedExpiry, chain, error, lastUpdated, refresh } = useOptionChain(environment === "demo");

  const [capital, setCapital] = useState("100000");
  const [riskPct, setRiskPct] = useState("1");
  const [callPremium, setCallPremium] = useState("");
  const [putPremium, setPutPremium] = useState("");
  const [callStrike, setCallStrike] = useState("");
  const [putStrike, setPutStrike] = useState("");
  const [referenceLeg, setReferenceLeg] = useState<"call" | "put" | null>(null);
  const [symmetryBuffer, setSymmetryBuffer] = useState("5");
  const [symmetryStatus, setSymmetryStatus] = useState<{ withinBuffer: boolean; difference: number } | null>(null);
  const [stopLossPct] = useState("400");
  const [takeProfitPct] = useState("90");
  const [usdInr, setUsdInr] = useState("85");
  const [contractSize, setContractSize] = useState("0.001");
  const [feeRatePct] = useState("0.01");
  const [premiumCapPct] = useState("3.5");
  const [gstPct] = useState("18");
  const [marginUSD, setMarginUSD] = useState("10");
  const [exchangeMinLeverage] = useState("1");
  const [leverageBuffer, setLeverageBuffer] = useState("3");

  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "testing" | "ok" | "failed">("idle");
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const [dryRun, setDryRun] = useState(true);
  const [liveConfirmed, setLiveConfirmed] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [activeTrade, setActiveTrade] = useState<TradeSnapshot | null>(null);
  const [dryRunPayload, setDryRunPayload] = useState<object | null>(null);

  const [, setPositions] = useState<unknown[] | null>(null);
  const [positionsError, setPositionsError] = useState<string | null>(null);
  const [lastPositionUpdate, setLastPositionUpdate] = useState<number | null>(null);
  const [callLeg, setCallLeg] = useState<NormalizedLegPosition | null>(null);
  const [putLeg, setPutLeg] = useState<NormalizedLegPosition | null>(null);
  const [callClosed, setCallClosed] = useState<{ exitPriceUSD: number | null; realizedPnlUSD: number | null; exitTimestamp: number } | null>(null);
  const [putClosed, setPutClosed] = useState<{ exitPriceUSD: number | null; realizedPnlUSD: number | null; exitTimestamp: number } | null>(null);
  const [nowTick, setNowTick] = useState(Date.now()); // drives the "Updated Xs ago" live-status text
  const pollRef = useRef<number | null>(null);

  const callContracts = chain?.calls ?? [];
  const putContracts = chain?.puts ?? [];
  const callStrikes = useMemo(() => buildStrikeLadder(callContracts.map((c) => c.strike)), [callContracts]);
  const putStrikes = useMemo(() => buildStrikeLadder(putContracts.map((c) => c.strike)), [putContracts]);

  const selectedCallContract = callContracts.find((c) => c.strike === parseFloat(callStrike));
  const selectedPutContract = putContracts.find((c) => c.strike === parseFloat(putStrike));

  // setInterval callbacks close over stale state — this ref lets the 2s position
  // poll always read the LATEST live mark prices/contract size, not the values
  // from when polling started.
  const liveMarksRef = useRef({ call: null as number | null, put: null as number | null, contractSize: 0.001 });
  useEffect(() => {
    liveMarksRef.current = {
      call: selectedCallContract?.premium ?? null,
      put: selectedPutContract?.premium ?? null,
      contractSize: parseFloat(contractSize) || 0.001,
    };
  }, [selectedCallContract?.premium, selectedPutContract?.premium, contractSize]);

  // Production and testnet are different product catalogs — a strike/product
  // selected under one environment is meaningless (and unsafe to submit) under
  // the other, so clear the selection whenever the user switches REAL/DEMO.
  useEffect(() => {
    setCallStrike("");
    setPutStrike("");
    setCallPremium("");
    setPutPremium("");
    setReferenceLeg(null);
    setSymmetryStatus(null);
  }, [environment]);

  const btcIndex = chain ? chain.calls[0]?.spotPrice ?? chain.puts[0]?.spotPrice ?? null : null;

  function runSymmetricMatch(leg: "call" | "put", strike: number, premium: number) {
    const candidates = (leg === "call" ? putContracts : callContracts)
      .filter((c) => c.premium !== undefined)
      .map((c) => ({ strike: c.strike, premium: c.premium as number }));
    const match = findClosestPremiumMatch(strike, premium, candidates, parseFloat(symmetryBuffer) || 5);
    if (!match) return;
    setSymmetryStatus({ withinBuffer: match.withinBuffer, difference: match.difference });
    if (leg === "call") {
      setPutStrike(String(match.strike));
      setPutPremium(String(match.premium));
    } else {
      setCallStrike(String(match.strike));
      setCallPremium(String(match.premium));
    }
  }

  function handleSelectCallStrike(strike: string) {
    setCallStrike(strike);
    setReferenceLeg("call");
    const contract = callContracts.find((c) => c.strike === parseFloat(strike));
    if (contract?.premium === undefined) return;
    setCallPremium(String(contract.premium));
    runSymmetricMatch("call", parseFloat(strike), contract.premium);
  }

  function handleSelectPutStrike(strike: string) {
    setPutStrike(strike);
    setReferenceLeg("put");
    const contract = putContracts.find((c) => c.strike === parseFloat(strike));
    if (contract?.premium === undefined) return;
    setPutPremium(String(contract.premium));
    runSymmetricMatch("put", parseFloat(strike), contract.premium);
  }

  useEffect(() => {
    if (selectedCallContract?.premium !== undefined) setCallPremium(String(selectedCallContract.premium));
  }, [selectedCallContract?.premium]);
  useEffect(() => {
    if (selectedPutContract?.premium !== undefined) setPutPremium(String(selectedPutContract.premium));
  }, [selectedPutContract?.premium]);

  useEffect(() => {
    if (!callStrike && callStrikes.length > 0 && btcIndex !== null) {
      const closest = callStrikes.reduce((a, b) => (Math.abs(a - btcIndex) <= Math.abs(b - btcIndex) ? a : b));
      setCallStrike(String(closest));
    }
    if (!putStrike && putStrikes.length > 0 && btcIndex !== null) {
      const closest = putStrikes.reduce((a, b) => (Math.abs(a - btcIndex) <= Math.abs(b - btcIndex) ? a : b));
      setPutStrike(String(closest));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callStrikes.length, putStrikes.length, btcIndex]);

  const calc = useMemo(() => {
    if (btcIndex === null || !callStrike || !putStrike || !callPremium || !putPremium) return null;
    return runLiveTradeCalculation({
      risk: {
        capital: parseFloat(capital),
        callPremiumUSD: parseFloat(callPremium),
        putPremiumUSD: parseFloat(putPremium),
        riskPct: parseFloat(riskPct),
        takeProfitPct: parseFloat(takeProfitPct),
        stopLossPct: parseFloat(stopLossPct),
        usdInr: parseFloat(usdInr),
        contractSize: parseFloat(contractSize),
        btcIndexPriceUSD: btcIndex,
        feeRatePct: parseFloat(feeRatePct),
        premiumCapPct: parseFloat(premiumCapPct),
        gstPct: parseFloat(gstPct),
      },
      margin: {
        marginUSD: parseFloat(marginUSD),
        marginMode: "isolated",
        isolatedMarginPct: 10,
        callStrikeUSD: parseFloat(callStrike),
        putStrikeUSD: parseFloat(putStrike),
        exchangeMinLeverage: parseFloat(exchangeMinLeverage),
        btcIndexPriceUSD: btcIndex,
        contractSize: parseFloat(contractSize),
        usdInr: parseFloat(usdInr),
        callPremiumUSD: parseFloat(callPremium),
        putPremiumUSD: parseFloat(putPremium),
        callIvPct: selectedCallContract?.markIvPct,
        putIvPct: selectedPutContract?.markIvPct,
        expirySettlementMs: null,
        manualDaysToExpiry: 0.5,
        nowMs: Date.now(),
      },
      leverageBufferX: parseFloat(leverageBuffer) || 0,
    });
  }, [
    btcIndex,
    callStrike,
    putStrike,
    callPremium,
    putPremium,
    capital,
    riskPct,
    takeProfitPct,
    stopLossPct,
    usdInr,
    contractSize,
    feeRatePct,
    premiumCapPct,
    gstPct,
    marginUSD,
    exchangeMinLeverage,
    leverageBuffer,
    selectedCallContract?.markIvPct,
    selectedPutContract?.markIvPct,
  ]);

  const executedLeverage = calc?.ok ? Math.min(calc.value.totalLeverage, MAX_EXECUTION_LEVERAGE) : null;
  const leverageWasCapped = calc?.ok ? calc.value.totalLeverage > MAX_EXECUTION_LEVERAGE : false;

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const overallPnl = useMemo(() => {
    const usdInrNum = parseFloat(usdInr) || 1;
    const callUnrealized = callClosed ? 0 : (callLeg?.unrealizedPnlUSD ?? 0);
    const putUnrealized = putClosed ? 0 : (putLeg?.unrealizedPnlUSD ?? 0);
    const callRealized = callClosed?.realizedPnlUSD ?? 0;
    const putRealized = putClosed?.realizedPnlUSD ?? 0;
    const unrealizedUSD = callUnrealized + putUnrealized;
    const realizedUSD = callRealized + putRealized;
    return {
      unrealizedINR: unrealizedUSD * usdInrNum,
      realizedINR: realizedUSD * usdInrNum,
      totalINR: (unrealizedUSD + realizedUSD) * usdInrNum,
    };
  }, [callLeg, putLeg, callClosed, putClosed, usdInr]);

  useEffect(() => {
    if (!activeTrade) {
      document.title = "BTC Strangle Trade Execution";
      return;
    }
    if (activeTrade.isDryRun) {
      document.title = "BTC Strangle | DRY RUN";
      return;
    }
    const closedBoth = callClosed && putClosed;
    const sign = overallPnl.totalINR >= 0 ? "+" : "";
    document.title = closedBoth
      ? `BTC Strangle | CLOSED | ${sign}${formatINR(overallPnl.totalINR)}`
      : `BTC Strangle | UPNL ${sign}${formatINR(overallPnl.totalINR)}`;
  }, [activeTrade, overallPnl.totalINR, callClosed, putClosed]);

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  async function testConnection() {
    setConnectionStatus("testing");
    setConnectionError(null);
    const res = await apiFetch("/api/delta/test-connection", { apiKey, apiSecret, useTestnet: environment === "demo" });
    if (res.ok) {
      setConnectionStatus("ok");
    } else {
      setConnectionStatus("failed");
      setConnectionError(res.error ?? "Unknown error.");
    }
  }

  function clearCredentials() {
    setApiKey("");
    setApiSecret("");
    setConnectionStatus("idle");
    setConnectionError(null);
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = null;
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    window.location.reload();
  }

  async function handlePlaceOrder() {
    setPlaceError(null);
    setDryRunPayload(null);
    if (!dryRun) setActiveTrade(null); // clear any leftover dry-run summary before attempting a real submission
    refresh();

    if (!calc || !calc.ok || executedLeverage === null) {
      setPlaceError("Cannot place order — sizing calculation is not valid. Check inputs above.");
      return;
    }
    if (!selectedCallContract?.productId || !selectedPutContract?.productId) {
      setPlaceError(
        "Selected CALL/PUT contract has no product ID from the live chain — cannot submit a real order for it."
      );
      return;
    }

    const v = calc.value;
    const clientOrderIdPrefix = `STRANGLE_${Date.now()}`;

    const payload = {
      callProductId: selectedCallContract.productId,
      putProductId: selectedPutContract.productId,
      callSize: v.maxContracts,
      putSize: v.maxContracts,
      totalLeverage: v.totalLeverage,
      clientOrderIdPrefix,
    };

    const snapshot: TradeSnapshot = {
      timestamp: Date.now(),
      strategy: v.strategy,
      expiryLabel: selectedExpiry ? formatExpiryLabel(selectedExpiry) : "—",
      callStrike: parseFloat(callStrike),
      putStrike: parseFloat(putStrike),
      callProductId: selectedCallContract?.productId,
      putProductId: selectedPutContract?.productId,
      callLots: v.maxContracts,
      putLots: v.maxContracts,
      callPremium: parseFloat(callPremium),
      putPremium: parseFloat(putPremium),
      calculatedLeverage: v.calculatedLeverage,
      leverageBuffer: v.leverageBufferX,
      totalLeverage: v.totalLeverage,
      executedLeverage,
      leverageWasCapped,
      estimatedMargin: parseFloat(marginUSD),
      maxPlannedLossINR: v.maxPlannedLossINR,
      maxNetProfitINR: v.maxNetProfitINR,
      upperBreakEvenUSD: v.upperBreakEvenUSD,
      lowerBreakEvenUSD: v.lowerBreakEvenUSD,
      isDryRun: dryRun,
      environment,
    };

    if (dryRun) {
      setDryRunPayload({
        note: "DRY RUN — this is the exact payload that WOULD be sent. No network call was made. No credentials included.",
        environment,
        ...payload,
      });
      setActiveTrade(snapshot);
      return;
    }

    if (!liveConfirmed) {
      setPlaceError(`Check the ${environment === "real" ? "real-account" : "demo-account"} confirmation box before placing an order.`);
      return;
    }
    if (!apiKey || !apiSecret) {
      setPlaceError("Enter your Delta API key and secret first.");
      return;
    }

    setPlacing(true);
    const res = await apiFetch("/api/delta/place-strangle", {
      apiKey,
      apiSecret,
      useTestnet: environment === "demo",
      ...payload,
    });
    setPlacing(false);
    if (!res.ok) {
      setPlaceError(res.error ?? "Order placement failed.");
      return;
    }
    const result = res.result as { callOrder: unknown; putOrder: unknown; executedLeverage: number };
    setActiveTrade({ ...snapshot, callOrder: result.callOrder, putOrder: result.putOrder, executedLeverage: result.executedLeverage });
    startPositionPolling();
  }

  function startPositionPolling() {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      const res = await apiFetch("/api/delta/positions", { apiKey, apiSecret, useTestnet: environment === "demo" });
      if (!res.ok) {
        setPositionsError(res.error ?? "Failed to fetch positions.");
        return;
      }
      setPositionsError(null);
      const rawList = Array.isArray(res.result) ? res.result : [res.result];
      setPositions(rawList);
      setLastPositionUpdate(Date.now());

      if (!activeTrade || activeTrade.callProductId === undefined || activeTrade.putProductId === undefined) return;
      const { call: callMark, put: putMark, contractSize: cs } = liveMarksRef.current;

      const rawCall = findPositionForProduct(rawList, activeTrade.callProductId);
      const rawPut = findPositionForProduct(rawList, activeTrade.putProductId);
      const newCallLeg = normalizePosition(rawCall, callMark, cs);
      const newPutLeg = normalizePosition(rawPut, putMark, cs);

      setCallLeg((prev) => {
        if (prev?.isOpen && !newCallLeg.isOpen) {
          setCallClosed({ exitPriceUSD: callMark, realizedPnlUSD: prev.unrealizedPnlUSD, exitTimestamp: Date.now() });
        }
        return newCallLeg;
      });
      setPutLeg((prev) => {
        if (prev?.isOpen && !newPutLeg.isOpen) {
          setPutClosed({ exitPriceUSD: putMark, realizedPnlUSD: prev.unrealizedPnlUSD, exitTimestamp: Date.now() });
        }
        return newPutLeg;
      });
    }, 2000);
  }

  function closeTrade() {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = null;
    setActiveTrade(null);
    setPositions(null);
    setPositionsError(null);
    setLastPositionUpdate(null);
    setCallLeg(null);
    setPutLeg(null);
    setCallClosed(null);
    setPutClosed(null);
    setDryRunPayload(null);
  }

  return (
    <>
      <div className="basis-full rounded-lg border border-warn-border dark:border-warn-border-dark bg-warn-bg dark:bg-warn-bg-dark px-3.5 py-3 mb-1">
        <p className="text-[11.5px] leading-snug text-warn-text dark:text-warn-text-dark">
          This page can place real leveraged orders with real capital. Dry Run (below) is the only part verified in
          this build — this sandbox has no network route to Delta's API, so the order-placement/leverage-setting
          code has never actually run against a real account. Test Connection first, then test Live with the
          smallest possible size before trusting this further. See <code>api/_lib/deltaClient.js</code> for detail.
        </p>
      </div>

      <div
        className={`basis-full rounded-lg px-3.5 py-2.5 mb-1 text-[13px] font-semibold ${
          environment === "real"
            ? "bg-risk/10 border border-risk dark:border-risk-dark text-risk dark:text-risk-dark"
            : "bg-warn-bg dark:bg-warn-bg-dark border border-warn-border dark:border-warn-border-dark text-warn-text dark:text-warn-text-dark"
        }`}
      >
        {environment === "real" ? "🔴 LIVE — REAL ACCOUNT" : "🟡 DEMO — TEST ACCOUNT"}
        <button onClick={logout} className="float-right text-[11px] font-normal underline">
          Log out of this page
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 basis-full">
        <div className="rounded-card border border-line dark:border-line-dark bg-card dark:bg-card-dark p-5 flex-1 min-w-[300px]">
          <h2 className="text-[15.5px] font-semibold text-ink dark:text-ink-dark m-0 mb-3.5">
            Delta Exchange API Credentials
          </h2>

          <label className="block mb-3">
            <span className="text-[12.5px] font-medium text-ink-muted dark:text-ink-muted-dark block mb-1.5">
              Environment
            </span>
            <select
              value={environment}
              onChange={(e) => setEnvironment(e.target.value as "real" | "demo")}
              className="w-full rounded-md border border-line dark:border-line-dark bg-field dark:bg-field-dark px-2.5 py-2 text-[13px] text-ink dark:text-ink-dark"
            >
              <option value="real">REAL ACCOUNT (api.india.delta.exchange)</option>
              <option value="demo">DEMO / TEST ACCOUNT (cdn-ind.testnet.deltaex.org)</option>
            </select>
            <p className="text-[10.5px] text-ink-faint dark:text-ink-faint-dark mt-1.5">
              REAL and DEMO are separate Delta accounts with separate API keys — a key from one will not
              authenticate on the other.
            </p>
          </label>

          <label className="block mb-3">
            <span className="text-[12.5px] font-medium text-ink-muted dark:text-ink-muted-dark block mb-1.5">
              API Key
            </span>
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
              className="w-full rounded-md border border-line dark:border-line-dark bg-field dark:bg-field-dark px-2.5 py-2 text-[13px] font-mono text-ink dark:text-ink-dark"
            />
          </label>
          <label className="block mb-3">
            <span className="text-[12.5px] font-medium text-ink-muted dark:text-ink-muted-dark block mb-1.5">
              API Secret
            </span>
            <input
              type="password"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              autoComplete="off"
              className="w-full rounded-md border border-line dark:border-line-dark bg-field dark:bg-field-dark px-2.5 py-2 text-[13px] font-mono text-ink dark:text-ink-dark"
            />
          </label>
          <p className="text-[10.5px] text-ink-faint dark:text-ink-faint-dark mb-3">
            Kept only in this page's memory — never written to disk, never persisted across a refresh, never logged.
            Sent to Delta only via the server-side /api routes, signed there — never signed or sent directly from
            this browser.
          </p>

          <div className="flex gap-2 mb-4">
            <button
              onClick={testConnection}
              disabled={!apiKey || !apiSecret || connectionStatus === "testing"}
              className="flex-1 rounded-md border border-line dark:border-line-dark px-3 py-2 text-[12.5px] text-ink dark:text-ink-dark disabled:opacity-50"
            >
              {connectionStatus === "testing" ? "Testing…" : "Test Connection"}
            </button>
            <button
              onClick={clearCredentials}
              className="rounded-md border border-line dark:border-line-dark px-3 py-2 text-[12.5px] text-ink-muted dark:text-ink-muted-dark"
            >
              Clear
            </button>
          </div>
          {connectionStatus === "ok" && (
            <p className="text-[12px] text-profit dark:text-profit-dark mb-3">✓ Connected to Delta Exchange</p>
          )}
          {connectionStatus === "failed" && (
            <ErrorBanner message={`✕ Authentication failed${connectionError ? `: ${connectionError}` : "."}`} />
          )}

          <h2 className="text-[15.5px] font-semibold text-ink dark:text-ink-dark m-0 mb-3.5 mt-5">
            BTC Option Chain
          </h2>
          <div className="text-[11px] text-ink-faint dark:text-ink-faint-dark mb-2.5">
            Expiry: {selectedExpiry ? formatExpiryLabel(selectedExpiry) : "—"} (nearest/0DTE auto-selected) · Updated{" "}
            {formatRelativeTime(lastUpdated)}
            {expiries.length > 0 && !expiries[0] && null}
          </div>
          {error && <ErrorBanner message={`Live option chain unavailable — ${error}. Manual entry required.`} />}
          <div className="mb-2.5 text-[12px] text-ink dark:text-ink-dark">
            BTC Index: {btcIndex !== null ? `${formatUSD(btcIndex, 0)} LIVE` : "unavailable"}
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <label className="block">
              <span className="text-[12.5px] font-medium text-ink-muted dark:text-ink-muted-dark block mb-1.5">
                CALL Strike
              </span>
              <select
                value={callStrike}
                onChange={(e) => handleSelectCallStrike(e.target.value)}
                className="w-full rounded-md border border-line dark:border-line-dark bg-field dark:bg-field-dark px-2.5 py-2 text-[13px] font-mono text-ink dark:text-ink-dark"
              >
                {callStrikes.map((s) => (
                  <option key={s} value={s}>
                    {formatUSD(s, 0)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[12.5px] font-medium text-ink-muted dark:text-ink-muted-dark block mb-1.5">
                PUT Strike
              </span>
              <select
                value={putStrike}
                onChange={(e) => handleSelectPutStrike(e.target.value)}
                className="w-full rounded-md border border-line dark:border-line-dark bg-field dark:bg-field-dark px-2.5 py-2 text-[13px] font-mono text-ink dark:text-ink-dark"
              >
                {putStrikes.map((s) => (
                  <option key={s} value={s}>
                    {formatUSD(s, 0)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] text-ink-faint dark:text-ink-faint-dark">Symmetry Buffer $</span>
            <input
              type="text"
              inputMode="decimal"
              value={symmetryBuffer}
              onChange={(e) => setSymmetryBuffer(e.target.value)}
              className="w-16 rounded border border-line dark:border-line-dark bg-field dark:bg-field-dark px-1.5 py-1 text-[11px] font-mono text-ink dark:text-ink-dark"
            />
            {symmetryStatus && (
              <span
                className={`text-[10.5px] ${symmetryStatus.withinBuffer ? "text-profit dark:text-profit-dark" : "text-warn-text dark:text-warn-text-dark"}`}
              >
                {symmetryStatus.withinBuffer ? "✓" : "⚠"} {symmetryStatus.withinBuffer ? "Within" : "Outside"} ${symmetryBuffer}{" "}
                Symmetry Buffer (diff {formatUSD(symmetryStatus.difference)}) — reference: {referenceLeg?.toUpperCase() ?? "—"}
              </span>
            )}
          </div>
          <div className="text-[11px] text-ink-faint dark:text-ink-faint-dark mb-3.5">
            CALL Premium: {callPremium ? formatUSD(parseFloat(callPremium)) : "—"} · PUT Premium:{" "}
            {putPremium ? formatUSD(parseFloat(putPremium)) : "—"}
            {(selectedCallContract?.productId === undefined || selectedPutContract?.productId === undefined) &&
              callStrike &&
              putStrike && (
                <span className="block text-warn-text dark:text-warn-text-dark mt-1">
                  ⚠ product_id not found on the selected contract(s) — live order placement will be blocked until
                  resolved.
                </span>
              )}
          </div>

          <h2 className="text-[15.5px] font-semibold text-ink dark:text-ink-dark m-0 mb-3.5 mt-5">
            Sizing (same engine as the Minimum Leverage Calculator)
          </h2>
          <NumberField label="Capital" unit="₹" value={capital} onChange={setCapital} />
          <NumberField label="Risk" unit="%" value={riskPct} onChange={setRiskPct} />
          <NumberField label="USD / INR" unit="" value={usdInr} onChange={setUsdInr} />
          <NumberField label="Contract Size" unit="BTC" value={contractSize} onChange={setContractSize} />
          <NumberField
            label="Margin Available / Required"
            unit="$ — independent of capital"
            value={marginUSD}
            onChange={setMarginUSD}
          />
          <NumberField
            label="Leverage Buffer"
            unit="× — added to calculated leverage before execution"
            value={leverageBuffer}
            onChange={setLeverageBuffer}
          />
        </div>

        <div className="flex-1 min-w-[300px]">
          {!calc ? (
            <div className="rounded-card border border-line dark:border-line-dark bg-card dark:bg-card-dark p-5">
              <p className="text-[12.5px] text-ink-faint dark:text-ink-faint-dark">
                Select CALL and PUT strikes from the live chain to see the calculated position.
              </p>
            </div>
          ) : !calc.ok ? (
            <ErrorBanner message={calc.error} />
          ) : (
            <div className="rounded-card border border-line dark:border-line-dark bg-card dark:bg-card-dark p-5">
              <h2 className="text-[15.5px] font-semibold text-ink dark:text-ink-dark m-0 mb-3.5">
                Calculated Position
              </h2>
              <ResultRow big label="Strategy" value={calc.value.strategy} />
              <ResultRow
                label="Call / Put Lots"
                value={`${formatNumber(calc.value.maxContracts)} / ${formatNumber(calc.value.maxContracts)}`}
              />
              <ResultRow
                label="Maximum Planned Loss"
                value={`${formatINR(calc.value.maxPlannedLossINR)} / ${formatUSD(calc.value.worstNetLossUSD)}`}
                tone="risk"
              />
              <ResultRow
                label="Theoretical Max Profit"
                value={`${formatINR(calc.value.maxNetProfitINR)} / ${formatUSD(calc.value.maxNetProfitUSD)}`}
                tone="profit"
              />
              <ResultRow
                label="Upper / Lower Break-even"
                value={`${formatUSD(calc.value.upperBreakEvenUSD, 0)} / ${formatUSD(calc.value.lowerBreakEvenUSD, 0)}`}
              />
              <ResultRow label="Total Fees (est.)" value={formatUSD(calc.value.totalFeeUSD)} />
              {calc.value.isSameDayExpiry && <ResultRow label="Expiry" value="0DTE / SAME-DAY" tone="risk" />}

              <div className="h-px bg-line dark:bg-line-dark my-3.5" />

              <ResultRow label="Calculated Leverage" value={`${formatNumber(calc.value.calculatedLeverage, 2)}×`} />
              <ResultRow label="Leverage Buffer" value={`+${formatNumber(calc.value.leverageBufferX, 2)}×`} />
              <ResultRow label="Total Leverage" value={`${formatNumber(calc.value.totalLeverage, 2)}×`} />
              <ResultRow
                big
                label="Executed Leverage"
                value={`${formatNumber(executedLeverage ?? 0, 2)}×`}
                tone="risk"
              />
              {leverageWasCapped && (
                <p className="text-[10.5px] text-warn-text dark:text-warn-text-dark -mt-1 mb-2">
                  Capped at {MAX_EXECUTION_LEVERAGE}× (exchange/application maximum execution cap) — Total Leverage
                  would have been {formatNumber(calc.value.totalLeverage, 2)}×.
                </p>
              )}

              <div className="h-px bg-line dark:bg-line-dark my-3.5" />

              <label className="flex items-center gap-2 mb-3 text-[13px] font-medium text-ink dark:text-ink-dark">
                <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
                {dryRun
                  ? "🟡 DRY RUN — no real orders"
                  : environment === "real"
                    ? "🔴 WILL PLACE A REAL ORDER"
                    : "🟡 WILL PLACE A DEMO ORDER"}
              </label>

              {!dryRun && (
                <label className="flex items-center gap-2 mb-3 text-[11.5px] text-warn-text dark:text-warn-text-dark">
                  <input type="checkbox" checked={liveConfirmed} onChange={(e) => setLiveConfirmed(e.target.checked)} />
                  I understand this will place a {environment === "real" ? "REAL" : "demo"} order on my Delta
                  Exchange {environment === "real" ? "account (real funds)" : "test account"}.
                </label>
              )}

              <button
                onClick={handlePlaceOrder}
                disabled={placing || (!dryRun && !liveConfirmed)}
                className={`w-full rounded-md px-3 py-2.5 text-[13px] font-semibold disabled:opacity-50 ${
                  dryRun
                    ? "border border-line dark:border-line-dark text-ink dark:text-ink-dark"
                    : "bg-risk dark:bg-risk-dark text-white"
                }`}
              >
                {placing ? "Placing…" : dryRun ? "Run Dry Run" : environment === "real" ? "PLACE REAL ORDER" : "PLACE DEMO ORDER"}
              </button>

              {placeError && <ErrorBanner message={placeError} />}
            </div>
          )}

          {dryRunPayload && (
            <div className="rounded-card border border-line dark:border-line-dark bg-result dark:bg-result-dark p-4 mt-3.5">
              <p className="text-[11px] font-semibold text-ink-muted dark:text-ink-muted-dark mb-2">
                DRY RUN — NO LIVE ORDER WAS SENT
              </p>
              <pre className="text-[10.5px] font-mono text-ink dark:text-ink-dark whitespace-pre-wrap overflow-x-auto">
                {JSON.stringify(dryRunPayload, null, 2)}
              </pre>
            </div>
          )}

          {activeTrade && activeTrade.isDryRun && (
            <div className="rounded-card border border-line dark:border-line-dark bg-card dark:bg-card-dark p-5 mt-3.5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[15.5px] font-semibold text-ink dark:text-ink-dark m-0">Simulated Trade Summary</h2>
                <button onClick={closeTrade} className="text-[11px] text-ink-faint dark:text-ink-faint-dark underline">
                  Dismiss
                </button>
              </div>
              <ResultRow label="Environment" value={activeTrade.environment === "real" ? "REAL ACCOUNT" : "DEMO ACCOUNT"} />
              <ResultRow label="Entry Time" value={formatIST(activeTrade.timestamp)} />
              <ResultRow label="Expiry" value={activeTrade.expiryLabel} />
              <ResultRow label="CALL" value={`${formatUSD(activeTrade.callStrike, 0)} × ${activeTrade.callLots} @ ${formatUSD(activeTrade.callPremium)}`} />
              <ResultRow label="PUT" value={`${formatUSD(activeTrade.putStrike, 0)} × ${activeTrade.putLots} @ ${formatUSD(activeTrade.putPremium)}`} />
              <ResultRow label="Calculated Leverage" value={`${formatNumber(activeTrade.calculatedLeverage, 2)}×`} />
              <ResultRow big label="Executed Leverage" value={`${formatNumber(activeTrade.executedLeverage, 2)}×`} tone={activeTrade.leverageWasCapped ? "risk" : "neutral"} />
              <ResultRow label="Margin Used (est.)" value={formatUSD(activeTrade.estimatedMargin)} />
              <ResultRow label="Theoretical Profit / Risk" value={`${formatINR(activeTrade.maxNetProfitINR)} / ${formatINR(activeTrade.maxPlannedLossINR)}`} />
            </div>
          )}

          {activeTrade && !activeTrade.isDryRun && (
            <LiveTradeDashboard
              trade={activeTrade}
              callLeg={callLeg}
              putLeg={putLeg}
              callClosed={callClosed}
              putClosed={putClosed}
              overallPnl={overallPnl}
              lastPositionUpdate={lastPositionUpdate}
              positionsError={positionsError}
              nowTick={nowTick}
              onCloseStrangle={closeTrade}
            />
          )}
        </div>
      </div>
    </>
  );
}

interface LiveTradeDashboardProps {
  trade: TradeSnapshot;
  callLeg: NormalizedLegPosition | null;
  putLeg: NormalizedLegPosition | null;
  callClosed: { exitPriceUSD: number | null; realizedPnlUSD: number | null; exitTimestamp: number } | null;
  putClosed: { exitPriceUSD: number | null; realizedPnlUSD: number | null; exitTimestamp: number } | null;
  overallPnl: { unrealizedINR: number; realizedINR: number; totalINR: number };
  lastPositionUpdate: number | null;
  positionsError: string | null;
  nowTick: number;
  onCloseStrangle: () => void;
}

function pnlTone(usd: number | null): "profit" | "risk" | "neutral" {
  if (usd === null || usd === 0) return "neutral";
  return usd > 0 ? "profit" : "risk";
}

function signed(value: number, formatter: (n: number) => string): string {
  return `${value >= 0 ? "+" : ""}${formatter(value)}`;
}

/**
 * The fixed-component trading dashboard — every value here updates in
 * place via React state (callLeg/putLeg/overallPnl re-render this same
 * tree every ~2s poll or 1s tick); nothing is ever appended as a new
 * element, and no raw API response is rendered directly.
 */
function LiveTradeDashboard({
  trade,
  callLeg,
  putLeg,
  callClosed,
  putClosed,
  overallPnl,
  lastPositionUpdate,
  positionsError,
  nowTick,
  onCloseStrangle,
}: LiveTradeDashboardProps) {
  const [confirmingClose, setConfirmingClose] = useState(false);

  const secondsSinceUpdate = lastPositionUpdate ? Math.round((nowTick - lastPositionUpdate) / 1000) : null;
  const isStale = secondsSinceUpdate !== null && secondsSinceUpdate > 6;
  const bothClosed = Boolean(callClosed && putClosed);

  const overallStatus = bothClosed
    ? "CLOSED"
    : callClosed || putClosed
      ? "PARTIAL STRANGLE — ONE LEG CLOSED"
      : callLeg?.isOpen && putLeg?.isOpen
        ? "ACTIVE"
        : "SUBMITTING";

  return (
    <div className="mt-3.5">
      {/* Overall MTM card */}
      <div className="rounded-card border border-line dark:border-line-dark bg-card dark:bg-card-dark p-5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted dark:text-ink-muted-dark">
            Overall MTM / UPNL
          </span>
          <span className="text-[10.5px] text-ink-faint dark:text-ink-faint-dark flex items-center gap-1">
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${isStale ? "bg-warn-text dark:bg-warn-text-dark" : "bg-profit dark:bg-profit-dark animate-pulse"}`}
            />
            {isStale ? "STALE" : "LIVE"} · Updated {secondsSinceUpdate ?? "—"}s ago
          </span>
        </div>
        <div
          className={`text-[28px] font-semibold leading-tight mb-3 ${
            overallPnl.totalINR > 0
              ? "text-profit dark:text-profit-dark"
              : overallPnl.totalINR < 0
                ? "text-risk dark:text-risk-dark"
                : "text-ink dark:text-ink-dark"
          }`}
        >
          {signed(overallPnl.totalINR, formatINR)}
        </div>
        <div className="grid grid-cols-2 gap-x-6">
          <ResultRow label="Unrealized" value={signed(overallPnl.unrealizedINR, formatINR)} tone={pnlTone(overallPnl.unrealizedINR)} />
          <ResultRow label="Realized" value={signed(overallPnl.realizedINR, formatINR)} tone={pnlTone(overallPnl.realizedINR)} />
        </div>
        <ResultRow label="Margin Used" value={formatUSD((callLeg?.marginUSD ?? 0) + (putLeg?.marginUSD ?? 0) || trade.estimatedMargin)} />
        <ResultRow label="Entry Time" value={formatIST(trade.timestamp)} />
        <ResultRow label="Trade Status" value={overallStatus} tone={overallStatus === "ACTIVE" ? "neutral" : overallStatus === "CLOSED" ? "neutral" : "risk"} />
        {positionsError && <ErrorBanner message={`Position updates interrupted: ${positionsError}`} />}
      </div>

      {/* Per-leg cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mt-3.5">
        <LegCard
          label="CALL"
          strikeUSD={trade.callStrike}
          requestedLots={trade.callLots}
          entryPremiumPreTrade={trade.callPremium}
          leg={callLeg}
          closed={callClosed}
          entryTimestamp={trade.timestamp}
        />
        <LegCard
          label="PUT"
          strikeUSD={trade.putStrike}
          requestedLots={trade.putLots}
          entryPremiumPreTrade={trade.putPremium}
          leg={putLeg}
          closed={putClosed}
          entryTimestamp={trade.timestamp}
        />
      </div>

      {/* Theoretical strangle — frozen at entry, never recalculated live */}
      <div className="rounded-card border border-line dark:border-line-dark bg-card dark:bg-card-dark p-5 mt-3.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted dark:text-ink-muted-dark block mb-2">
          Theoretical Strangle — at entry
        </span>
        <div className="grid grid-cols-2 gap-x-6">
          <ResultRow label="Max Profit" value={formatINR(trade.maxNetProfitINR)} tone="profit" />
          <ResultRow label="Risk" value={formatINR(trade.maxPlannedLossINR)} tone="risk" />
          <ResultRow label="Lower B/E" value={formatUSD(trade.lowerBreakEvenUSD, 0)} />
          <ResultRow label="Upper B/E" value={formatUSD(trade.upperBreakEvenUSD, 0)} />
        </div>
      </div>

      {/* Close strangle */}
      {!bothClosed && (
        <div className="mt-3.5">
          {!confirmingClose ? (
            <button
              onClick={() => setConfirmingClose(true)}
              className="w-full rounded-md border border-risk dark:border-risk-dark text-risk dark:text-risk-dark px-3 py-2.5 text-[13px] font-semibold"
            >
              Close Strangle
            </button>
          ) : (
            <div className="rounded-card border border-risk dark:border-risk-dark bg-card dark:bg-card-dark p-4">
              <p className="text-[12.5px] text-ink dark:text-ink-dark mb-3">Close both open legs?</p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setConfirmingClose(false);
                    onCloseStrangle();
                  }}
                  className="flex-1 rounded-md bg-risk dark:bg-risk-dark text-white px-3 py-2 text-[12.5px] font-semibold"
                >
                  Confirm Close
                </button>
                <button
                  onClick={() => setConfirmingClose(false)}
                  className="rounded-md border border-line dark:border-line-dark px-3 py-2 text-[12.5px] text-ink dark:text-ink-dark"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface LegCardProps {
  label: "CALL" | "PUT";
  strikeUSD: number;
  requestedLots: number;
  entryPremiumPreTrade: number;
  leg: NormalizedLegPosition | null;
  closed: { exitPriceUSD: number | null; realizedPnlUSD: number | null; exitTimestamp: number } | null;
  entryTimestamp: number;
}

function LegCard({ label, strikeUSD, requestedLots, entryPremiumPreTrade, leg, closed, entryTimestamp }: LegCardProps) {
  const isClosed = Boolean(closed);
  const entryPriceUSD = leg?.entryPriceUSD ?? (isClosed ? null : entryPremiumPreTrade);
  const targetUSD = entryPriceUSD !== null ? entryPriceUSD * 0.1 : null;
  const stopUSD = entryPriceUSD !== null ? entryPriceUSD * 5 : null;
  const status = isClosed ? "CLOSED" : leg === null ? "PENDING" : leg.isOpen ? "OPEN" : "PENDING";
  const observedSize = leg ? Math.abs(leg.size) : null;
  const lotsMismatch = observedSize !== null && observedSize > 0 && observedSize !== requestedLots;

  return (
    <div className="rounded-card border border-line dark:border-line-dark bg-card dark:bg-card-dark p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="text-[14px] font-semibold text-ink dark:text-ink-dark">{label}</span>
          <span className="text-[11.5px] text-ink-faint dark:text-ink-faint-dark ml-2">
            {formatUSD(strikeUSD, 0)} · SHORT
          </span>
        </div>
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
            status === "OPEN"
              ? "bg-profit/10 text-profit dark:text-profit-dark"
              : status === "CLOSED"
                ? "bg-line dark:bg-line-dark text-ink-muted dark:text-ink-muted-dark"
                : "bg-warn-bg dark:bg-warn-bg-dark text-warn-text dark:text-warn-text-dark"
          }`}
        >
          {status}
        </span>
      </div>

      <ResultRow label="Lots Requested" value={String(requestedLots)} />
      <ResultRow
        label="Position Size"
        value={observedSize !== null ? String(observedSize) : "—"}
        tone={lotsMismatch ? "risk" : "neutral"}
      />
      {lotsMismatch && (
        <ErrorBanner message={`PARTIAL FILL — requested ${requestedLots}, observed position size ${observedSize}.`} />
      )}

      <ResultRow label="Entry Price" value={entryPriceUSD !== null ? formatUSD(entryPriceUSD) : "— (awaiting fill)"} />
      {!isClosed && (
        <ResultRow
          label="Mark Price"
          value={leg?.markPriceUSD !== null && leg?.markPriceUSD !== undefined ? `${formatUSD(leg.markPriceUSD)} LIVE` : "—"}
        />
      )}
      {isClosed ? (
        <ResultRow label="Exit Price" value={closed?.exitPriceUSD !== null && closed?.exitPriceUSD !== undefined ? formatUSD(closed.exitPriceUSD) : "—"} />
      ) : (
        <ResultRow
          label="UPNL"
          value={leg?.unrealizedPnlUSD !== null && leg?.unrealizedPnlUSD !== undefined ? signed(leg.unrealizedPnlUSD, formatUSD) : "—"}
          tone={pnlTone(leg?.unrealizedPnlUSD ?? null)}
        />
      )}
      {isClosed && (
        <ResultRow
          label="Realized PnL (approx., at close)"
          value={closed?.realizedPnlUSD !== null && closed?.realizedPnlUSD !== undefined ? signed(closed.realizedPnlUSD, formatUSD) : "—"}
          tone={pnlTone(closed?.realizedPnlUSD ?? null)}
        />
      )}

      <ResultRow label="Liquidation" value={leg?.liquidationPriceUSD !== null && leg?.liquidationPriceUSD !== undefined ? formatUSD(leg.liquidationPriceUSD) : "N/A"} />
      <ResultRow label="Margin Used" value={leg?.marginUSD !== null && leg?.marginUSD !== undefined ? formatUSD(leg.marginUSD) : "—"} />
      <ResultRow label="Target (90% decay)" value={targetUSD !== null ? formatUSD(targetUSD) : "—"} />
      <ResultRow label="Stop Loss (400%)" value={stopUSD !== null ? formatUSD(stopUSD) : "—"} />
      <ResultRow label="Entry Time" value={formatIST(entryTimestamp)} />
      <ResultRow label="Exit Time" value={closed ? formatIST(closed.exitTimestamp) : "—"} />
    </div>
  );
}

export function LiveTradeExecutionPage() {
  return (
    <Layout
      title="Live Trade Execution"
      subtitle="Smart Short Strangle — 0DTE/nearest expiry, real Delta Exchange India execution"
    >
      <AuthGate>
        <LiveTradeExecutionInner />
      </AuthGate>
      <OtherCalculatorsNav />
    </Layout>
  );
}
