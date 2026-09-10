/**
 * Minimal app-level authentication so the public Vercel URL alone can't
 * be used to access the trading dashboard or call any private Delta
 * route. No database — a single shared APP_PASSWORD (set as a Vercel
 * environment variable, never NEXT_PUBLIC_/VITE_ prefixed, so it's
 * never bundled into client JS) gates a signed, HttpOnly session
 * cookie.
 *
 * This is intentionally simple (one password, one session, no user
 * accounts) — appropriate for a single-operator trading dashboard, not
 * a multi-user product. If you need per-user accounts later, replace
 * verifyPassword()'s comparison with a real user lookup; the
 * cookie-signing mechanics below don't need to change.
 */

import crypto from "node:crypto";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET environment variable is not configured on the server.");
  }
  return secret;
}

function sign(value) {
  return crypto.createHmac("sha256", getSessionSecret()).update(value).digest("hex");
}

export function createSessionCookie() {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = String(expiresAt);
  const signature = sign(payload);
  const token = `${payload}.${signature}`;
  return `session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

export function clearSessionCookie() {
  return "session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0";
}

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

/** Returns true if the request carries a valid, unexpired session cookie. */
export function isAuthenticated(req) {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies.session;
    if (!token) return false;

    const [payload, signature] = token.split(".");
    if (!payload || !signature) return false;

    const expected = sign(payload);
    const sigBuf = Buffer.from(signature, "hex");
    const expectedBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return false;

    const expiresAt = Number(payload);
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

    return true;
  } catch {
    return false;
  }
}

export function verifyPassword(candidate) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    throw new Error("APP_PASSWORD environment variable is not configured on the server.");
  }
  const a = Buffer.from(String(candidate ?? ""));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Wraps a Vercel serverless handler so it 401s automatically unless the
 * request has a valid session — put this around every private Delta
 * route. Never wraps /api/auth/* itself.
 */
export function requireAuth(handler) {
  return async (req, res) => {
    if (!isAuthenticated(req)) {
      res.status(401).json({ ok: false, error: "Not authenticated. Log in first." });
      return;
    }
    return handler(req, res);
  };
}
