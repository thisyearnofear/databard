import type { Metadata } from "next";
import Link from "next/link";
import { loadVerdicts, type PublishedVerdict } from "@/lib/probe-verdicts";
import { ResultCard } from "@/components/probe/ResultCard";

export const dynamic = "force-dynamic";

const PUBLIC_BASE = (process.env.NEXT_PUBLIC_URL || "https://databard.persidian.com").replace(/\/$/, "");

export async function generateMetadata(): Promise<Metadata> {
  const verdicts = await loadVerdicts();
  const latest = verdicts[0];
  const description = latest
    ? `${verdicts.length} published verdict${verdicts.length === 1 ? "" : "s"} — latest ${new Date(latest.generatedAt).toUTCString()}: ${latest.summary}`
    : "Weekly Probe verdicts: the same agent services measured head-to-head, published as public artifacts.";
  return {
    title: "Probe Verdicts — DataBard",
    description,
    openGraph: { title: "Probe Verdicts", description, url: `${PUBLIC_BASE}/probe/verdicts` },
    twitter: { card: "summary", title: "Probe Verdicts — DataBard", description },
  };
}

export default async function VerdictsPage() {
  const verdicts = await loadVerdicts();

  return (
    <main className="report-surface enter-up min-h-screen bg-[var(--bg)] text-[var(--text)] px-4 py-10" id="main-content">
      <div className="max-w-[720px] mx-auto">
        <Link href="/probe" className="inline-flex items-center py-1.5 font-mono text-xs text-[var(--text-muted)] no-underline hover:text-[var(--text)]">
          ← DataBard Probe
        </Link>

        <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-[var(--border)] pb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
          <span>Public accounting — published verdicts</span>
          <span>Generated weekly · never crafted</span>
        </div>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--accent)] mt-4">
          Probe · service verdicts
        </p>
        <h1 className="text-[28px] sm:text-[34px] font-extrabold tracking-tight mt-2">
          Which service was worth paying?
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-2">
          {verdicts.length > 0
            ? `${verdicts.length} published verdict${verdicts.length === 1 ? "" : "s"} — the same curated service set measured head-to-head on a weekly schedule. Each card links to the service's index entry.`
            : "No verdicts published yet. A weekly cron runs the same Probe preview over the curated service set and publishes only when the run completes cleanly."}
        </p>

        {verdicts.map((v) => (
          <VerdictArticle key={v.id} verdict={v} />
        ))}
      </div>
    </main>
  );
}

function VerdictArticle({ verdict }: { verdict: PublishedVerdict }) {
  return (
    <article id={verdict.id} className="mt-10 scroll-mt-24 border-b border-[var(--border)] pb-10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">
          {new Date(verdict.generatedAt).toUTCString()}
        </h2>
        <Link href={`/probe/verdicts#${verdict.id}`} className="font-mono text-[10px] text-[var(--text-muted)] no-underline hover:text-[var(--accent)]">
          permalink
        </Link>
      </div>
      {verdict.question && (
        <p className="mt-2 text-sm font-medium text-[var(--text)]">“{verdict.question}”</p>
      )}
      <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{verdict.summary}</p>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
        {verdict.candidates} candidates · spend ${verdict.cost.outboundSpentUsd.toFixed(2)} · {verdict.cost.cachedCount} from cache
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {verdict.ranked.map((r) => (
          <VerdictCard key={r.endpoint} result={r} />
        ))}
      </div>
      {verdict.reference.length > 0 && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {verdict.reference.map((r) => (
            <VerdictCard key={r.endpoint} result={r} />
          ))}
        </div>
      )}
    </article>
  );
}

function VerdictCard({ result }: { result: PublishedVerdict["ranked"][number] }) {
  const card = (
    <ResultCard
      name={result.name}
      endpoint={result.endpoint}
      score={result.score}
      label={result.label}
      breakdown={result.breakdown}
      flags={result.flags}
      reachable={result.reachable}
      payment={result.payment}
      fromCache={result.fromCache}
      reference={result.reference}
    />
  );
  // Receipt link: the service's live index entry is the closest thing to a
  // receipt an unpaid probe can point at.
  if (result.agentId) {
    return (
      <Link href={`/probe/marketplace/${result.agentId}`} className="no-underline" title="Open this service's index entry">
        {card}
      </Link>
    );
  }
  return card;
}
