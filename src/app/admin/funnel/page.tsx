import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EVENT_TYPES, listEvents, type UsageEvent } from "@/lib/events";
import { getPageviewStats } from "@/lib/pageviews";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Funnel — DataBard admin",
  robots: { index: false, follow: false },
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Loop 1 (GTM.md): the edition share loop — humans. */
const EDITION_FUNNEL = [
  { type: "earn_index_view", label: "Visited /earn index" },
  { type: "edition_preview", label: "Opened a preview" },
  { type: "edition_paywall_click", label: "Clicked publish (paywall)" },
  { type: "edition_intent", label: "Started payment intent" },
  { type: "edition_published", label: "Published edition" },
] as const;

/** Loop 2 (GTM.md): the agent discovery loop — machines. */
const AGENT_FUNNEL = [
  { type: "agents_page_view", label: "Visited /agents" },
  { type: "agent_demo_run", label: "Ran free health check" },
  { type: "probe_run", label: "Ran a probe" },
  { type: "service_score_lookup", label: "service_score tool call" },
  { type: "briefing_paid", label: "Paid briefing served (x402)" },
] as const;

function countByType(events: UsageEvent[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const e of events) m[e.type] = (m[e.type] ?? 0) + 1;
  return m;
}

function pct(part: number, whole: number): string {
  if (whole <= 0) return "—";
  return `${Math.round((part / whole) * 100)}%`;
}

export default async function FunnelAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key } = await searchParams;
  const secret = process.env.ADMIN_SECRET;
  // Fail closed and indistinguishable from a missing page when unconfigured.
  if (!secret || key !== secret) notFound();

  const [events, pageviews] = await Promise.all([listEvents(), getPageviewStats()]);
  const cutoff = Date.now() - 7 * DAY_MS;
  const all = countByType(events);
  const week = countByType(events.filter((e) => Date.parse(e.createdAt) >= cutoff));

  const recoveries = events.filter((e) => e.type === "edition_payment_recovery");
  const recoveryReasons: Record<string, number> = {};
  for (const e of recoveries) {
    const reason = e.meta?.reason ?? "(no reason recorded)";
    recoveryReasons[reason] = (recoveryReasons[reason] ?? 0) + 1;
  }

  const topPaths = Object.entries(pageviews.byPath).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const topSources = Object.entries(pageviews.bySource).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const eventRows = EVENT_TYPES.map((t) => ({ type: t, all: all[t] ?? 0, week: week[t] ?? 0 }))
    .sort((a, b) => b.all - a.all || a.type.localeCompare(b.type));

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] px-4 py-10" id="main-content">
      <div className="max-w-[720px] mx-auto">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-[var(--border)] pb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
          <span>Internal — not public</span>
          <span>generated {new Date().toUTCString()}</span>
        </div>
        <h1 className="text-[28px] sm:text-[34px] font-extrabold tracking-tight mt-6">Funnel</h1>
        <p className="text-sm text-[var(--text-muted)] mt-2">
          The two loops from <span className="font-mono text-xs">docs/GTM.md</span>, measured from the
          rolling event ledger ({events.length.toLocaleString()} events in window, 10k cap).{" "}
          Counts are all-time-in-window and trailing 7 days. Raw aggregates:{" "}
          <a href="/api/events" className="text-[var(--accent)] hover:underline">/api/events</a>.
        </p>

        {/* Traffic denominator */}
        <div className="mt-6 grid grid-cols-3 gap-3">
          {[
            [pageviews.total, "pageviews (all)"],
            [pageviews.last7d, "pageviews (7d)"],
            [events.length, "funnel events"],
          ].map(([n, label]) => (
            <div key={label as string} className="border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
              <div className="font-display text-3xl font-bold tabular-nums">{(n as number).toLocaleString()}</div>
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)] mt-1">
                {label as string}
              </div>
            </div>
          ))}
        </div>

        <FunnelTable
          title="Loop 1 — edition share (humans)"
          note="Preview → publish is the $25 decision; recovery events mark payment friction."
          steps={EDITION_FUNNEL}
          all={all}
          week={week}
        />

        {/* Payment friction — the ratio Workstream B exists to shrink. */}
        <div className="mt-3 border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className={`font-display text-xl font-bold tabular-nums ${recoveries.length > 0 ? "text-[var(--warning)]" : ""}`}>
              {recoveries.length}
            </span>
            <span className="text-sm">payment recoveries</span>
            <span className="text-xs text-[var(--text-muted)]">
              {pct(recoveries.length, all["edition_published"] ?? 0)} of published editions needed recovery
              {week["edition_payment_recovery"] ? ` · ${week["edition_payment_recovery"]} in last 7d` : ""}
            </span>
          </div>
          {Object.keys(recoveryReasons).length > 0 && (
            <ul className="mt-3 flex flex-col gap-1">
              {Object.entries(recoveryReasons).sort((a, b) => b[1] - a[1]).map(([reason, n]) => (
                <li key={reason} className="flex items-baseline gap-2 text-xs text-[var(--text-muted)]">
                  <span className="font-mono tabular-nums text-[var(--text)]">{n}×</span> {reason}
                </li>
              ))}
            </ul>
          )}
        </div>

        <FunnelTable
          title="Loop 2 — agent discovery (machines)"
          note="Free tools drive discovery; paid calls settle over x402 on X Layer."
          steps={AGENT_FUNNEL}
          all={all}
          week={week}
        />

        {/* Acquisition context */}
        <section className="mt-10 grid sm:grid-cols-2 gap-6" aria-label="Traffic sources">
          <div>
            <h2 className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">Top paths</h2>
            <ol className="mt-3 flex flex-col gap-1.5">
              {topPaths.map(([p, n]) => (
                <li key={p} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="font-mono truncate">{p}</span>
                  <span className="tabular-nums text-[var(--text-muted)]">{n}</span>
                </li>
              ))}
              {topPaths.length === 0 && <li className="text-xs text-[var(--text-muted)]">No pageviews recorded yet.</li>}
            </ol>
          </div>
          <div>
            <h2 className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">Sources</h2>
            <ol className="mt-3 flex flex-col gap-1.5">
              {topSources.map(([s, n]) => (
                <li key={s} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="font-mono truncate">{s}</span>
                  <span className="tabular-nums text-[var(--text-muted)]">{n}</span>
                </li>
              ))}
              {topSources.length === 0 && <li className="text-xs text-[var(--text-muted)]">No sources recorded yet.</li>}
            </ol>
          </div>
        </section>

        {/* Every whitelisted type — new events surface here automatically. */}
        <section className="mt-10" aria-labelledby="all-events">
          <h2 id="all-events" className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
            All tracked events
          </h2>
          <table className="mt-3 w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] text-left font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                <th className="py-2 pr-3 font-normal">event</th>
                <th className="py-2 pr-3 font-normal text-right">7d</th>
                <th className="py-2 font-normal text-right">all</th>
              </tr>
            </thead>
            <tbody>
              {eventRows.map((r) => (
                <tr key={r.type} className={`border-b border-[var(--border)]/50 ${r.all === 0 ? "text-[var(--text-muted)]/60" : ""}`}>
                  <td className="py-1.5 pr-3 font-mono">{r.type}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{r.week}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.all}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}

function FunnelTable({
  title,
  note,
  steps,
  all,
  week,
}: {
  title: string;
  note: string;
  steps: readonly { type: string; label: string }[];
  all: Record<string, number>;
  week: Record<string, number>;
}) {
  return (
    <section className="mt-10" aria-label={title}>
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 text-[11px] text-[var(--text-muted)]">{note}</p>
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
            <th className="py-2 pr-3 font-normal">step</th>
            <th className="py-2 pr-3 font-normal text-right">7d</th>
            <th className="py-2 font-normal text-right">all</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((s, i) => {
            const prev = i > 0 ? steps[i - 1] : null;
            const w = week[s.type] ?? 0;
            const a = all[s.type] ?? 0;
            return (
              <tr key={s.type} className="border-b border-[var(--border)]/50">
                <td className="py-2.5 pr-3">
                  <span className="block">{s.label}</span>
                  <span className="block font-mono text-[10px] text-[var(--text-muted)]">{s.type}</span>
                </td>
                <td className="py-2.5 pr-3 text-right align-top">
                  <span className="font-display font-bold tabular-nums">{w}</span>
                  {prev && (
                    <span className="block text-[10px] text-[var(--text-muted)] tabular-nums">
                      {pct(w, week[prev.type] ?? 0)} of prev
                    </span>
                  )}
                </td>
                <td className="py-2.5 text-right align-top">
                  <span className="font-display font-bold tabular-nums">{a}</span>
                  {prev && (
                    <span className="block text-[10px] text-[var(--text-muted)] tabular-nums">
                      {pct(a, all[prev.type] ?? 0)} of prev
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
