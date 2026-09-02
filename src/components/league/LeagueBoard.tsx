"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { track } from "@/lib/track";
import { MondaySignup } from "@/components/MondaySignup";
import { LeadCapture } from "@/components/LeadCapture";
import { HealthBar } from "@/components/viz";
import { scoreTextClass } from "@/lib/product/score-tone";
import { LeaderboardIndex } from "./LeaderboardIndex";
import type { LeagueEdition } from "@/lib/league";
import { homeHref, workspaceHref } from "@/lib/product/workspaces";

function Change({ value }: { value: number }) {
  if (value === 0) return <span className="font-mono text-xs text-[var(--text-muted)]">—</span>;
  const up = value > 0;
  return (
    <span className={`font-mono text-xs font-bold ${up ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
      {up ? "↑" : "↓"}{Math.abs(value)}
    </span>
  );
}

function CopyButton({
  label,
  text,
  channel,
}: {
  label: string;
  text: string;
  channel: "tweet" | "email" | "link";
}) {
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      track("league_share_copy", { channel });
      window.setTimeout(() => setDone(false), 1600);
    } catch {
      /* clipboard may be blocked */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
    >
      {done ? "Copied" : label}
    </button>
  );
}

export function LeagueBoard() {
  const [edition, setEdition] = useState<LeagueEdition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fromDemo, setFromDemo] = useState(false);
  const [tab, setTab] = useState<"week" | "index">("week");

  useEffect(() => {
    setFromDemo(new URLSearchParams(window.location.search).get("from") === "demo");
    track("league_page_view", {});
    fetch("/api/league")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setEdition(d.edition);
        else setError(d.error || "Could not load this week's accounting");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load this week's accounting"));
  }, []);

  return (
    <main className="enter-up min-h-screen bg-[var(--bg)] text-[var(--text)] px-4 py-10">
      <div className="max-w-[720px] mx-auto">
        <Link
          href={homeHref("protocols")}
          className="inline-flex items-center py-1.5 font-mono text-xs text-[var(--text-muted)] no-underline hover:text-[var(--text)]"
        >
          ← DataBard
        </Link>

        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--accent)] mt-6">
          {edition?.stale ? "Latest edition · public sources" : "Weekly accounting · public sources"}
        </p>
        <h1 className="text-[28px] sm:text-[34px] font-extrabold tracking-tight mt-2">
          State of protocol data health
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-2">
          {edition
            ? `${edition.weekLabel}${
                edition.stale
                  ? ` · data as of ${new Date(edition.asOf).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      timeZone: "UTC",
                    })}`
                  : ""
              }`
            : "This week’s scan of public Solana sources."}
        </p>

        <div className="mt-6 flex w-fit items-center gap-1 border border-[var(--border)] bg-[var(--surface)] p-1">
          {([["week", edition?.stale ? "Latest edition" : "This week"], ["index", "Full index"]] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-pressed={tab === key}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                tab === key ? "bg-[var(--accent)] text-[var(--bg)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "index" ? (
          <div className="mt-8">
            <LeaderboardIndex />
          </div>
        ) : (
          <>
        {fromDemo && edition && (
          <section
            className="mt-6 border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-5 py-4"
            aria-label="This week's table"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--accent)]">
              This week&apos;s table
            </p>
            <p className="mt-2 text-sm leading-relaxed">
              {edition.headline.schemaName} is {edition.headline.score}
              {edition.headline.change < 0 ? ` — down ${Math.abs(edition.headline.change)}.` : "."}
              {" "}Claim your row, or hear the briefing.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/episode/demo"
                className="bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--bg)] hover:brightness-110"
              >
                Listen to the briefing
              </Link>
              <Link
                href={workspaceHref("/?start=connect", "protocols")}
                className="border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-[var(--accent)]"
              >
                That&apos;s my protocol — claim a row
              </Link>
            </div>
          </section>
        )}

        {edition && (
          <div className="flex flex-wrap gap-2 mt-5">
            <CopyButton label="Copy tweet" text={edition.tweet} channel="tweet" />
            <CopyButton label="Copy email" text={edition.emailBlurb} channel="email" />
            <CopyButton label="Copy link" text={edition.permalink} channel="link" />
          </div>
        )}

        {error && (
          <p className="mt-8 text-sm text-[var(--danger)]">{error}</p>
        )}

        {!edition && !error && (
          <p className="mt-10 font-mono text-sm text-[var(--text-muted)]">Loading this week’s scan…</p>
        )}

        {edition && (
          <>
            <section
              className="mt-8 border border-[var(--danger)]/35 bg-[var(--surface)] px-5 py-5"
              aria-labelledby="headline-title"
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--danger)]">
                {edition.stale ? "Latest finding" : "This week’s finding"}
              </p>
              <div className="flex items-start justify-between gap-4 mt-3">
                <div className="min-w-0">
                  <h2 id="headline-title" className="text-xl font-bold">
                    {edition.headline.schemaName}
                  </h2>
                  <p className="text-sm text-[var(--text-muted)] mt-2 leading-relaxed">
                    {edition.headline.line}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`font-display text-4xl font-bold tabular-nums ${scoreTextClass(edition.headline.score)}`}>
                    {edition.headline.score}
                  </div>
                  <Change value={edition.headline.change} />
                </div>
              </div>
              <div className="mt-4">
                <MondaySignup schema={edition.headline.schemaName} source="monday:league" />
              </div>
            </section>

            <section className="mt-8" aria-labelledby="table-title">
              <div className="flex items-baseline justify-between gap-3 mb-3">
                <h2 id="table-title" className="text-sm font-semibold flex items-center gap-2">
                  Ranked sources
                  {edition.sample && (
                    <span className="rounded border border-[var(--border)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                      sample roster
                    </span>
                  )}
                </h2>
                <p className="font-mono text-xs text-[var(--text-muted)]">avg {edition.average}</p>
              </div>
              <ol className="flex flex-col gap-2">
                {edition.rows.map((row) => (
                  <li
                    key={row.schemaFqn}
                    className="flex items-center gap-3 border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
                  >
                    <span className="font-mono text-xs text-[var(--text-muted)] w-6 shrink-0">
                      {row.rank}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{row.schemaName}</p>
                      <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">{row.finding}</p>
                    </div>
                    <HealthBar score={row.score} width={72} />
                    <span className="w-8 text-right">
                      <Change value={row.change} />
                    </span>
                  </li>
                ))}
              </ol>
            </section>

            <section className="mt-10 border border-[var(--border)] bg-[var(--surface)] px-5 py-5">
              <h2 className="text-sm font-semibold">Want this on a source you run?</h2>
              <p className="text-xs text-[var(--text-muted)] mt-2 leading-relaxed">
                Leave an email or a Dune / subgraph URL. We&apos;ll rerun the scan and send the 2-minute briefing.
                If it doesn&apos;t surface something you didn&apos;t know, say so.
              </p>
              <div className="mt-4">
                <LeadCapture
                  source="league_edition"
                  prompt=""
                  buttonText="Request a scan →"
                />
              </div>
              <p className="mt-4 text-xs">
                <Link href={workspaceHref("/?start=connect", "protocols")} className="text-[var(--accent)] hover:underline">
                  Or connect it yourself →
                </Link>
              </p>
            </section>

            <p className="mt-8 text-[11px] leading-relaxed text-[var(--text-muted)]">
              {edition.sample
                ? "This edition uses DataBard’s public-protocol roster while a live scan is warming up. Numbers match the engine’s last seeded snapshots of those sources."
                : "Scores are computed by DataBard’s engine from catalog and subgraph metadata it can see — freshness, tests, coverage, lineage. This is not an official protocol audit. If a number is wrong, that is the conversation."}
            </p>
          </>
        )}
          </>
        )}
      </div>
    </main>
  );
}
