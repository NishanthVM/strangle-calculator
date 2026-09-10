import { requireAuth } from "../_lib/auth.js";
import { setLeverage, placeMarketOrder } from "../_lib/deltaClient.js";
import { extractCreds, redact } from "../_lib/helpers.js";

/**
 * Hard execution cap, enforced here server-side as well as in the UI —
 * never trust the client-computed leverage alone for something that
 * mutates a real account. See LiveTradeExecutionPage.tsx for the
 * Calculated / Buffer / Total / Executed leverage terminology this
 * mirrors.
 */
const MAX_EXECUTION_LEVERAGE = 200;

async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed." });
    return;
  }
  console.log("POST /api/delta/place-strangle", redact(req.body));

  try {
    const creds = extractCreds(req.body);
    const { callProductId, putProductId, callSize, putSize, totalLeverage, clientOrderIdPrefix } = req.body ?? {};

    if (!callProductId || !putProductId || !callSize || !putSize || !totalLeverage) {
      throw new Error("Missing required strangle execution parameters.");
    }

    const executedLeverage = Math.min(Number(totalLeverage), MAX_EXECUTION_LEVERAGE);

    await setLeverage({ ...creds, productId: callProductId, leverage: executedLeverage });
    await setLeverage({ ...creds, productId: putProductId, leverage: executedLeverage });

    const callOrder = await placeMarketOrder({
      ...creds,
      productId: callProductId,
      size: callSize,
      side: "sell",
      clientOrderId: `${clientOrderIdPrefix}_CALL`,
    });

    const putOrder = await placeMarketOrder({
      ...creds,
      productId: putProductId,
      size: putSize,
      side: "sell",
      clientOrderId: `${clientOrderIdPrefix}_PUT`,
    });

    res.status(200).json({
      ok: true,
      result: { callOrder, putOrder, requestedLeverage: totalLeverage, executedLeverage },
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, deltaError: err.deltaError ?? null });
  }
}

export default requireAuth(handler);
