import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AgentHealthDemo } from "@/components/agents/AgentHealthDemo";
import { AgentsPageTracker } from "@/components/agents/AgentsPageTracker";
import { AgentIntegrationDetails } from "@/components/agents/AgentIntegrationDetails";
import { PixelIcon } from "@/components/dither-kit";
import { DitherField } from "@/components/editions/DitherField";
import { getLatestIndex } from "@/lib/marketplace-index";
import { buildMarketplaceSeries, seedFromString } from "@/lib/dither-field";

export const metadata: Metadata = {
  title: "DataBard for agents — Check, explain, verify",
  description: "Give your agent a free data health check, compare services before paying, and inspect the evidence behind an answer.",
};

/* The landscape is grown from the marketplace index, which lives in the
   server's data dir — the local build machine cannot prerender it, so read
   per request (same treatment as /probe/marketplace). */
export const dynamic = "force-dynamic";

/** The hero landscape, grown from the marketplace index it reports on. */
async function AgentsLandscape() {
  try {
    const index = await getLatestIndex();
    if (!index) return null;
    const series = buildMarketplaceSeries(index.services);
    if (!series) return null;
    return <DitherField series={series} seed={seedFromString(index.generatedAt)} className="h-full w-full" />;
  } catch {
    return null;
  }
}

export default function AgentsPage() {
  return (
    <main className="report-surface bg-[var(--bg)] px-5 py-14 sm:py-20">
      <AgentsPageTracker />
      <div className="mx-auto max-w-6xl">
        <section className="relative isolate">
          <div
            className="pointer-events-none absolute inset-x-0 -inset-y-10 opacity-40 sm:opacity-100 [mask-image:linear-gradient(to_right,transparent_0%,black_48%)]"
            aria-hidden="true"
          >
            <Suspense fallback={null}>
              <AgentsLandscape />
            </Suspense>
          </div>
          <div className="relative grid items-start gap-12 lg:grid-cols-[minmax(0,.95fr)_minmax(0,1.05fr)]">
          <div>
            <p className="enter-up font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">DataBard for agents</p>
            <h1 className="enter-up enter-delay-1 mt-4 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">Useful answers.<br />Inspectable evidence.</h1>
            <p className="enter-up enter-delay-2 mt-6 max-w-[44ch] text-base leading-relaxed text-[var(--text-muted)]">Give your agent a health check, compare services before paying, or inspect an anchored report. Start free; paid calls require explicit authorization.</p>
            <p className="enter-up enter-delay-3 mt-5 inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 font-mono text-[11px] text-[var(--text-muted)]">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--success)]" aria-hidden="true" />
              Also listed on
              <a href="https://www.okx.ai" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">OKX.AI ↗</a>
              · ASP #9878
            </p>
            <ol className="enter-up enter-delay-3 mt-10 divide-y divide-[var(--border)] border-y border-[var(--border)]">
              {[
                { title: "Analyze a data source", href: "#try-health-check", description: "Get a health summary, key findings, and a recommended next step.", label: "Try a free example", icon: "check" },
                { title: "Check a service before you pay", href: "/probe", description: "Compare the default service set in a free preview. Paid responses and custom candidates require the agent endpoint.", label: "Compare services", icon: "search" },
                { title: "Marketplace health index", href: "/probe/marketplace", description: "Every A2MCP service on OKX.AI, checked with one unpaid request — or call databard_service_score for a lookup before paying.", label: "See the index", icon: "chart" },
                { title: "Check an anchored report", href: "/verify", description: "Inspect a report commitment separately from its payment receipt. No wallet connection needed.", label: "Check a record", icon: "link" },
              ].map((item, index) => (
                <li key={item.href} className="flex gap-4 py-6">
                  <span className="pt-1 font-mono text-xs text-[var(--accent)]">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h2 className="flex items-center gap-2 text-base font-semibold"><PixelIcon name={item.icon as "check" | "search" | "chart" | "link"} size={14} className="shrink-0 text-[var(--accent)]" />{item.title}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{item.description}</p>
                    <Link href={item.href} className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-[var(--accent)] hover:underline">{item.label} →</Link>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <AgentHealthDemo />
          </div>
        </section>
        <hr className="dither-rule mt-16" aria-hidden="true" />
        <section className="pt-8" aria-label="Agent integration">
          <AgentIntegrationDetails>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--text-muted)]">Start with discovery, then send a source configuration to the appropriate tool. The free example above uses sample data. Paid calls return a payment requirement; your agent must obtain authorization before paying and retrying.</p>
            <div className="mt-6 max-w-2xl rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">Zero to first call</p>
              <pre className="mt-3 overflow-x-auto text-xs leading-relaxed text-[var(--text)]">{`# 1. Discover the tools and schemas
curl https://databard.persidian.com/api/mcp/tools

# 2. Free health check — no credentials, labelled demo data
curl -X POST https://databard.persidian.com/api/mcp/health-check \\
  -H 'content-type: application/json' \\
  -d '{"demo":true}'

# 3. Free service-quality preview — five live A2MCP services
curl -X POST https://databard.persidian.com/api/probe/preview \\
  -H 'content-type: application/json' \\
  -d '{}'

# 4. Paid tools answer 402 with a PAYMENT-REQUIRED header;
#    your agent signs once (x402, USDT0 on X Layer) and retries.
curl -i -X POST https://databard.persidian.com/api/agent/probe \\
  -H 'content-type: application/json' \\
  -d '{"attest": true}'`}</pre>
            </div>
            <dl className="mt-6 grid gap-4 sm:grid-cols-2">
              {[
                ["Discover capabilities", "GET /api/mcp/tools", "Input and output schemas for the available tools."],
                ["Check data health", "POST /api/mcp/health-check", "Free health findings and recommended actions."],
                ["Check a service verdict", "POST /api/mcp/service-score", "Free machine-readable verdict — safe_to_pay, caution, avoid, or unknown — for any indexed service."],
                ["Marketplace briefing", "POST /api/mcp/briefing", "Paid narrative layer on top of the free verdict: quotable summary, key findings, and a two-speaker script (plus opt-in audio) for your human. {} for the whole marketplace, or scope with agentIds/query. mode:\"schema\" for the data-estate briefing. audio: none|url|inline."],
                ["Compare candidate services", "POST /api/agent/probe", "Paid comparison with a cost receipt and optional verdict anchoring."],
              ].map(([title, endpoint, description]) => (
                <div key={endpoint} className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5"><dt className="text-sm font-semibold">{title}</dt><dd className="mt-2 break-words font-mono text-xs text-[var(--accent)]">{endpoint}</dd><dd className="mt-3 text-sm text-[var(--text-muted)]">{description}</dd></div>
              ))}
            </dl>
            <p className="mt-5 text-sm leading-relaxed text-[var(--text-muted)]">Use the server’s payment challenge for the current price and payment instructions. The examples on this page never authorize payments. An integrity receipt, a payment receipt, and an on-chain report commitment are different records.</p>
            <div className="mt-4 flex flex-wrap gap-6"><Link href="/api/mcp/tools" className="inline-flex min-h-11 items-center text-sm text-[var(--accent)] hover:underline">Tool schemas →</Link><Link href="/llms.txt" className="inline-flex min-h-11 items-center text-sm text-[var(--accent)] hover:underline">Integration guide →</Link></div>
          </AgentIntegrationDetails>
        </section>
        <footer className="mt-12 flex flex-wrap justify-between gap-4 border-t border-[var(--border)] pt-6 text-xs text-[var(--text-muted)]"><Link href="/">DataBard</Link><div className="flex gap-5"><Link href="/earn">Public reports</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div></footer>
      </div>
    </main>
  );
}
