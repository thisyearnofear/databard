"use client";

import { useState, useEffect, useCallback } from "react";
import type { ScheduleConfig } from "@/lib/store";
import { WalletConnect } from "@/components/WalletConnect";
import { InitiaProvider } from "@/components/InitiaProvider";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function ProSettings() {
  const [customerId, setCustomerId] = useState("");
  const [initiaAddress, setInitiaAddress] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<ScheduleConfig[]>([]);
  const [feedToken, setFeedToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [schemaFqn, setSchemaFqn] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly">("weekly");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [hour, setHour] = useState(9);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [source, setSource] = useState<"openmetadata" | "dbt-cloud" | "dbt-local" | "the-graph" | "dune">("openmetadata");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if (sessionId) {
      fetch(`/api/checkout/session?session_id=${sessionId}`)
        .then(res => res.json())
        .then(data => {
          if (data.ok && data.customerId) {
            setCustomerId(data.customerId);
            localStorage.setItem("databard:customerId", data.customerId);
            loadSchedules(data.customerId);
            setStatus("🎉 Welcome to DataBard Pro!");
            setTimeout(() => setStatus(""), 5000);
          }
        })
        .catch(() => {});
      window.history.replaceState({}, "", "/pro");
      return;
    }

    const saved = localStorage.getItem("databard:customerId");
    if (saved) { setCustomerId(saved); loadSchedules(saved); }
    const savedInitia = localStorage.getItem("databard:initiaAddress");
    if (savedInitia) setInitiaAddress(savedInitia);
  }, []);

  async function loadSchedules(cid: string) {
    if (!cid) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/schedules?customerId=${cid}`);
      const data = await res.json();
      if (data.ok) { setSchedules(data.schedules); setFeedToken(data.feedToken); }
      else setStatus(`Error: ${data.error}`);
    } catch { setStatus("Failed to load schedules"); }
    finally { setLoading(false); }
  }

  async function handleSaveSchedule() {
    if (!customerId || !schemaFqn) { setStatus("Customer ID and schema FQN required"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
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
    if (!customerId) return;
    await fetch(`/api/schedules?customerId=${customerId}&id=${id}`, { method: "DELETE" });
    setSchedules((prev) => prev.filter((s) => s.id !== id));
  }

  function handleCustomerIdSubmit() {
    localStorage.setItem("databard:customerId", customerId);
    loadSchedules(customerId);
  }

  const handleAddressChange = useCallback((address: string | null) => {
    setInitiaAddress(address);
    if (address) {
      localStorage.setItem("databard:initiaAddress", address);
      // Use initia address as customer identifier if no Stripe ID
      if (!customerId) {
        setCustomerId(address);
        loadSchedules(address);
      }
    } else {
      localStorage.removeItem("databard:initiaAddress");
    }
  }, [customerId]);

  const feedUrl = feedToken ? `${typeof window !== "undefined" ? window.location.origin : ""}/api/feed?token=${feedToken}` : "";

  return (
    <InitiaProvider>
    <main className="min-h-screen flex flex-col items-center p-4 sm:p-8 gap-6 max-w-2xl mx-auto">
      <div className="w-full">
        <a href="/" className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">← Back</a>
      </div>

      <div className="w-full">
        <h1 className="text-2xl font-bold mb-1">DataBard Pro</h1>
        <p className="text-sm text-[var(--text-muted)]">Manage your scheduled episodes and private RSS feed.</p>
      </div>

      {/* Initia wallet connection */}
      <div className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Initia Wallet</h2>
          {initiaAddress && <span className="text-xs text-[var(--success)]">Connected</span>}
        </div>
        <p className="text-xs text-[var(--text-muted)]">Connect your .init wallet to authenticate with DataBard Pro on the Initia network.</p>
        <WalletConnect onAddressChange={handleAddressChange} />
        {initiaAddress && (
          <p className="text-xs text-[var(--text-muted)]">
            Episodes generated while connected will be recorded on-chain with your .init identity.
          </p>
        )}
      </div>

      {/* Customer ID lookup */}
      {!schedules.length && (
        <div className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 flex flex-col gap-3">
          <label className="text-sm font-medium">Stripe Customer ID</label>
          <p className="text-xs text-[var(--text-muted)]">Find this in your Stripe dashboard or the confirmation email.</p>
          <div className="flex gap-2">
            <input
              className="flex-1 bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              placeholder="cus_..."
            />
            <button
              onClick={handleCustomerIdSubmit}
              disabled={!customerId || loading}
              className="bg-[var(--accent)] hover:brightness-110 text-white rounded-lg px-4 py-2 text-sm font-medium cursor-pointer disabled:opacity-50"
            >
              {loading ? "Loading…" : "Load"}
            </button>
          </div>
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
    </InitiaProvider>
  );
}
