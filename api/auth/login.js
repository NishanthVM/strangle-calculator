import { createSessionCookie, verifyPassword } from "../_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed." });
    return;
  }

  try {
    const { password } = req.body ?? {};
    if (!verifyPassword(password)) {
      res.status(401).json({ ok: false, error: "Incorrect password." });
      return;
    }
    res.setHeader("Set-Cookie", createSessionCookie());
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
