"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { MondaySignup } from "@/components/MondaySignup";

const TIERS: Record<string, { name: string; price: string; includes: string[] }> = {
  snapshot: {
    name: "Snapshot",
    price: "£29",
    includes: ["Health score", "Top finding", "One category benchmark"],
  },
  plus: {
    name: "The Scorecard",
    price: "£99",
    includes: ["Benchmarked verdict report", "Cited category norms", "3-step action plan", "Same-day delivery"],
  },
  operator: {
    name: "Scorecard + Analyst",
    price: "£249",
    includes: ["Everything in the Scorecard", "30-min analyst prep call", "4 weekly re-checks"],
  },
};

type SessionInfo = {
  ok: boolean;
  paymentStatus?: string;
  sku?: string | null;
  email?: string | null;
  error?: string;
};

type OrderInfo = { ok: boolean; status?: string; reportUrl?: string | null };

export default function AuditSuccessPage() {
  const { sku } = useParams<{ sku: string }>();
  const search = useSearchParams();
  const sessionId = search.get("session_id");
  const [info, setInfo] = useState<SessionInfo | null>(null);
  const [order, setOrder] = useState<OrderInfo | null>(null);
  const tier = TIERS[sku] ?? null;

  useEffect(() => {
    if (!sessionId) return;
    fetch(`/api/checkout/session?session_id=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => setInfo({ ok: false, error: "Could not verify the session" }));
  }, [sessionId]);

  // Poll order status until the report is delivered, then offer the link.
  useEffect(() => {
    if (!sessionId || order?.reportUrl) return;
    let cancelled = false;
    const poll = () =>
      fetch(`/api/audit/order?session_id=${encodeURIComponent(sessionId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (!cancelled && d?.ok) setOrder(d); })
        .catch(() => {});
    poll();
    const t = setInterval(poll, 5000);
    return () => { cancelled = true; clearInterval(t); };
  }, [sessionId, order?.reportUrl]);

  const paid = info?.ok && info.paymentStatus === "paid";

  return (
    <main className="enter-up min-h-screen bg-[var(--bg)] text-[var(--text)] px-4 py-10" id="main-content">
      <div className="max-w-[560px] mx-auto">
        <Link href="/roast" className="inline-flex items-center py-1.5 font-mono text-xs text-[var(--text-muted)] no-underline hover:text-[var(--text)]">
          ← Roast my data
        </Link>

        <div className="mt-6 border border-[var(--border)] bg-[var(--surface)] px-5 py-6">
          {!sessionId && (
            <p className="text-sm text-[var(--text-muted)]">No session to verify — this page is the post-checkout landing.</p>
          )}

          {sessionId && !info && (
            <p className="font-mono text-sm text-[var(--text-muted)]">Verifying payment…</p>
          )}

          {info && !paid && (
            <>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--warning)]">Payment not confirmed</p>
              <h1 className="text-xl font-bold mt-2">We couldn&apos;t confirm that payment</h1>
              <p className="text-sm text-[var(--text-muted)] mt-2">
                {info.error ?? `Stripe reports this session as ${info.paymentStatus ?? "unknown"}. If you were charged, the receipt will reconcile — contact us with your session id.`}
              </p>
            </>
          )}

          {paid && tier && (
            <>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--success)]">Paid · {tier.price}</p>
              <h1 className="text-xl font-bold mt-2">{tier.name} ordered</h1>
              <p className="text-sm text-[var(--text-muted)] mt-2 leading-relaxed">
                {info.email
                  ? <>Receipt goes to <span className="font-mono text-[var(--text)]">{info.email}</span>. </>
                  : ""}
                Your audit report is generated from the data behind your roast — it lands at the same address. Operator Pack buyers get a scheduling link for the analyst call.
              </p>
              <ul className="mt-4 flex flex-col gap-1.5">
                {tier.includes.map((item) => (
                  <li key={item} className="text-sm text-[var(--text-muted)] flex gap-2">
                    <span className="text-[var(--accent)]">·</span>{item}
                  </li>
                ))}
              </ul>
              {order?.reportUrl ? (
                <a
                  href={order.reportUrl}
                  className="mt-4 inline-block rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-[var(--bg)] no-underline hover:brightness-110 transition"
                >
                  View your Scorecard →
                </a>
              ) : (
                <p className="mt-4 font-mono text-[11px] text-[var(--text-muted)]">
                  Generating your report — the link appears here when it&apos;s ready.
                </p>
              )}
            </>
          )}

          {paid && !tier && (
            <>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--success)]">Paid</p>
              <h1 className="text-xl font-bold mt-2">Payment received</h1>
              <p className="text-sm text-[var(--text-muted)] mt-2">Your audit is queued. The report lands by email.</p>
            </>
          )}
        </div>

        {paid && (
          <div className="mt-6 border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">Keep the verdict coming</p>
            <div className="mt-2">
              <MondaySignup schema={tier?.name ?? "audit"} source="monday:audit" />
            </div>
          </div>
        )}

        <p className="mt-6 text-[11px] text-[var(--text-muted)]">
          Questions about an order? Reply to your Stripe receipt — it reaches us.
        </p>
      </div>
    </main>
  );
}
