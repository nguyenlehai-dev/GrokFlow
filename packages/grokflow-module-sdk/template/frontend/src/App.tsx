import { useEffect, useState } from "react";
import { Button, Card, useToast } from "@grokflow/ui";

/** Hello-world page.
 *
 * Demonstrates the typical module bootstrap:
 *  1. read the user JWT injected by core into the iframe URL `?token=...`
 *  2. call the module's own BE (which forwards to core /api/sdk/users/me
 *     using the service token)
 *  3. render the user info — proves the auth round-trip works end-to-end
 */
export function App() {
  const { toast } = useToast();
  const [me, setMe] = useState<{ email: string; full_name: string | null; role: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Token comes from iframe URL — core injects it on mount.
  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  useEffect(() => {
    if (!token) {
      setError("No token in URL — module must be opened via core admin shell.");
      return;
    }
    setLoading(true);
    fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      })
      .then(setMe)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div style={{ padding: "2rem", maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.75rem", marginBottom: "1rem" }}>
        Hello from the module 👋
      </h1>

      <Card title="Auth round-trip">
        {loading && <div>Loading…</div>}
        {error && <div style={{ color: "var(--gf-danger)" }}>{error}</div>}
        {me && (
          <div style={{ display: "grid", gap: "0.4rem" }}>
            <div><strong>email:</strong> {me.email}</div>
            <div><strong>full_name:</strong> {me.full_name ?? "—"}</div>
            <div><strong>role:</strong> {me.role}</div>
          </div>
        )}
      </Card>

      <div style={{ marginTop: "1.5rem" }}>
        <Button onClick={() => toast({ message: "Toast works!", variant: "success" })}>
          Show toast
        </Button>
      </div>
    </div>
  );
}
