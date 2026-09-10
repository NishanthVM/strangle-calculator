import { requireAuth } from "../_lib/auth.js";
import { placeMarketOrder } from "../_lib/deltaClient.js";
import { extractCreds, redact } from "../_lib/helpers.js";

async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed." });
    return;
  }
  console.log("POST /api/delta/close-leg", redact(req.body));
  try {
    const creds = extractCreds(req.body);
    const { productId, size } = req.body ?? {};
    if (!productId || !size) throw new Error("Missing productId/size for close-leg.");
    const result = await placeMarketOrder({
      ...creds,
      productId,
      size,
      side: "buy",
      reduceOnly: true,
      clientOrderId: `close_${Date.now()}`,
    });
    res.status(200).json({ ok: true, result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, deltaError: err.deltaError ?? null });
  }
}

export default requireAuth(handler);
