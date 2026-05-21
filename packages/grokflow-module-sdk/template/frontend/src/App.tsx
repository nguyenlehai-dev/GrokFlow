import { useEffect, useState } from "react";

/** Hello-world page demonstrating the SDK auth round-trip.
 *
 * Flow:
 *   1. Core embeds the iframe with `?token=<user JWT>`
 *   2. We pass that token to the module's BE (which forwards to
 *      /api/sdk/users/me with the service token core injected at spawn)
 *   3. BE returns the user's email/role
 *
 * Modules that grow beyond a single page can drop in react-router or
 * any state library — this template stays tiny on purpose.
 */
export function App() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [me, setMe] = useState<{ email: string; full_name: string | null; role: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setError("No token in URL — module must be opened via core admin shell.");
      setLoading(false);
      return;
    }
    // Use a relative URL so the fetch resolves against the iframe's
    // current path (`/m/<slug>/`) → `/m/<slug>/api/me` → nginx routes
    // to the module's BE. Absolute "/api/me" would hit the parent
    // shell instead and 404.
    fetch("api/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      })
      .then(setMe)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div style={page}>
      <h1 style={h1}>Hello from your module 👋</h1>
      <div style={card}>
        <div style={cardTitle}>Auth round-trip</div>
        {loading && <div>Loading…</div>}
        {error && <div style={errBox}>{error}</div>}
        {me && (
          <div style={{ display: "grid", gap: "0.4rem" }}>
            <div><strong>email:</strong> {me.email}</div>
            <div><strong>full_name:</strong> {me.full_name ?? "—"}</div>
            <div><strong>role:</strong> {me.role}</div>
          </div>
        )}
      </div>
      <p style={footer}>
        Replace this page with your module's UI. The token comes from core
        via the iframe URL — forward it to your BE which validates via
        <code> /api/sdk/auth/verify</code>.
      </p>
    </div>
  );
}

const page: React.CSSProperties = {
  padding: "2rem",
  maxWidth: 720,
  margin: "0 auto",
  fontFamily: "var(--gf-font, ui-sans-serif, system-ui, sans-serif)",
  color: "var(--gf-fg, #0f172a)",
  background: "var(--gf-bg, #ffffff)",
};
const h1: React.CSSProperties = { fontSize: "1.75rem", marginBottom: "1rem" };
const card: React.CSSProperties = {
  background: "var(--gf-bg, #ffffff)",
  border: "1px solid var(--gf-border, #e2e8f0)",
  borderRadius: "var(--gf-radius, 0.5rem)",
  padding: "1rem",
};
const cardTitle: React.CSSProperties = { fontWeight: 600, marginBottom: "0.5rem" };
const errBox: React.CSSProperties = {
  color: "var(--gf-danger, #e11d48)",
  background: "rgba(225,29,72,0.08)",
  padding: "0.6rem",
  borderRadius: "0.4rem",
  fontSize: "0.9rem",
};
const footer: React.CSSProperties = {
  marginTop: "1.5rem",
  fontSize: "0.85rem",
  color: "var(--gf-fg-muted, #64748b)",
};
