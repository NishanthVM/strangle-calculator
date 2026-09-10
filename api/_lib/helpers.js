export function redact(body) {
  if (!body || typeof body !== "object") return body;
  const { apiSecret, ...rest } = body;
  return { ...rest, apiSecret: apiSecret ? "[REDACTED]" : undefined };
}

export function extractCreds(body) {
  const { apiKey, apiSecret, useTestnet } = body ?? {};
  return { apiKey, apiSecret, useTestnet: Boolean(useTestnet) };
}
