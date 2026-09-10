/**
 * Delta Exchange India signed-request client.
 *
 * ============================================================
 * VERIFICATION STATUS: UNVERIFIED AGAINST A LIVE ACCOUNT.
 * ============================================================
 * This file was built entirely from public documentation and one
 * concrete real-world data point (a Delta Exchange community forum
 * post showing an actual "Signature Mismatch" error whose payload
 * revealed the true signature_data format:
 *
 *   signature_data = METHOD + TIMESTAMP + PATH + BODY_JSON
 *   (concatenated directly, no separators, no query string in that
 *   example since it was a POST with no query params)
 *
 *   e.g. "POST1740429645/v2/orders{\"product_id\": 27, \"size\": 1, ...}"
 *
 * signature = HMAC-SHA256(api_secret, signature_data), hex digest.
 *
 * This sandbox has NO network route to api.india.delta.exchange, so
 * NONE of the request/signing code below has actually been executed
 * against Delta's servers. Before trusting this with real capital:
 *   1. Test against Delta's testnet first if you have testnet
 *      credentials (base URL below is swappable) — testConnection()
 *      is the safest first call, since it's read-only.
 *   2. Only then test a real order with the smallest possible size.
 *   3. Watch the raw error response on any signature failure — Delta
 *      returns the exact signature_data string it expected in the
 *      error context, which is enough to debug a mismatch directly.
 */

import crypto from "node:crypto";

const PRODUCTION_INDIA_BASE_URL = "https://api.india.delta.exchange";
const TESTNET_INDIA_BASE_URL = "https://cdn-ind.testnet.deltaex.org";

export function getBaseUrl(useTestnet) {
  return useTestnet ? TESTNET_INDIA_BASE_URL : PRODUCTION_INDIA_BASE_URL;
}

function sign(apiSecret, method, timestamp, path, queryString, bodyString) {
  const payload = `${method.toUpperCase()}${timestamp}${path}${queryString ?? ""}${bodyString ?? ""}`;
  return crypto.createHmac("sha256", apiSecret).update(payload).digest("hex");
}

const REQUEST_TIMEOUT_MS = 10000;

async function deltaFetch(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Delta Exchange request timed out after ${REQUEST_TIMEOUT_MS}ms.`);
    }
    throw new Error(`Network error reaching Delta Exchange: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Makes one signed request to Delta Exchange. Never logs apiSecret;
 * never includes it in the returned/thrown error.
 */
export async function deltaRequest({ apiKey, apiSecret, method, path, query, body, useTestnet }) {
  if (!apiKey || !apiSecret) {
    throw new Error("Delta API key/secret are required for this request.");
  }

  const baseUrl = getBaseUrl(useTestnet);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const queryString = query
    ? "?" +
      Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join("&")
    : "";
  const bodyString = body ? JSON.stringify(body) : "";

  const signature = sign(apiSecret, method, timestamp, path, queryString, bodyString);

  const url = `${baseUrl}${path}${queryString}`;
  const res = await deltaFetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "api-key": apiKey,
      signature,
      timestamp,
    },
    body: bodyString || undefined,
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Delta returned a non-JSON response (status ${res.status}).`);
  }

  if (!res.ok || json.success === false) {
    // Surface Delta's own error message/code — never the secret, never the raw signature.
    const message = json?.error?.message || json?.error?.code || `Delta request failed (status ${res.status}).`;
    const error = new Error(message);
    error.deltaError = json?.error;
    throw error;
  }

  return json.result ?? json;
}

/** Read-only — safe to call to verify credentials without touching account state. */
export function testConnection({ apiKey, apiSecret, useTestnet }) {
  return deltaRequest({ apiKey, apiSecret, method: "GET", path: "/v2/positions/margined", useTestnet });
}

export function getPositions({ apiKey, apiSecret, useTestnet }) {
  return deltaRequest({ apiKey, apiSecret, method: "GET", path: "/v2/positions/margined", useTestnet });
}

export function getOrders({ apiKey, apiSecret, useTestnet, state }) {
  return deltaRequest({
    apiKey,
    apiSecret,
    method: "GET",
    path: "/v2/orders",
    query: state ? { state } : undefined,
    useTestnet,
  });
}

/** Mutates account state — sets leverage for new orders on this product. */
export function setLeverage({ apiKey, apiSecret, useTestnet, productId, leverage }) {
  return deltaRequest({
    apiKey,
    apiSecret,
    method: "POST",
    path: `/v2/products/${productId}/orders/leverage`,
    body: { leverage: String(leverage) },
    useTestnet,
  });
}

/** Places a real market order. SELL for opening a short strangle leg. */
export function placeMarketOrder({ apiKey, apiSecret, useTestnet, productId, size, side, clientOrderId, reduceOnly }) {
  return deltaRequest({
    apiKey,
    apiSecret,
    method: "POST",
    path: "/v2/orders",
    body: {
      product_id: productId,
      size,
      side,
      order_type: "market_order",
      client_order_id: clientOrderId,
      reduce_only: Boolean(reduceOnly),
    },
    useTestnet,
  });
}

export function cancelOrder({ apiKey, apiSecret, useTestnet, productId, orderId }) {
  return deltaRequest({
    apiKey,
    apiSecret,
    method: "DELETE",
    path: "/v2/orders",
    body: { product_id: productId, id: orderId },
    useTestnet,
  });
}
