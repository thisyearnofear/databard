import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — DataBard",
  description:
    "How DataBard collects, uses, and protects your data catalog metadata, connection credentials, and account information.",
};

const LAST_UPDATED = "2025-01-15";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] px-4 py-12 relative enter-up">
      <div className="max-w-2xl mx-auto">
        <div className="mb-10">
          <Link href="/" className="text-[var(--text-muted)] text-sm no-underline">
            ← Back to DataBard
          </Link>
          <h1 className="text-[28px] font-extrabold mt-4 mb-2">Privacy Policy</h1>
          <p className="text-[var(--text-muted)] text-sm">
            Last updated: {LAST_UPDATED}
          </p>
        </div>

        <div className="flex flex-col gap-8 text-sm leading-relaxed">
          <section>
            <p className="text-[var(--text-muted)]">
              DataBard (&ldquo;we&rdquo;, &ldquo;us&rdquo;) connects to your data catalog and
              generates AI-powered audio briefings about data health. This policy explains what we
              collect, what we don&apos;t, and the choices you have. By using DataBard you agree to
              the practices described here.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">What data we collect</h2>
            <ul className="flex flex-col gap-2 list-disc pl-5 text-[var(--text-muted)]">
              <li>
                <span className="text-[var(--text)]">Connection credentials</span> — API tokens and
                endpoint URLs for the data sources you connect (OpenMetadata, dbt, Coral, Dune,
                The Graph, and others). These are used only to fetch metadata on your behalf.
              </li>
              <li>
                <span className="text-[var(--text)]">Schema metadata</span> — table names, column
                names, test results, ownership info, and lineage relationships fetched from your
                data catalog during analysis.
              </li>
              <li>
                <span className="text-[var(--text)]">Usage analytics</span> — page views and funnel
                events such as CTA clicks, demo plays, and persona toggles. Events are stored in a
                rolling 10,000-entry window.
              </li>
              <li>
                <span className="text-[var(--text)]">Email address</span> — if you subscribe to
                scheduled digests or upgrade to Pro, we store the address you provide to deliver
                briefings and account communications.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">What we don&apos;t collect</h2>
            <p className="text-[var(--text-muted)]">
              We never see your actual data rows or query results. DataBard reads only{" "}
              <span className="text-[var(--text)]">metadata</span> — information about table
              structure, health, ownership, and lineage. The contents of your tables are never
              transmitted to or stored by DataBard.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">How we use your data</h2>
            <ul className="flex flex-col gap-2 list-disc pl-5 text-[var(--text-muted)]">
              <li>Generate analysis — health scores, critical-table detection, and trend narratives.</li>
              <li>Synthesize audio briefings from the generated analysis scripts.</li>
              <li>Send scheduled email digests to subscribers.</li>
              <li>Improve the product, including model quality and user experience.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">Subprocessors</h2>
            <p className="text-[var(--text-muted)] mb-3">
              We rely on the following third-party services to deliver DataBard:
            </p>
            <ul className="flex flex-col gap-2 list-disc pl-5 text-[var(--text-muted)]">
              <li>
                <span className="text-[var(--text)]">ElevenLabs</span> — text-to-speech audio
                synthesis for briefings.
              </li>
              <li>
                <span className="text-[var(--text)]">OpenAI / Anthropic</span> — large language
                models used to generate briefing scripts.
              </li>
              <li>
                <span className="text-[var(--text)]">Stripe</span> — payment processing for Pro
                subscriptions.
              </li>
              <li>
                <span className="text-[var(--text)]">Solana</span> — on-chain attestation, if you
                opt into that feature. Attestation data is public by design.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">Data retention</h2>
            <ul className="flex flex-col gap-2 list-disc pl-5 text-[var(--text-muted)]">
              <li>
                <span className="text-[var(--text)]">Audio briefings</span> are cached for 24 hours
                after generation.
              </li>
              <li>
                <span className="text-[var(--text)]">Analysis scripts</span> are cached for 1 hour
                after generation.
              </li>
              <li>
                <span className="text-[var(--text)]">Analytics events</span> are retained in a
                rolling window of 10,000 entries; older events are discarded.
              </li>
              <li>
                <span className="text-[var(--text)]">Pro account data</span> (email, connected
                sources, preferences) is retained while your subscription is active and removed
                promptly after cancellation.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">Your rights</h2>
            <ul className="flex flex-col gap-2 list-disc pl-5 text-[var(--text-muted)]">
              <li>Request deletion of your account and associated data at any time.</li>
              <li>Export a copy of the data we hold about you.</li>
              <li>Cancel your subscription anytime — no questions asked.</li>
            </ul>
            <p className="text-[var(--text-muted)] mt-3">
              To exercise any of these rights, email{" "}
              <a
                href="mailto:privacy@databard.persidian.com"
                className="text-[var(--accent)] no-underline"
              >
                privacy@databard.persidian.com
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">Contact</h2>
            <p className="text-[var(--text-muted)]">
              Questions about this policy or your data? Reach us at{" "}
              <a
                href="mailto:privacy@databard.persidian.com"
                className="text-[var(--accent)] no-underline"
              >
                privacy@databard.persidian.com
              </a>
              .
            </p>
          </section>
        </div>

        <div className="mt-12 pt-6 border-t border-[var(--border)]">
          <Link href="/" className="text-[var(--text-muted)] text-sm no-underline">
            ← Back to DataBard
          </Link>
        </div>
      </div>
    </main>
  );
}
