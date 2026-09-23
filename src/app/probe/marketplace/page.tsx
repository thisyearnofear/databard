import type { Metadata } from "next";
import Link from "next/link";
import { getLatestIndex, type IndexedService } from "@/lib/marketplace-index";
import { scoreTextClass, scoreTintClass } from "@/lib/product/score-tone";
import { PixelIcon } from "@/components/dither-kit";
import { recordEvent } from "@/lib/events";

export const dynamic = "force-dynamic";

const PUBLIC_BASE = (process.env.NEXT_PUBLIC_URL || "https://databard.persidian.com").replace(/\/$/, "");

export async function generateMetadata(): Promise<Metadata> {
  const index = await getLatestIndex();
  const description = index
    ? `${index.aggregates.checked} A2MCP services checked, ${index.aggregates.healthy} healthy, ${index.aggregates.broken + index.aggregates.unreachable} failing — every OKX.AI marketplace listing verified with one unpaid request.`
    : "A public health index of every A2MCP service listed on the OKX.AI marketplace.";
  return {
    title: "OKX.AI Marketplace Health — DataBard Probe",
    description,
    openGraph: {
      title: "OKX.AI Marketplace Health",
      description,
      url: `${PUBLIC_BASE}/probe/marketplace`,
    },
    twitter: { card: "summary", title: "OKX.AI Marketplace Health — DataBard Probe", description },
  };
}

const STATUS_FILTERS = ["all", "healthy", "degraded", "broken", "unreachable"] as const;

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filter = STATUS_FILTERS.includes(status as never) ? (status as string) : "all";
  const index = await getLatestIndex();
  void recordEvent("marketplace_index_view", { filter });

  const visible = (index?.services ?? []).filter(
    (s) => filter === "all" || s.status === filter,
  );

  return (
    <main className="report-surface enter-up min-h-screen bg-[var(--bg)] text-[var(--text)] px-4 py-10" id="main-content">
      <div className="max-w-[720px] mx-auto">
        <Link href="/probe" className="inline-flex items-center py-1.5 font-mono text-xs text-[var(--text-muted)] no-underline hover:text-[var(--text)]">
          ← DataBard Probe
        </Link>

        <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-[var(--border)] pb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
          <span>Public accounting — agent services</span>
          <span>Free to read · methodology below</span>
        </div>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--accent)] mt-4">
          OKX.AI marketplace · A2MCP services
        </p>
        <h1 className="text-[28px] sm:text-[34px] font-extrabold tracking-tight mt-2">
          Which agent services actually answer?
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-2">
          {index
            ? `${index.aggregates.checked} listings checked as of ${new Date(index.generatedAt).toUTCString()} — marketplace snapshot crawled ${new Date(index.crawledAt).toUTCString()}`
            : "The first health pass has not run yet."}
        </p>

        {!index && (
          <div className="mt-8 border border-[var(--border)] bg-[var(--surface)] px-5 py-6 text-sm text-[var(--text-muted)]">
            No index run yet. A scheduled job checks every A2MCP listing on OKX.AI with one
            unpaid request and publishes the results here — check back shortly.
          </div>
        )}

        {index && (
          <>
            {/* Headline stats — DataBard's own listings are excluded */}
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                [index.aggregates.healthy, "healthy", "var(--success)"],
                [index.aggregates.degraded, "degraded", "var(--warning)"],
                [index.aggregates.broken, "broken", "var(--danger)"],
                [index.aggregates.unreachable, "unreachable", "var(--text-muted)"],
              ].map(([n, label, color]) => (
                <div key={label as string} className="border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
                  <div className="font-display text-3xl font-bold tabular-nums" style={{ color: color as string }}>
                    {n as number}
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)] mt-1">
                    {label as string}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-[var(--text-muted)] leading-relaxed">
              Median latency {index.aggregates.medianLatency ?? "—"}ms ·{" "}
              {index.aggregates.priceMismatchCount} price mismatch{index.aggregates.priceMismatchCount === 1 ? "" : "es"} ·{" "}
              {index.aggregates.freeDemandsPaymentCount} free listing{index.aggregates.freeDemandsPaymentCount === 1 ? "" : "s"} demanding payment
              {index.aggregates.deepChecked > 0 &&
                ` · ${index.aggregates.deepChecked} verified with a real payment ($${index.aggregates.deepSpentUsd})`}
              {index.attestation?.txHash && (
                <>
                  {" · "}
                  <a
                    href={`https://www.oklink.com/xlayer/tx/${index.attestation.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--accent)] hover:underline"
                  >
                    verdict anchored on X Layer ↗
                  </a>
                </>
              )}
            </p>

            {/* Filter */}
            <nav className="mt-8 flex flex-wrap gap-2" aria-label="Filter by status">
              {STATUS_FILTERS.map((s) => (
                <Link
                  key={s}
                  href={s === "all" ? "/probe/marketplace" : `/probe/marketplace?status=${s}`}
                  className={`rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] no-underline ${
                    filter === s
                      ? "border-[var(--accent)] text-[var(--accent)]"
                      : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {s}
                </Link>
              ))}
            </nav>

            {/* Table */}
            <ol className="mt-4 flex flex-col gap-2">
              {visible.map((s) => (
                <ServiceRow key={s.serviceId} svc={s} />
              ))}
              {visible.length === 0 && (
                <li className="border border-[var(--border)] bg-[var(--surface)] px-4 py-5 text-sm text-[var(--text-muted)]">
                  No services with status “{filter}” in this run.
                </li>
              )}
            </ol>
          </>
        )}

        {/* Methodology — honesty is the product */}
        <section className="mt-12 border-t-2 border-[var(--border)] pt-6" aria-labelledby="methodology">
          <h2 id="methodology" className="text-sm font-semibold flex items-center gap-2">
            <PixelIcon name="search" size={14} className="text-[var(--accent)]" />
            Methodology — what each check means
          </h2>
          <ul className="mt-4 flex flex-col gap-3 text-xs leading-relaxed text-[var(--text-muted)]">
            <li>
              <span className="text-[var(--text)] font-medium">One unpaid request per listing.</span>{" "}
              We POST an empty JSON body to each endpoint (retrying GET when the listing is
              GET-only). This verifies the listing answers and that its payment gate matches
              the advertised price — it does NOT measure the quality of the paid output.
              Only rows marked “Paid &amp; delivered” were verified end-to-end with a real payment.
            </li>
            <li>
              <span className="text-[var(--text)] font-medium">Responds (25 pts).</span>{" "}
              The endpoint answers with a non-5xx status. A 402 challenge or a 400/422 complaint
              about our empty body both count — the service is alive.
            </li>
            <li>
              <span className="text-[var(--text)] font-medium">Payment gate (30 pts).</span>{" "}
              Paid listings must answer 402 with a decodable x402 challenge on X Layer
              (eip155:196). Free listings must not demand payment.
            </li>
            <li>
              <span className="text-[var(--text)] font-medium">Price match (15 pts).</span>{" "}
              The challenge amount must equal the marketplace-listed fee.
            </li>
            <li>
              <span className="text-[var(--text)] font-medium">Latency (15) + JSON (10) + self-describing (5).</span>{" "}
              Response time bands, a parseable JSON body, and a description/schema in the reply.
            </li>
            <li>
              <span className="text-[var(--text)] font-medium">Deep checks.</span>{" "}
              When marked “Paid &amp; delivered”, we made a real x402 payment to a ≤$0.02 service
              within a disclosed per-run budget, and the service answered — the only check that
              measures actual delivery.
            </li>
            <li>
              <span className="text-[var(--text)] font-medium">Ours — not ranked.</span>{" "}
              DataBard&apos;s own listings appear labelled and are excluded from every aggregate
              and ranking.
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}

function ServiceRow({ svc }: { svc: IndexedService }) {
  return (
    <li className="border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <Link href={`/probe/marketplace/${svc.serviceId}`} className="no-underline">
        <div className="flex items-center gap-3">
          <span className={`font-display text-xl font-bold tabular-nums w-12 shrink-0 ${scoreTextClass(svc.score)}`}>
            {svc.score}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate text-[var(--text)]">
              {svc.serviceName || svc.agentName}
              {svc.ours && (
                <span className="ml-2 rounded border border-[var(--accent)]/50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--accent)]">
                  ours — not ranked
                </span>
              )}
              {svc.deep?.delivered && (
                <span className="ml-2 rounded border border-[var(--success)]/50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--success)]">
                  paid &amp; delivered
                </span>
              )}
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
              {svc.agentName} · agent #{svc.agentId} ·{" "}
              {svc.feeUsd > 0 ? `$${svc.feeUsd}/call` : "free"} · {svc.latencyMs}ms
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] ${scoreTintClass(svc.score)}`}>
            {svc.status}
          </span>
        </div>
        {(svc.flags[0] || svc.uptimePct !== undefined) && (
          <p className="mt-2 text-[11px] text-[var(--danger)] truncate">
            {svc.flags[0] ?? ""}
            {svc.uptimePct !== undefined && (
              <span className="text-[var(--text-muted)]">
                {svc.flags[0] ? " · " : ""}uptime {svc.uptimePct}%
              </span>
            )}
          </p>
        )}
      </Link>
    </li>
  );
}
