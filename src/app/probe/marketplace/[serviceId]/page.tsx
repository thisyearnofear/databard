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

        {/* Sub-scores + checks */}
        <section className="mt-8" aria-labelledby="checks">
          <h2 id="checks" className="text-sm font-semibold">What we verified</h2>
          <p className="mt-2 text-[11px] text-[var(--text-muted)]">
            {svc.lastPaidVerification?.delivered
              ? "Verification: paid & delivered — a real x402 payment was made and the service answered."
              : svc.verification === "gate"
                ? "Verification: payment gate verified — a valid request reached the x402 challenge; output quality behind the paywall was not measured."
                : svc.verification === "delivered"
                  ? "Verification: delivered — a valid request got a substantive payload without payment."
                  : svc.verification === "failed"
                    ? "Verification: failed — payment signed but the service did not deliver."
                    : "Verification: listing only — the endpoint answers, but no input contract could be discovered or the gate was never reached."}
            {svc.inputSource && ` Input contract discovered via: ${svc.inputSource}.`}
          </p>
          {svc.subScores && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {([
                ["Availability", svc.subScores.availability],
                ["Payment integrity", svc.subScores.paymentIntegrity],
                ["Delivery", svc.subScores.delivery],
              ] as const).map(([label, v]) => (
                <div key={label} className="border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
                  <div className="font-display text-lg font-bold tabular-nums">
                    {v === null || v === undefined ? "—" : v}
                  </div>
                  <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                    {label}{v === null || v === undefined ? " · unknown" : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
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
              {svc.flags.map((f) => {
                // Provider-facing notes (paywall hygiene) are styled neutral —
                // they aren't buyer risk.
                const providerNote =
                  f.startsWith("Payment not enforced") || f.startsWith("Returned free content");
                const neutral =
                  providerNote ||
                  f.startsWith("Couldn't build") ||
                  f.startsWith("MCP server") ||
                  f.includes("inconclusive");
                return (
                  <li
                    key={f}
                    className={`rounded-full border px-3 py-1 text-[11px] ${
                      neutral
                        ? "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]"
                        : "border-[var(--danger)]/40 bg-[var(--danger)]/10 text-[var(--danger)]"
                    }`}
                  >
                    {providerNote ? "Provider note: " : ""}
                    {f}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Evidence: the exact requests we sent */}
        {svc.attempts && svc.attempts.length > 0 && (
          <section className="mt-6" aria-labelledby="evidence">
            <h2 id="evidence" className="text-sm font-semibold">Evidence — requests we sent</h2>
            <ul className="mt-3 flex flex-col gap-2">
              {svc.attempts.map((a, i) => (
                <li key={i} className="border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5">
                  <p className="font-mono text-[11px] text-[var(--text)]">
                    {a.paid ? "PAID " : ""}{a.method} {a.url} → HTTP {a.status}
                  </p>
                  {a.body && (
                    <pre className="mt-1 overflow-x-auto rounded bg-[var(--bg)] p-2 text-[10px] text-[var(--text-muted)]">{a.body}</pre>
                  )}
                  {a.snippet && (
                    <pre className="mt-1 overflow-x-auto rounded bg-[var(--bg)] p-2 text-[10px] text-[var(--text-muted)]">{a.snippet}</pre>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {svc.lastPaidVerification && (
          <section className="mt-6 border border-[var(--border)] bg-[var(--surface)] px-5 py-4" aria-labelledby="deep">
            <h2 id="deep" className="text-sm font-semibold">Paid verification — a real payment</h2>
            <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
              {svc.lastPaidVerification.delivered
                ? `Paid $${svc.lastPaidVerification.amountUsd ?? svc.feeUsd} via x402 on ${svc.lastPaidVerification.at.slice(0, 10)} and the service delivered (HTTP ${svc.lastPaidVerification.status}).`
                : svc.lastPaidVerification.error
                  ? `Attempted a payment on ${svc.lastPaidVerification.at.slice(0, 10)}: ${svc.lastPaidVerification.error}.`
                  : `Payment signed on ${svc.lastPaidVerification.at.slice(0, 10)} but the service returned HTTP ${svc.lastPaidVerification.status}.`}
            </p>
            {svc.lastPaidVerification.settlementTx && (
              <a
                href={`https://www.oklink.com/xlayer/tx/${svc.lastPaidVerification.settlementTx}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-xs text-[var(--accent)] hover:underline"
              >
                Settlement tx on OKLink ↗
              </a>
            )}
            {svc.lastPaidVerification.responseSnippet && (
              <pre className="mt-2 overflow-x-auto rounded bg-[var(--bg)] p-2 text-[10px] text-[var(--text-muted)]">
                {`HTTP ${svc.lastPaidVerification.status ?? "?"}${svc.lastPaidVerification.responseContentType ? ` · ${svc.lastPaidVerification.responseContentType}` : ""}\n${svc.lastPaidVerification.responseSnippet}`}
              </pre>
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
