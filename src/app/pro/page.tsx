"use client";

import { useState, useEffect, useCallback } from "react";
import type { ScheduleConfig } from "@/lib/store";
import { ProWalletIsland } from "@/components/pro/ProWalletIsland";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type ProSession = {
  identity: {
    stripeCustomerId: string | null;
    email: string | null;
    walletAddress: string | null;
  };
  entitlements: {
    stripe: boolean;
    onchain: boolean;
  };
};

export default function ProSettings() {
  const [customerId, setCustomerId] = useState("");
  const [email, setEmail] = useState("");
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [session, setSession] = useState<ProSession | null>(null);
  const [schedules, setSchedules] = useState<ScheduleConfig[]>([]);
  const [feedToken, setFeedToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [sessionChecking, setSessionChecking] = useState(true);

  // Form state
  const [schemaFqn, setSchemaFqn] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly">("weekly");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [hour, setHour] = useState(9);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [source, setSource] = useState<"openmetadata" | "dbt-cloud" | "dbt-local" | "the-graph" | "dune">("openmetadata");

  useEffect(() => {
    fetch("/api/pro/auth/session")
      .then((r) => r.json())
      .then((data) => {
        if (data?.session) {
          setSession(data.session);
          setCustomerId(data.session.identity.stripeCustomerId ?? "");
          setEmail(data.session.identity.email ?? "");
          setWalletAddress(data.session.identity.walletAddress ?? null);
          loadSchedules();
        }
      })
      .catch(() => setStatus("Couldn’t verify your session yet. You can still sign in below."))
      .finally(() => setSessionChecking(false));
  }, []);

  async function loadSchedules() {
    setLoading(true);
    try {
      const res = await fetch("/api/schedules");
      const data = await res.json();
      if (data.ok) { setSchedules(data.schedules); setFeedToken(data.feedToken); }
      else setStatus(`Error: ${data.error}`);
    } catch { setStatus("Failed to load schedules"); }
    finally { setLoading(false); }
  }

  async function handleSaveSchedule() {
    if (!schemaFqn) { setStatus("Schema FQN required"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedule: { schemaFqn, frequency, dayOfWeek, hour, webhookUrl: webhookUrl || undefined, source },
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setSchedules((prev) => [...prev.filter((s) => s.schemaFqn !== schemaFqn), data.schedule]);
        setShowForm(false);
        setStatus("Schedule saved");
        setTimeout(() => setStatus(""), 3000);
      } else setStatus(`Error: ${data.error}`);
    } catch { setStatus("Failed to save schedule"); }
    finally { setLoading(false); }
  }

  async function handleRunNow(schedule: ScheduleConfig) {
    setLoading(true);
    setStatus(`Generating episode for ${schedule.schemaFqn}…`);
    try {
      const res = await fetch("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaFqn: schedule.schemaFqn,
          source: schedule.source,
          shareId: schedule.shareId,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus(`✓ Episode generated — ${data.tableCount} tables, ${data.testsFailed} failing tests`);
        setSchedules((prev) =>
          prev.map((s) =>
            s.id === schedule.id ? { ...s, lastRunAt: new Date().toISOString(), shareId: data.id } : s
          )
        );
      } else {
        setStatus(`Error: ${data.error}`);
      }
    } catch {
      setStatus("Failed to generate episode");
    } finally {
      setLoading(false);
      setTimeout(() => setStatus(""), 5000);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/schedules?id=${id}`, { method: "DELETE" });
    setSchedules((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleStripeIdentitySubmit() {
    setLoading(true);
    try {
      const res = await fetch("/api/pro/auth/stripe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: customerId || undefined, email: email || undefined }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to link Stripe/email identity");
      setSession(data.session);
      await loadSchedules();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to link Stripe identity");
    } finally {
      setLoading(false);
    }
  }

  const handleAddressChange = useCallback((address: string | null) => {
    setWalletAddress(address);
  }, []);

  const handleSessionChange = useCallback((next: unknown) => {
    const s = next as ProSession;
    setSession(s);
    setWalletAddress(s?.identity?.walletAddress ?? null);
    void loadSchedules();
  }, []);

  const feedUrl = feedToken ? `${typeof window !== "undefined" ? window.location.origin : ""}/api/feed?token=${feedToken}` : "";
  const identityStatus = session?.identity.walletAddress
    ? `Wallet (${session.identity.walletAddress.slice(0, 6)}…${session.identity.walletAddress.slice(-4)})`
    : session?.identity.email
      ? `Email (${session.identity.email})`
      : session?.identity.stripeCustomerId
        ? `Stripe (${session.identity.stripeCustomerId})`
        : "Not signed in";
  const hasProAccess = Boolean(session && (session.entitlements.stripe || session.entitlements.onchain));
  const proAccessStatus = !session
    ? "Not granted"
    : session.entitlements.onchain
      ? "Granted via Onchain"
      : session.entitlements.stripe
        ? "Granted via Stripe"
        : "Not granted";
  const showCreateFirstScheduleCta = hasProAccess && schedules.length === 0;

  return (
    <main className="min-h-screen flex flex-col items-center p-4 sm:p-8 gap-6 max-w-2xl mx-auto">
      <div className="w-full">
        <a href="/" className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">← Back</a>
      </div>

      <div className="w-full">
        <h1 className="text-2xl font-bold mb-1">DataBard Pro</h1>
        <p className="text-sm text-[var(--text-muted)]">Manage your scheduled episodes and private RSS feed.</p>
      </div>

      <div className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Sign in to DataBard Pro</h2>
        <p className="text-xs text-[var(--text-muted)]">Choose one method. Wallet and Email/Stripe are independent sign-in options, and either one can unlock Pro.</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <span className="text-xs rounded-full border border-[var(--border)] px-2 py-1">Identity: {identityStatus}</span>
          <span className="text-xs rounded-full border border-[var(--border)] px-2 py-1">Pro Access: {proAccessStatus}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
          <div className="text-xs bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2">
            <span className="font-medium">1) Sign in</span>
            <p className="text-[var(--text-muted)]">Use Wallet or Email/Stripe.</p>
          </div>
          <div className="text-xs bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2">
            <span className="font-medium">2) Verify access</span>
            <p className="text-[var(--text-muted)]">Onchain or Stripe entitlement unlocks Pro.</p>
          </div>
          <div className="text-xs bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2">
            <span className="font-medium">3) Create schedule</span>
            <p className="text-[var(--text-muted)]">Publish new episodes automatically.</p>
          </div>
        </div>
        <div className="pt-2">
          {sessionChecking ? (
            <p className="text-xs text-[var(--text-muted)]">Checking session…</p>
          ) : !session ? (
            <p className="text-xs text-[var(--text-muted)]">Next step: choose a sign-in method below.</p>
          ) : !hasProAccess ? (
            <p className="text-xs text-[var(--text-muted)]">Next step: unlock Pro using a valid onchain or Stripe entitlement.</p>
          ) : showCreateFirstScheduleCta ? (
            <button
              onClick={() => setShowForm(true)}
              className="text-xs bg-[var(--accent)] hover:brightness-110 text-white rounded-lg px-3 py-1.5 cursor-pointer"
            >
              Create first schedule
            </button>
          ) : (
            <p className="text-xs text-[var(--success)]">You’re ready — manage schedules below.</p>
          )}
        </div>
      </div>

      <ProWalletIsland initiaAddress={walletAddress} onAddressChange={handleAddressChange} onSessionChange={handleSessionChange} />

      <div className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Email / Stripe Sign-in</label>
          {(session?.identity.email || session?.identity.stripeCustomerId) ? (
            <span className="text-xs text-[var(--success)]">Signed in</span>
          ) : (
            <span className="text-xs text-[var(--text-muted)]">Not connected</span>
          )}
        </div>
        <p className="text-xs text-[var(--text-muted)]">Use your account email or Stripe customer ID to sign in and unlock billing entitlements.</p>
        <p className="text-xs text-[var(--text-muted)]">Data used: Email/Customer ID for account lookup + entitlement checks only.</p>
        <div className="flex gap-2">
          <input
            className="flex-1 bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            placeholder="Stripe customer ID (cus_...)"
          />
          <input
            className="flex-1 bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (you@company.com)"
          />
          <button
            onClick={handleStripeIdentitySubmit}
            disabled={loading || (!customerId && !email)}
            className="bg-[var(--accent)] hover:brightness-110 text-white rounded-lg px-4 py-2 text-sm font-medium cursor-pointer disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in with Email/Stripe"}
          </button>
        </div>
      </div>

      {session && (
        <div className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-xs text-[var(--text-muted)]">
          <p>Wallet: {session.identity.walletAddress ?? "—"}</p>
          <p>Stripe: {session.identity.stripeCustomerId ?? "—"}</p>
          <p>Email: {session.identity.email ?? "—"}</p>
          <p>Entitlements: Stripe {session.entitlements.stripe ? "✓" : "✗"} · Onchain {session.entitlements.onchain ? "✓" : "✗"}</p>
        </div>
      )}

      {/* Private RSS feed */}
      {feedToken && (
        <div className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Private RSS Feed</h2>
          <p className="text-xs text-[var(--text-muted)]">Add this URL to any podcast app to receive new episodes automatically.</p>
          <div className="flex gap-2">
            <input readOnly value={feedUrl} className="flex-1 bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs font-mono" />
            <button
              onClick={() => navigator.clipboard.writeText(feedUrl)}
              className="bg-[var(--bg)] hover:bg-[var(--border)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs cursor-pointer"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {/* Schedules */}
      {(schedules.length > 0 || feedToken) && (
        <div className="w-full flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Scheduled Episodes</h2>
            <button
              onClick={() => setShowForm(true)}
              className="text-xs bg-[var(--accent)] hover:brightness-110 text-white rounded-lg px-3 py-1.5 cursor-pointer"
            >
              + Add schedule
            </button>
          </div>

          {schedules.length === 0 && (
            <p className="text-sm text-[var(--text-muted)] text-center py-6">No schedules yet. Add one to start receiving weekly episodes.</p>
          )}

          {schedules.map((s) => (
            <div key={s.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">{s.schemaFqn}</span>
                <span className="text-xs text-[var(--text-muted)]">
                  {s.frequency === "weekly" ? `Every ${DAYS[s.dayOfWeek ?? 1]}` : "Daily"} at {s.hour}:00 UTC
                </span>
                <span className="text-xs text-[var(--text-muted)]">Source: {s.source}</span>
                {s.nextRunAt && (
                  <span className="text-xs text-[var(--text-muted)]">
                    Next: {new Date(s.nextRunAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
                {s.lastRunAt && (
                  <span className="text-xs text-[var(--text-muted)]">Last run: {new Date(s.lastRunAt).toLocaleDateString()}</span>
                )}
                {s.shareId && (
                  <a
                    href={`/episode/${s.shareId}`}
                    className="text-xs text-[var(--accent)] hover:underline"
                  >
                    Latest episode →
                  </a>
                )}
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <button
                  onClick={() => handleRunNow(s)}
                  disabled={loading}
                  className="text-xs text-[var(--accent)] hover:text-[var(--text)] cursor-pointer shrink-0 disabled:opacity-50"
                >
                  Run now
                </button>
                <button
                  onClick={() => handleDelete(s.id)}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--danger)] cursor-pointer shrink-0"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add schedule form */}
      {showForm && (
        <div className="w-full bg-[var(--surface)] border border-[var(--accent)] rounded-xl p-5 flex flex-col gap-4 animate-slide-up">
          <h3 className="text-sm font-semibold">New Schedule</h3>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--text-muted)]">Data Source</label>
            <select
              className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm cursor-pointer"
              value={source}
              onChange={(e) => setSource(e.target.value as "openmetadata" | "dbt-cloud" | "dbt-local" | "the-graph" | "dune")}
            >
              <option value="openmetadata">OpenMetadata</option>
              <option value="dbt-cloud">dbt Cloud</option>
              <option value="dbt-local">dbt Local</option>
              <option value="the-graph">The Graph</option>
              <option value="dune">Dune Analytics</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--text-muted)]">Schema FQN</label>
            <input
              className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
              value={schemaFqn}
              onChange={(e) => setSchemaFqn(e.target.value)}
              placeholder="database.schema_name"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs text-[var(--text-muted)]">Frequency</label>
              <select
                className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm cursor-pointer"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as "daily" | "weekly")}
              >
                <option value="weekly">Weekly</option>
                <option value="daily">Daily</option>
              </select>
            </div>
            {frequency === "weekly" && (
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-xs text-[var(--text-muted)]">Day</label>
                <select
                  className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm cursor-pointer"
                  value={dayOfWeek}
                  onChange={(e) => setDayOfWeek(Number(e.target.value))}
                >
                  {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </div>
            )}
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs text-[var(--text-muted)]">Hour (UTC)</label>
              <select
                className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm cursor-pointer"
                value={hour}
                onChange={(e) => setHour(Number(e.target.value))}
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--text-muted)]">Webhook URL (optional)</label>
            <input
              className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://hooks.slack.com/..."
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSaveSchedule}
              disabled={loading || !schemaFqn}
              className="flex-1 bg-[var(--accent)] hover:brightness-110 text-white rounded-lg px-4 py-2 text-sm font-medium cursor-pointer disabled:opacity-50"
            >
              {loading ? "Saving…" : "Save schedule"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="bg-[var(--bg)] hover:bg-[var(--border)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {status && <p className="text-sm text-[var(--text-muted)] text-center">{status}</p>}
    </main>
  );
}
