import type { Metadata } from "next";
import Link from "next/link";
import { getLatestIndex, type IndexedService } from "@/lib/marketplace-index";
import { getLatestBriefing } from "@/lib/marketplace-briefing";
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

const STATUS_FILTERS = ["all", "healthy", "degraded", "unverified", "broken", "unreachable"] as const;

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filter = STATUS_FILTERS.includes(status as never) ? (status as string) : "all";
  const index = await getLatestIndex();
  const briefing = await getLatestBriefing();
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

        {index && briefing?.audioUrl && (
          <section className="mt-6 border border-[var(--border)] bg-[var(--surface)] px-5 py-4" aria-labelledby="daily-briefing">
            <h2 className="text-sm font-semibold">Today&apos;s marketplace briefing</h2>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              {briefing.summary} · generated {new Date(briefing.generatedAt).toUTCString()}
            </p>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio controls preload="none" src={briefing.audioUrl} className="mt-3 w-full" />
            <details className="mt-3">
              <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                Transcript
              </summary>
              <ol className="mt-2 flex flex-col gap-2">
                {briefing.script.map((seg, i) => (
                  <li key={i} className="text-xs leading-relaxed text-[var(--text-muted)]">
                    <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text)]">{seg.speaker}:</span>{" "}
                    {seg.text}
                  </li>
                ))}
              </ol>
            </details>
          </section>
        )}

        {index && (
          <>
            {/* Headline stat: of the paid calls where settlement actually
                happened, what share delivered a real payload. */}
            {(index.aggregates.paidAttempted ?? 0) >= 1 && (
              <div className="mt-6 border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-5 py-4">
                <p className="font-display text-lg font-bold">
                  Paid &amp; delivered {index.aggregates.paidDeliveredVerified ?? 0} of{" "}
                  {index.aggregates.paidSettledVerified ?? 0} service
                  {(index.aggregates.paidSettledVerified ?? 0) === 1 ? "" : "s"} where payment settled
                  {(index.aggregates.settledDeliveryRate ?? null) !== null &&
                    (index.aggregates.paidSettledVerified ?? 0) >= 10 &&
                    ` (${Math.round((index.aggregates.settledDeliveryRate ?? 0) * 100)}%)`}
                </p>
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                  {index.aggregates.paidAttempted} paid verification
                  {index.aggregates.paidAttempted === 1 ? "" : "s"} total
                  {(index.aggregates.paidDeliveredThin ?? 0) > 0 &&
                    ` · ${index.aggregates.paidDeliveredThin} thin`}
                  {(index.aggregates.paidErrored ?? 0) > 0 &&
                    ` · ${index.aggregates.paidErrored} errored after settlement`}
                  {(index.aggregates.paidPaymentRejected ?? 0) > 0 &&
                    ` · ${index.aggregates.paidPaymentRejected} re-challenged (inconclusive)`}
                  {(index.aggregates.paidNotSettled ?? 0) > 0 &&
                    ` · ${index.aggregates.paidNotSettled} never settled`}
                  {(index.aggregates.paidGuessExcluded ?? 0) > 0 &&
                    ` · ${index.aggregates.paidGuessExcluded} excluded (guessed inputs)`}{" "}
                  — real x402 payments on X Layer; the headline only counts calls made
                  with schema- or dictionary-verified inputs.
                </p>
              </div>
            )}
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                [index.aggregates.healthy, "healthy", "var(--success)"],
                [index.aggregates.degraded, "degraded", "var(--warning)"],
                [index.aggregates.unverified ?? 0, "unverified", "var(--text-muted)"],
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
              {(index.aggregates.gateVerified ?? 0) > 0 &&
                ` · ${index.aggregates.gateVerified} reached a payment gate · ${index.aggregates.delivered} delivered`}
              {(index.aggregates.verifyAttempted ?? 0) > 0 &&
                ` · ${index.aggregates.verifyAttempted} paid verification${index.aggregates.verifyAttempted === 1 ? "" : "s"} ($${index.aggregates.verifySpentUsd} settled)`}
              {index.attestation?.registry && (
                <>
                  {" · "}
                  <a
                    href={`https://www.oklink.com/xlayer/address/${index.attestation.registry}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--accent)] hover:underline"
                  >
                    Scores on-chain: registry {index.attestation.registry.slice(0, 6)}…{index.attestation.registry.slice(-4)}
                  </a>
                  {index.attestation.updated !== undefined && ` · ${index.attestation.updated} updated`}
                </>
              )}
              {index.attestation?.txHash && !index.attestation?.registry && (
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
              <span className="text-[var(--text)] font-medium">We send a real request, not an empty ping.</span>{" "}
              For every listing we discover the input contract — the MCP tool schema from a
              JSON-RPC handshake, the x402 challenge&apos;s declared input schema, field names in
              the service&apos;s own validation error, or keywords in the listing description — and
              synthesize a valid request from a public dictionary (BTC, a known wallet, a real
              tx hash, today&apos;s date). A 400/422 naming more fields triggers one repair retry.
            </li>
            <li>
              <span className="text-[var(--text)] font-medium">Three sub-scores, unknown stays unknown.</span>{" "}
              Availability (responds + latency, 30%), payment integrity (the x402 gate on
              eip155:196 and the listed price, 30%), and delivery (a substantive payload to a
              valid request, 40%). A sub-score we could not measure is null, not zero — services
              with no verifiable gate or delivery are labelled unverified rather than failed.
            </li>
            <li>
              <span className="text-[var(--text)] font-medium">Verification levels.</span>{" "}
              “Payment gate verified” means a valid request reached a decodable x402 challenge —
              free for us, and honest about its limit: output quality behind the paywall was not
              measured. “Paid &amp; delivered” means we signed a real payment (≤$0.05 fees, inside a
              disclosed $1/day budget) and the service delivered.
            </li>
            <li>
              <span className="text-[var(--text)] font-medium">Safety.</span>{" "}
              Services whose tool name or endpoint suggests side effects (transfer, swap, order,
              mint, delete…) are never actively called — flagged “Skipped active call” instead.
              Every request we sent is published on the service&apos;s detail page as evidence.
            </li>
            <li>
              <span className="text-[var(--text)] font-medium">Stale data.</span>{" "}
              Delivered payloads dated more than 7 days ago are flagged and halve the delivery
              score.
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
          <span className={`font-display text-xl font-bold tabular-nums w-12 shrink-0 ${svc.score === null ? "text-[var(--text-muted)]" : scoreTextClass(svc.score)}`}>
            {svc.score ?? "—"}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate text-[var(--text)]">
              {svc.serviceName || svc.agentName}
              {svc.ours && (
                <span className="ml-2 rounded border border-[var(--accent)]/50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--accent)]">
                  ours — not ranked
                </span>
              )}
              {svc.lastPaidVerification?.delivered && (
                <span className="ml-2 rounded border border-[var(--success)]/50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--success)]">
                  paid &amp; delivered
                </span>
              )}
              {!svc.lastPaidVerification?.delivered && svc.lastPaidVerification && (
                <span className="ml-2 rounded border border-[var(--danger)]/50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--danger)]">
                  paid &amp; failed
                </span>
              )}
              {!svc.lastPaidVerification && svc.verification === "gate" && (
                <span className="ml-2 rounded border border-[var(--accent)]/50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--accent)]">
                  gate verified
                </span>
              )}
              {!svc.lastPaidVerification && svc.verification === "delivered" && svc.feeUsd === 0 && (
                <span className="ml-2 rounded border border-[var(--success)]/50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--success)]">
                  delivered (free)
                </span>
              )}
              {!svc.lastPaidVerification && svc.verification === "none" && svc.status === "unverified" && (
                <span className="ml-2 rounded border border-[var(--text-muted)]/50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  listing only
                </span>
              )}
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
              {svc.agentName} · agent #{svc.agentId} ·{" "}
              {svc.feeUsd > 0 ? `$${svc.feeUsd}/call` : "free"} · {svc.latencyMs}ms
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] ${scoreTintClass(svc.score ?? 0)}`}>
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
