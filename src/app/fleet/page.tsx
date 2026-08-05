"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { FleetReport } from "@/lib/fleet-analysis";

export default function FleetPage() {
  const [report, setReport] = useState<FleetReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [wStatus, setWStatus] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/fleet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setReport(d.report);
        else setError(d.error || "Could not load the fleet.");
      })
      .catch(() => setError("Could not load the fleet."))
      .finally(() => setLoading(false));
  }, []);

  async function writeBack() {
    setWStatus("Writing…");
    try {
      const res = await fetch("/api/actions/writeback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fleet: true }),
      });
      const d = await res.json();
      if (d.ok) {
        setWStatus(`Wrote ${d.written.tagsApplied} tags · ${d.written.descriptionsUpdated} docs · ${d.written.ownersAssigned} owners across ${d.written.tablesTouched} tables → DataHub`);
      } else {
        setWStatus(d.error || "Write-back failed");
      }
    } catch {
      setWStatus("Write-back failed");
    }
  }

  return (
    <main className="enter-up min-h-screen bg-[var(--bg)] text-[var(--text)] px-4 py-8">
      <div className="max-w-[860px] mx-auto">
        <header className="mb-6">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">DataBard · Fleet town hall</p>
          <h1 className="text-2xl font-bold mt-1">One briefing for the whole estate</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Lineage-aware cascade impact across every dataset in DataHub — the view a data team never gets as one picture.
          </p>
        </header>

        {loading && <p className="text-[var(--text-muted)] font-mono text-sm">Analyzing the fleet…</p>}

        {error && (
          <div className="hover-depth bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 text-center">
            <p className="text-[var(--danger)] mb-3 text-sm">{error}</p>
            <Link
              href="/?start=connect"
              className="inline-block bg-[var(--accent)] text-[var(--bg)] px-4 py-2 rounded-lg text-sm font-medium"
            >
              Connect DataHub
            </Link>
          </div>
        )}

        {report && (
          <div className="flex flex-col gap-4">
            {/* Summary + fleet write-back */}
            <section className="hover-depth bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5">
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="text-3xl font-bold">{report.fleetScore}</span>
                <span className="text-sm text-[var(--text-muted)]">
                  /100 · {report.totalTables} tables{report.failingTests > 0 ? ` · ${report.failingTests} failing tests` : ""}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
                <span>{report.health.healthy} healthy</span>
                <span className="text-orange-400">{report.health.atRisk} at risk</span>
                <span className="text-red-400">{report.health.critical} critical</span>
                <span>{report.ownerless} ownerless</span>
                <span>{report.untested} untested</span>
                <span>{report.stale} stale</span>
              </div>
              <button
                type="button"
                onClick={writeBack}
                disabled={!!wStatus}
                className="mt-4 bg-[var(--accent)] text-[var(--bg)] px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60"
              >
                {wStatus || "Write back across the fleet →"}
              </button>
            </section>

            {/* The town hall narration */}
            <section className="hover-depth bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5">
              <h2 className="font-semibold mb-3">The town hall</h2>
              <div className="flex flex-col gap-3">
                {report.townHall.map((s, i) => (
                  <div key={i} className="border-l-2 border-[var(--accent)] pl-3">
                    <p className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                      {s.speaker} · {s.topic}
                    </p>
                    <p className="text-sm mt-1">{s.text}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Top blast-radius risks */}
            {report.topRisks.length > 0 && (
              <section className="hover-depth bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5">
                <h2 className="font-semibold mb-3">Top blast-radius risks</h2>
                <div className="flex flex-col gap-2">
                  {report.topRisks.slice(0, 6).map((t) => (
                    <div key={t.urn} className="flex items-center justify-between gap-3 text-sm bg-[var(--bg)] rounded-lg px-3 py-2">
                      <span className="font-medium truncate">{t.name}</span>
                      <span className="text-xs text-[var(--text-muted)] shrink-0">
                        {t.failingTests > 0 ? `${t.failingTests} failing · ` : ""}
                        {t.downstream} downstream{t.issues.length ? ` · ${t.issues.join(", ")}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Hotspots */}
            {report.hotspots.length > 0 && (
              <section className="hover-depth bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5">
                <h2 className="font-semibold mb-3">Hotspots</h2>
                <div className="flex flex-wrap gap-2">
                  {report.hotspots.map((h) => (
                    <span key={h.name} className="text-xs bg-[var(--bg)] rounded-full px-3 py-1 text-[var(--text-muted)]">
                      {h.name.split(".").pop() ?? h.name} · {h.downstream}
                    </span>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
