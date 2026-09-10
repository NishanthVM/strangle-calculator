import { requireAuth } from "../_lib/auth.js";
import { cancelOrder } from "../_lib/deltaClient.js";
import { extractCreds, redact } from "../_lib/helpers.js";

async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed." });
    return;
  }
  console.log("POST /api/delta/cancel-order", redact(req.body));
  try {
    const creds = extractCreds(req.body);
    const { productId, orderId } = req.body ?? {};
    if (!productId || !orderId) throw new Error("Missing productId/orderId for cancel-order.");
    const result = await cancelOrder({ ...creds, productId, orderId });
    res.status(200).json({ ok: true, result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, deltaError: err.deltaError ?? null });
  }
}

export default requireAuth(handler);
