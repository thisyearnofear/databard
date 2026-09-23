import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLatestIndex } from "@/lib/marketplace-index";
import { scoreTextClass, scoreTintClass } from "@/lib/product/score-tone";

export const dynamic = "force-dynamic";

const PUBLIC_BASE = (process.env.NEXT_PUBLIC_URL || "https://databard.persidian.com").replace(/\/$/, "");

export async function generateMetadata({
  params,
}: {
  params: Promise<{ serviceId: string }>;
}): Promise<Metadata> {
  const { serviceId } = await params;
  const index = await getLatestIndex();
  const svc = index?.services.find((s) => s.serviceId === serviceId);
  if (!svc) return { title: "Service — DataBard Probe" };
  const title = `${svc.serviceName || svc.agentName} scored ${svc.score} on DataBard Probe`;
  const description = `${svc.agentName} · ${svc.status} · ${svc.feeUsd > 0 ? `$${svc.feeUsd}/call` : "free"} — checked without payment against its OKX.AI marketplace listing.`;
  return {
    title,
    description,
    openGraph: { title, description, url: `${PUBLIC_BASE}/probe/marketplace/${serviceId}` },
    twitter: { card: "summary", title, description },
  };
}

export default async function MarketplaceServicePage({
  params,
}: {
  params: Promise<{ serviceId: string }>;
}) {
  const { serviceId } = await params;
  const index = await getLatestIndex();
  const svc = index?.services.find((s) => s.serviceId === serviceId);
  if (!svc) notFound();

  const badgeUrl = `${PUBLIC_BASE}/api/probe/badge/${svc.serviceId}`;
  const pageUrl = `${PUBLIC_BASE}/probe/marketplace/${svc.serviceId}`;
  const markdown = `[![DataBard Probe](${badgeUrl})](${pageUrl})`;

  return (
    <main className="report-surface enter-up min-h-screen bg-[var(--bg)] text-[var(--text)] px-4 py-10" id="main-content">
      <div className="max-w-[720px] mx-auto">
        <Link href="/probe/marketplace" className="inline-flex items-center py-1.5 font-mono text-xs text-[var(--text-muted)] no-underline hover:text-[var(--text)]">
          ← Marketplace health
        </Link>

        <div className="mt-6 border border-[var(--border)] bg-[var(--surface)] px-5 py-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight">{svc.serviceName || svc.agentName}</h1>
              <p className="text-sm text-[var(--text-muted)] mt-1">
                {svc.agentName} · agent #{svc.agentId} · {svc.category || "uncategorised"}
                {svc.ours && (
                  <span className="ml-2 rounded border border-[var(--accent)]/50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--accent)]">
                    ours — not ranked
                  </span>
                )}
              </p>
              <p className="mt-2 break-all font-mono text-xs text-[var(--accent)]">{svc.endpoint}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Listed {svc.feeUsd > 0 ? `at $${svc.feeUsd}/call` : "free"} · checked{" "}
                {index ? new Date(index.generatedAt).toUTCString() : ""} · uptime {svc.uptimePct ?? "—"}%
              </p>
            </div>
            <div className="text-right shrink-0">
              <span className={`font-display text-4xl font-bold tabular-nums ${scoreTextClass(svc.score)}`}>
                {svc.score}
              </span>
              <span className="text-sm text-[var(--text-muted)]"> /100</span>
              <p className={`mt-1 inline-block rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] ${scoreTintClass(svc.score)}`}>
                {svc.status}
              </p>
            </div>
          </div>
          {svc.description && (
            <p className="mt-4 text-xs leading-relaxed text-[var(--text-muted)] border-t border-[var(--border)] pt-4">
              {svc.description}
            </p>
          )}
        </div>

        {/* Checks */}
        <section className="mt-8" aria-labelledby="checks">
          <h2 id="checks" className="text-sm font-semibold">What we checked — one unpaid request</h2>
          <p className="mt-2 text-[11px] text-[var(--text-muted)]">
            {svc.deep?.delivered
              ? "Verified level: paid delivery — a real x402 payment was made and the service answered."
              : "Verified level: listing — endpoint and payment gate checked without payment; output quality behind the paywall was not measured."}
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {Object.entries(svc.checks).map(([name, check]) => (
              <li key={name} className="flex items-center gap-3 border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5">
                <span
                  className={`inline-block h-2 w-2 rounded-full shrink-0 ${
                    check.pass === "pass"
                      ? "bg-[var(--success)]"
                      : check.pass === "partial"
                        ? "bg-[var(--warning)]"
                        : "bg-[var(--danger)]"
                  }`}
                  aria-hidden="true"
                />
                <span className="font-mono text-xs w-28 shrink-0">{name}</span>
                <span className="text-xs text-[var(--text-muted)]">{check.detail}</span>
              </li>
            ))}
          </ul>
        </section>

        {svc.flags.length > 0 && (
          <section className="mt-6" aria-labelledby="flags">
            <h2 id="flags" className="text-sm font-semibold">Flags</h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {svc.flags.map((f) => (
                <li key={f} className="rounded-full border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-1 text-[11px] text-[var(--danger)]">
                  {f}
                </li>
              ))}
            </ul>
          </section>
        )}

        {svc.deep && (
          <section className="mt-6 border border-[var(--border)] bg-[var(--surface)] px-5 py-4" aria-labelledby="deep">
            <h2 id="deep" className="text-sm font-semibold">Deep check — a real payment</h2>
            <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
              {svc.deep.delivered
                ? `Paid $${svc.deep.amountUsd ?? svc.feeUsd} via x402 and the service delivered (HTTP ${svc.deep.status}).`
                : svc.deep.error
                  ? `Attempted a payment: ${svc.deep.error}.`
                  : `Payment signed but the service returned HTTP ${svc.deep.status}.`}
            </p>
            {svc.deep.settlementTx && (
              <a
                href={`https://www.oklink.com/xlayer/tx/${svc.deep.settlementTx}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-xs text-[var(--accent)] hover:underline"
              >
                Settlement tx on OKLink ↗
              </a>
            )}
          </section>
        )}

        {/* On-chain read for contracts/agents */}
        {process.env.PROBE_REGISTRY_ADDRESS && (
          <section className="mt-6 border border-[var(--border)] bg-[var(--surface)] px-5 py-4" aria-labelledby="onchain">
            <h2 id="onchain" className="text-sm font-semibold">For contracts — read this score on-chain</h2>
            <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
              Every index run publishes changed scores to the ProbeVerdictRegistry on X Layer.
              Gate a payment on it directly:
            </p>
            <pre className="mt-3 overflow-x-auto rounded bg-[var(--bg)] p-3 text-xs text-[var(--text)]">{`isSafeToPay(${svc.serviceId}, 70, 1 days)
// → true when the last published verdict is healthy/degraded,
//   score ≥ 70, checked within 1 day`}</pre>
            <a
              href={`https://www.oklink.com/xlayer/address/${process.env.PROBE_REGISTRY_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-xs text-[var(--accent)] hover:underline"
            >
              Registry {process.env.PROBE_REGISTRY_ADDRESS.slice(0, 6)}…{process.env.PROBE_REGISTRY_ADDRESS.slice(-4)} on OKLink ↗
            </a>
          </section>
        )}

        {/* Badge for the provider's README */}
        <section className="mt-8 border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-5 py-5" aria-labelledby="badge">
          <h2 id="badge" className="text-sm font-semibold">Badge for your README</h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={badgeUrl} alt={`DataBard Probe score: ${svc.score} (${svc.status})`} className="mt-3 h-5" />
          <pre className="mt-3 overflow-x-auto rounded bg-[var(--bg)] p-3 text-xs text-[var(--text)]">{markdown}</pre>
        </section>
      </div>
    </main>
  );
}
