import { requireAuth } from "../_lib/auth.js";
import { getPositions } from "../_lib/deltaClient.js";
import { extractCreds, redact } from "../_lib/helpers.js";

async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed." });
    return;
  }
  console.log("POST /api/delta/positions", redact(req.body));
  try {
    const result = await getPositions(extractCreds(req.body));
    res.status(200).json({ ok: true, result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, deltaError: err.deltaError ?? null });
  }
}

export default requireAuth(handler);
