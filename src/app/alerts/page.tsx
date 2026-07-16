"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { InsightSummary } from "@/app/api/insights/route";
import type { AlertSubscription } from "@/lib/mint-stats";

const inputClass = "w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm focus:border-[var(--accent)] focus:outline-none transition-colors";

export default function AlertsPage() {
  const [insights, setInsights] = useState<InsightSummary[]>([]);
  const [alerts, setAlerts] = useState<AlertSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [schemaName, setSchemaName] = useState("");
  const [threshold, setThreshold] = useState(70);
  const [webhook, setWebhook] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/insights").then((r) => r.json()),
      fetch("/api/onchain/alerts").then((r) => r.json()),
    ]).then(([insightsData, alertsData]) => {
      if (insightsData.ok) setInsights(insightsData.insights ?? []);
      if (alertsData.ok) setAlerts(alertsData.alerts ?? []);
    }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!schemaName || !webhook) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/onchain/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schemaName, threshold, webhook, email: email || undefined }),
      });
      const data = await res.json();
      if (data.ok) {
        setSuccess(data.message);
        // Refresh alerts list
        const refresh = await fetch("/api/onchain/alerts").then((r) => r.json());
        if (refresh.ok) setAlerts(refresh.alerts ?? []);
        setWebhook("");
      } else {
        setError(data.error);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to register alert");
    } finally {
      setSubmitting(false);
    }
  }

  const availableSchemas = insights.map((i) => i.schemaName).filter(Boolean);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-8">
          <Link href="/" className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] mb-4 inline-block">← Back to DataBard</Link>
          <h1 className="text-2xl font-bold mb-2">🔔 Alerts</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Your analyst watches your data 24/7. Get alerted via Slack or webhook when it finds something — no dashboard checking required.
          </p>
        </div>

        {/* Create alert form */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 mb-8">
          <h2 className="text-sm font-semibold mb-4">Create an alert</h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {/* Schema picker */}
            <div>
              <label className="text-xs text-[var(--text-muted)] uppercase tracking-wide font-medium block mb-1.5">
                Schema to monitor
              </label>
              {availableSchemas.length > 0 ? (
                <select
                  value={schemaName}
                  onChange={(e) => setSchemaName(e.target.value)}
                  className={inputClass}
                  required
                >
                  <option value="">Select a schema…</option>
                  {availableSchemas.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              ) : (
                <input
                  className={inputClass}
                  value={schemaName}
                  onChange={(e) => setSchemaName(e.target.value)}
                  placeholder="e.g. analytics.ecommerce"
                  required
                />
              )}
              {availableSchemas.length === 0 && (
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  No schemas connected yet — <Link href="/" className="text-[var(--accent)] hover:underline">connect a source</Link> first, or enter a schema name manually.
                </p>
              )}
            </div>

            {/* Threshold */}
            <div>
              <label className="text-xs text-[var(--text-muted)] uppercase tracking-wide font-medium block mb-1.5">
                Health threshold: {threshold}%
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-full accent-[var(--accent)]"
              />
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Alert fires when health drops below {threshold}%
              </p>
            </div>

            {/* Webhook URL */}
            <div>
              <label className="text-xs text-[var(--text-muted)] uppercase tracking-wide font-medium block mb-1.5">
                Slack webhook or notification URL
              </label>
              <input
                className={inputClass}
                value={webhook}
                onChange={(e) => setWebhook(e.target.value)}
                placeholder="https://hooks.slack.com/services/…"
                required
              />
            </div>

            {/* Email (optional — for receipt, no wallet required) */}
            <div>
              <label className="text-xs text-[var(--text-muted)] uppercase tracking-wide font-medium block mb-1.5">
                Email <span className="text-[var(--text-muted)] normal-case">(optional — for receipt)</span>
              </label>
              <input
                className={inputClass}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
              <p className="text-xs text-[var(--text-muted)] mt-1">
                No wallet needed. Onchain attestation is optional — connect a wallet from the main app if you want alerts attested on-chain.
              </p>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting || !schemaName || !webhook}
              className="w-full bg-[var(--accent)] hover:brightness-110 text-[var(--bg)] rounded-lg px-4 py-2.5 text-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition ease-out"
            >
              {submitting && <span className="inline-block w-3.5 h-3.5 border-2 border-[var(--bg)]/30 border-t-[var(--bg)] rounded-full animate-spin" />}
              {submitting ? "Registering…" : "Register alert →"}
            </button>

            {success && (
              <p className="text-xs text-[var(--success)] bg-[var(--success)]/5 rounded-lg px-3 py-2">{success}</p>
            )}
            {error && (
              <p className="text-xs text-[var(--danger)] bg-[var(--danger)]/5 rounded-lg px-3 py-2">{error}</p>
            )}
          </form>
        </div>

        {/* Existing alerts */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6">
          <h2 className="text-sm font-semibold mb-4">
            Active alerts {alerts.length > 0 && <span className="text-[var(--text-muted)] font-normal">({alerts.length})</span>}
          </h2>
          {loading ? (
            <p className="text-xs text-[var(--text-muted)] text-center py-4">Loading…</p>
          ) : alerts.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] text-center py-4">
              No alerts registered yet. Create one above to start monitoring.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {alerts.map((alert, i) => {
                const insight = insights.find((ins) => ins.schemaName === alert.schemaName);
                const currentHealth = insight?.healthScore;
                const isFiring = currentHealth != null && currentHealth < alert.threshold;
                return (
                  <div
                    key={`${alert.schemaName}-${alert.walletAddress ?? alert.email ?? i}`}
                    className={`rounded-lg p-3 border flex items-center gap-3 ${
                      isFiring
                        ? "border-[var(--danger)]/30 bg-[var(--danger)]/5"
                        : "border-[var(--border)] bg-[var(--bg)]"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium truncate">{alert.schemaName}</span>
                        {isFiring && <span className="text-xs px-1.5 py-0.5 rounded-full bg-[var(--danger)]/20 text-[var(--danger)] font-medium">🔴 Firing</span>}
                      </div>
                      <div className="text-xs text-[var(--text-muted)]">
                        Threshold: {alert.threshold}% · {alert.email ? `📧 ${alert.email}` : alert.walletAddress ? `⛓️ ${alert.walletAddress.slice(0, 8)}…` : "Anonymous"}
                      </div>
                    </div>
                    {currentHealth != null && (
                      <span className={`text-sm font-bold tabular-nums ${
                        currentHealth >= 80 ? "text-[var(--success)]"
                        : currentHealth >= 50 ? "text-yellow-400"
                        : "text-[var(--danger)]"
                      }`}>
                        {currentHealth}%
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Info card */}
        <div className="mt-6 bg-[var(--accent)]/5 border border-[var(--accent)]/10 rounded-xl p-4">
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            <strong className="text-[var(--text)]">How it works:</strong> Your analyst checks your alert thresholds against the latest health snapshots continuously. When a score drops below your threshold, it reaches out via your webhook with the schema name, current health score, and a link to the episode. No wallet required — onchain attestation is an optional upgrade for teams that want a permanent audit trail.
          </p>
        </div>

        {/* Cross-link to schedules */}
        <div className="mt-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">📅 Scheduled digest podcasts</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Automate weekly audio briefings for your team.</p>
          </div>
          <Link href="/pro" className="text-xs bg-[var(--accent)] hover:brightness-110 text-[var(--bg)] rounded-lg px-3 py-1.5 font-medium shrink-0">
            Set up in Pro →
          </Link>
        </div>
      </div>
    </div>
  );
}
