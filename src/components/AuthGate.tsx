import { useEffect, useState, type ReactNode } from "react";

interface AuthGateProps {
  children: ReactNode;
}

/**
 * Gates its children behind the app-level password (api/_lib/auth.js).
 * Only wraps the Live Trade Execution page — the calculators don't call
 * any private Delta route, so they don't need this.
 */
export function AuthGate({ children }: AuthGateProps) {
  const [status, setStatus] = useState<"checking" | "authed" | "unauthed">("checking");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/auth/session", { credentials: "same-origin" })
      .then((res) => res.json())
      .then((json) => setStatus(json.authenticated ? "authed" : "unauthed"))
      .catch(() => setStatus("unauthed"));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (json.ok) {
        setStatus("authed");
      } else {
        setError(json.error ?? "Login failed.");
      }
    } catch {
      setError("Could not reach the login endpoint. If you're running `npm run dev` locally, the /api routes only work under `vercel dev` — see README.");
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "checking") {
    return <div className="text-[12.5px] text-ink-faint dark:text-ink-faint-dark px-1">Checking session…</div>;
  }

  if (status === "unauthed") {
    return (
      <div className="rounded-card border border-line dark:border-line-dark bg-card dark:bg-card-dark p-6 max-w-sm mx-auto mt-10">
        <h2 className="text-[16px] font-semibold text-ink dark:text-ink-dark mb-1">Live Trade Execution — Login</h2>
        <p className="text-[12px] text-ink-faint dark:text-ink-faint-dark mb-4">
          This page places real orders and needs its own password, separate from your Delta credentials.
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            placeholder="App password"
            className="w-full rounded-md border border-line dark:border-line-dark bg-field dark:bg-field-dark px-2.5 py-2 text-[13px] font-mono text-ink dark:text-ink-dark mb-3"
          />
          <button
            type="submit"
            disabled={submitting || !password}
            className="w-full rounded-md border border-line dark:border-line-dark px-3 py-2 text-[13px] font-medium text-ink dark:text-ink-dark disabled:opacity-50"
          >
            {submitting ? "Checking…" : "Log In"}
          </button>
        </form>
        {error && <p className="text-[11.5px] text-risk dark:text-risk-dark mt-3">{error}</p>}
      </div>
    );
  }

  return <>{children}</>;
}
