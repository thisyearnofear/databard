"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWizard } from "./wizard-context";
import { track } from "@/lib/track";
import { costHighlights } from "@/lib/cost-framing";
import { StatTile } from "@/components/viz";
import { LeadCapture } from "@/components/LeadCapture";
import { CountUp } from "@/components/CountUp";
import { TiltCard } from "@/components/TiltCard";
import type { Episode } from "@/lib/types";
import type { InsightTotals } from "@/app/api/insights/route";

export function LandingStep() {
  const { state, dispatch, showConnect } = useWizard();
  const router = useRouter();
  const [totals, setTotals] = useState<InsightTotals | null>(null);

  // Live aggregate: the quantified cost of the problem across watched sources
  useEffect(() => {
    fetch("/api/insights")
      .then((r) => r.json())
      .then((d) => { if (d.ok && d.totals?.sources > 0) setTotals(d.totals); })
      .catch(() => {});
  }, []);
  
  // Handle checkout cancellation return
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "cancelled") {
      window.history.replaceState({}, "", "/");
    }
  }, []);
  
  async function handleDemo() {
    track("landing_cta_click", { cta: "demo", persona: state.persona });
    track("demo_start", { persona: state.persona });
    dispatch({ type: "SET_STATUS", status: "Loading demo…" });

    // Dashboard-first: seed deterministic demo data server-side, then land on
    // the dashboard with the demo episode queued up.
    try {
      const res = await fetch("/api/demo/seed", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Demo seed failed");
      dispatch({ type: "SET_STATUS", status: "" });
      router.push(`/protocol?episode=${state.persona === "web3" ? "demo" : "demo-enterprise"}&demo=1`);
      return;
    } catch {
      // Fall back to the in-wizard episode demo below
    }

    dispatch({ type: "SET_STEP", step: "generating" });
    dispatch({ type: "SET_GEN_STEP", step: 0 });
    dispatch({ type: "SET_STATUS", status: "Loading demo…" });

    try {
      const isWeb3 = state.persona === "web3";
      const sampleUrl = isWeb3 ? "/sample-episode-dune.json" : "/sample-episode.json";
      const audioFile = isWeb3 ? "/demo-episode-dune.mp3" : "/demo-episode.mp3";

      const res = await fetch(sampleUrl);
      const demo: Episode = await res.json();
      dispatch({ type: "SET_GEN_STEP", step: 2 });
      dispatch({ type: "SET_EPISODE", episode: demo });

      // Clear any prior demo audio
      dispatch({ type: "SET_AUDIO_URL", url: null });

      const audioCheck = await fetch(audioFile, { method: "HEAD" });
      if (audioCheck.ok) {
        dispatch({ type: "SET_AUDIO_URL", url: audioFile });
      } else {
        dispatch({ type: "SET_STATUS", status: "Demo loaded (audio requires ElevenLabs API key to generate)" });
      }

      dispatch({ type: "SET_STATUS", status: "" });
      dispatch({ type: "SET_STEP", step: "episode" });
    } catch (e: unknown) {
      dispatch({ type: "SET_STATUS", status: `Error: ${e instanceof Error ? e.message : "Failed to load demo"}` });
      dispatch({ type: "RESET" });
    } finally {
      dispatch({ type: "SET_GEN_STEP", step: -1 });
    }
  }
  
  async function handleDemoAnthem() {
    dispatch({ type: "SET_STEP", step: "generating" });
    dispatch({ type: "SET_GEN_STEP", step: 0 });
    dispatch({ type: "SET_STATUS", status: "Loading demo anthem…" });
    
    try {
      const isWeb3 = state.persona === "web3";
      const sampleUrl = isWeb3 ? "/sample-anthem-web3.json" : "/sample-anthem-enterprise.json";
      const audioUrl = isWeb3 ? "/demo-anthem-web3.mp3" : null;
      
      const res = await fetch(sampleUrl);
      const demo: Episode = await res.json();
      dispatch({ type: "SET_GEN_STEP", step: 2 });
      dispatch({ type: "SET_EPISODE", episode: demo });
      dispatch({ type: "SET_AUDIO_URL", url: audioUrl });
      dispatch({ type: "SET_STATUS", status: "" });
      dispatch({ type: "SET_STEP", step: "episode" });
    } catch (e: unknown) {
      dispatch({ type: "SET_STATUS", status: `Error: ${e instanceof Error ? e.message : "Failed to load demo anthem"}` });
      dispatch({ type: "RESET" });
    } finally {
      dispatch({ type: "SET_GEN_STEP", step: -1 });
    }
  }
  
  return (
    <>
      {/* Aurora — slow-moving gradient mesh behind everything */}
      <div className="aurora" aria-hidden />

      {/* Hero — analysis-first, with mouse-tracking spotlight */}
      <section
        className="spotlight-host enter-up relative flex flex-col items-center text-center pt-12 sm:pt-16 pb-8 max-w-2xl"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          e.currentTarget.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
          e.currentTarget.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
        }}
      >
        <div className="spotlight" aria-hidden />
        {/* Tagline */}
        <h1 className="relative z-10 text-4xl sm:text-5xl font-bold tracking-tight mb-4">
          {state.persona === "enterprise" ? (
            <>
              An AI analyst<br />
              <span className="shimmer-text">for your data estate</span>
            </>
          ) : (
            <>
              On-chain data,<br />
              <span className="shimmer-text">on-chain reports</span>
            </>
          )}
        </h1>

        <p className="relative z-10 text-base sm:text-lg text-[var(--text-muted)] mb-8 max-w-md">
          {state.persona === "enterprise"
            ? "One engine computes health scores, lineage risk, and PII flags — two AI hosts debate the findings, delivered as podcasts, dashboards, and reports."
            : "Two AI hosts analyze your on-chain data — join Dune, subgraphs, GitHub, and Slack in one query. Mint on Solana."}
        </p>

        {/* Primary CTA — connect is primary, demo is secondary */}
        <div className="relative z-10 flex flex-wrap justify-center gap-3 mb-8">
          <button
            data-testid="connect-button"
            onClick={() => { track("landing_cta_click", { cta: "connect", persona: state.persona }); track("connect_start", { persona: state.persona }); showConnect(); }}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] hover:brightness-110 text-[var(--bg)] px-6 py-3 font-medium cursor-pointer transition-[transform,filter] duration-200 ease-out hover:scale-[1.02] active:scale-[0.97]"
          >
            <span>{state.persona === "enterprise" ? "Connect your data" : "Query your data"}</span>
            <span>→</span>
          </button>
          <button
            data-testid="demo-button"
            onClick={handleDemo}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)] hover:text-[var(--accent)] px-6 py-3 text-sm font-medium cursor-pointer transition-colors duration-200 active:scale-[0.97]"
          >
            <span>▶</span>
            <span>Try the demo</span>
          </button>
        </div>

        <p className="relative z-10 text-xs text-[var(--text-muted)]">No signup required · 30 seconds to hear it</p>

        {/* Live problem-cost pill — the problem statement proving itself with real data */}
        {state.persona === "enterprise" && totals && costHighlights(totals).length > 0 && (
          <Link
            href="/protocol"
            className="relative z-10 mt-6 inline-flex items-center gap-2 text-xs bg-[var(--danger)]/10 hover:bg-[var(--danger)]/20 text-[var(--danger)] border border-[var(--danger)]/30 rounded-full px-3 py-1.5 font-medium transition-colors"
          >
            <span>🔥</span>
            <span>
              Right now, across {totals.sources} source{totals.sources !== 1 ? "s" : ""} DataBard watches: {costHighlights(totals)[0]}
            </span>
          </Link>
        )}

        {/* On-chain social proof pill */}
        {state.persona === "web3" && state.mintStats && state.mintStats.total > 0 && (
          <Link
            href="/onchain"
            className="relative z-10 mt-6 inline-flex items-center gap-2 text-xs bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30 rounded-full px-3 py-1.5 font-medium transition-colors"
          >
            <span>⛓️</span>
            <span><b>{state.mintStats.total.toLocaleString()}</b> reports minted on Solana</span>
          </Link>
        )}
      </section>

      {/* The problem — quantified pain, not vague claims */}
      <section className="enter-up enter-delay-1 w-full max-w-2xl pb-10">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <TiltCard className="hover-depth bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-[var(--danger)] mb-1">
              <CountUp value={61} suffix="%" />
            </div>
            <p className="text-xs text-[var(--text-muted)] leading-snug">
              of dashboards are never opened in 6 months
            </p>
          </TiltCard>
          <TiltCard className="hover-depth bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-[var(--danger)] mb-1">
              <CountUp value={2.3} decimals={1} suffix="%" />
            </div>
            <p className="text-xs text-[var(--text-muted)] leading-snug">
              of dashboards are actually used for decisions
            </p>
          </TiltCard>
          <TiltCard className="hover-depth bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-[var(--danger)] mb-1">
              <CountUp value={12} suffix="%" />
            </div>
            <p className="text-xs text-[var(--text-muted)] leading-snug">
              open rate on the average data quality report
            </p>
          </TiltCard>
        </div>
        <p className="text-center text-[10px] text-[var(--text-muted)] mt-3">
          Sources: dashboard audit (1,847 dashboards, Medium 2024) · founder confession (5 hrs/week, 12% open rate)
        </p>
      </section>

      {/* Live dashboard stats — proof the engine is running */}
      {totals && totals.sources > 0 && (
        <section className="w-full max-w-2xl pb-10">
          <Link href="/protocol" className="block group">
            <div className="flex flex-wrap gap-3 justify-center">
              <StatTile icon="📊" value={totals.sources} label="Sources watched" />
              <StatTile icon="⚠️" value={totals.failingTests} label="Failing tests" />
              <StatTile icon="🕐" value={totals.staleTables} label="Stale tables" />
              <StatTile icon="📖" value={totals.undocumentedTables} label="Undocumented" />
            </div>
            <p className="text-center text-xs text-[var(--text-muted)] mt-2 group-hover:text-[var(--accent)] transition-colors">
              Live data from the dashboard →
            </p>
          </Link>
        </section>
      )}

      {/* Integrations bar */}
      <section className="w-full max-w-lg pb-10">
        <div className="flex flex-wrap justify-center gap-4 text-xs text-[var(--text-muted)]">
          <span>Powered by ElevenLabs</span>
          <span>·</span>
          {state.persona === "enterprise" ? (
            <>
              <span>OpenMetadata</span>
              <span>·</span>
              <span>dbt Cloud</span>
              <span>·</span>
              <span>Coral</span>
            </>
          ) : (
            <>
              <span>Dune</span>
              <span>·</span>
              <span>The Graph</span>
              <span>·</span>
              <span>Coral</span>
              <span>·</span>
              <a href="/leaderboard" className="hover:text-[var(--text)]">Leaderboard</a>
            </>
          )}
        </div>
      </section>

      {/* Why DataBard — three pillars */}
      <section className="enter-up enter-delay-2 w-full max-w-2xl pb-12">
        <h2 className="text-lg font-semibold text-center mb-4">Why DataBard</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Pillar 1: Health scoring */}
          <TiltCard className="hover-depth bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
            <div className="text-2xl mb-2">📊</div>
            <h3 className="text-sm font-semibold mb-1">Health scoring</h3>
            <p className="text-xs text-[var(--text-muted)]">
              {state.persona === "enterprise"
                ? "AI computes health scores from test coverage, lineage risk, PII flags, and freshness — across every table you own."
                : "AI scores indexer lag, freshness, and entity relationships — across every subgraph you run."}
            </p>
          </TiltCard>
          {/* Pillar 2: Alerts that find you */}
          <TiltCard className="hover-depth bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
            <div className="text-2xl mb-2">🔔</div>
            <h3 className="text-sm font-semibold mb-1">Alerts that find you</h3>
            <p className="text-xs text-[var(--text-muted)]">
              Get Slack or webhook alerts when health drops. Weekly digest podcasts keep your team informed without a dashboard tab open.
            </p>
            <Link href="/alerts" className="text-[10px] text-[var(--accent)] hover:underline mt-1.5 inline-block">Set up alerts →</Link>
          </TiltCard>
          {/* Pillar 3: Verifiable by design */}
          <TiltCard className="hover-depth bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
            <div className="text-2xl mb-2">⛓️</div>
            <h3 className="text-sm font-semibold mb-1">Verifiable by design</h3>
            <p className="text-xs text-[var(--text-muted)]">
              {state.persona === "enterprise"
                ? "Every health report is attestable on-chain — a permanent audit trail your team and auditors can verify."
                : "Every health report is mintable on Solana. Insights settle through on-chain escrow — the seller commits what they delivered, the buyer releases funds only after that commitment."}
            </p>
            {state.persona === "web3" ? (
              <div className="flex items-center justify-center gap-3 mt-1.5">
                <Link href="/onchain" className="text-[10px] text-[var(--accent)] hover:underline inline-block">See the showcase →</Link>
                <Link href="/market" className="text-[10px] text-[var(--accent)] hover:underline inline-block">Watch escrow settle →</Link>
              </div>
            ) : (
              <Link href="/verify" className="text-[10px] text-[var(--accent)] hover:underline mt-1.5 inline-block">Verify an attestation →</Link>
            )}
          </TiltCard>
        </div>
      </section>

      {/* Coral showcase — cross-source SQL */}
      <section className="enter-up enter-delay-3 w-full max-w-2xl pb-12">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">🪸</span>
            <h2 className="text-lg font-semibold">Query 50+ sources with SQL</h2>
          </div>
          <p className="text-sm text-[var(--text-muted)] mb-4">
            Coral is an open-source SQL engine that joins APIs, databases, and files — no ETL, no data warehouse. DataBard uses it as the primary data layer for cross-source analysis.
          </p>
          <div className="bg-[var(--bg)] border border-[var(--border)] rounded-xl p-4 font-mono text-xs overflow-x-auto">
            <div className="text-[var(--text-muted)] mb-1">-- Find stale PRs across your repos</div>
            <div><span className="text-[var(--accent)]">SELECT</span> number, title, author, created_at</div>
            <div><span className="text-[var(--accent)]">FROM</span> github.pulls</div>
            <div><span className="text-[var(--accent)]">WHERE</span> state = <span className="text-yellow-400">'open'</span></div>
            <div>&&nbsp;&nbsp;<span className="text-[var(--accent)]">AND</span> created_at &lt; <span className="text-yellow-400">NOW()</span> - <span className="text-yellow-400">INTERVAL '2 days'</span></div>
            <div><span className="text-[var(--accent)]">ORDER BY</span> created_at <span className="text-[var(--accent)]">ASC</span></div>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            {["GitHub", "Slack", "Jira", "Linear", "Postgres", "Stripe", "Notion", "CSV files"].map((src) => (
              <span key={src} className="text-[10px] bg-[var(--bg)] border border-[var(--border)] rounded-full px-2.5 py-1 text-[var(--text-muted)]">
                {src}
              </span>
            ))}
            <span className="text-[10px] text-[var(--accent)] font-medium">+ 40 more</span>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="w-full max-w-2xl pb-12">
        <h2 className="text-lg font-semibold text-center mb-5">FAQ</h2>
        <div className="flex flex-col gap-3">
          <details className="group bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
            <summary className="text-sm font-medium cursor-pointer flex items-center justify-between list-none">
              <span>Is my data stored anywhere?</span>
              <span className="text-[var(--text-muted)] group-open:rotate-45 transition-transform text-lg">+</span>
            </summary>
            <p className="text-xs text-[var(--text-muted)] mt-2 leading-relaxed">
              No. Credentials are sent over HTTPS and never persisted on disk. Coral queries run locally on your machine — data never leaves it. Generated audio is ephemeral unless you explicitly save or {state.persona === "enterprise" ? "attest" : "mint"} it.
            </p>
          </details>
          <details className="group bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
            <summary className="text-sm font-medium cursor-pointer flex items-center justify-between list-none">
              <span>How long does it take?</span>
              <span className="text-[var(--text-muted)] group-open:rotate-45 transition-transform text-lg">+</span>
            </summary>
            <p className="text-xs text-[var(--text-muted)] mt-2 leading-relaxed">
              About 30–90 seconds from Connect to listening. The AI analyzes your schema, writes a script, and synthesizes audio in real time. You can watch each step complete.
            </p>
          </details>
          <details className="group bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
            <summary className="text-sm font-medium cursor-pointer flex items-center justify-between list-none">
              <span>What is Coral?</span>
              <span className="text-[var(--text-muted)] group-open:rotate-45 transition-transform text-lg">+</span>
            </summary>
            <p className="text-xs text-[var(--text-muted)] mt-2 leading-relaxed">
              Coral is an open-source SQL engine that queries 50+ data sources — GitHub, Slack, Jira, Postgres, Stripe, and more. DataBard uses it as the primary data layer: write a SQL query, and we&apos;ll analyze the results and generate a podcast episode. You can also connect specific sources directly (OpenMetadata, dbt, Dune) for deeper metadata extraction.
            </p>
          </details>
          <details className="group bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
            <summary className="text-sm font-medium cursor-pointer flex items-center justify-between list-none">
              <span>{state.persona === "enterprise" ? "Does it cost anything?" : "Do I need SOL to use this?"}</span>
              <span className="text-[var(--text-muted)] group-open:rotate-45 transition-transform text-lg">+</span>
            </summary>
            <p className="text-xs text-[var(--text-muted)] mt-2 leading-relaxed">
              {state.persona === "enterprise"
                ? "DataBard is free to try. Generation uses your own API keys (ElevenLabs for audio). No hidden fees."
                : "Listening is free. Minting a report on-chain costs a small SOL transaction fee (~0.01 SOL). No wallet needed just to generate and listen."}
            </p>
          </details>
          <details className="group bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
            <summary className="text-sm font-medium cursor-pointer flex items-center justify-between list-none">
              <span>Can I get alerts when something breaks?</span>
              <span className="text-[var(--text-muted)] group-open:rotate-45 transition-transform text-lg">+</span>
            </summary>
            <p className="text-xs text-[var(--text-muted)] mt-2 leading-relaxed">
              Yes. DataBard monitors your connected sources and sends Slack or webhook alerts when health scores drop or tests start failing. You can also schedule weekly digest podcasts — your team gets a fresh audio briefing every Monday morning without anyone opening a dashboard.
            </p>
          </details>
        </div>
      </section>

      {/* Email capture — the "talk to us" moment */}
      <section className="enter-up enter-delay-4 w-full max-w-2xl pb-8">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 text-center">
          <h2 className="text-base font-semibold mb-1">Want a verified data health report?</h2>
          <p className="text-xs text-[var(--text-muted)] mb-4">
            We&apos;ll set you up with a live briefing on your data — no commitment, no setup.
          </p>
          <LeadCapture
            source="landing_footer"
            prompt=""
            buttonText="Get my report →"
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="enter-up enter-delay-5 w-full max-w-2xl border-t border-[var(--border)] pt-6 pb-8 mt-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[var(--text-muted)]">
          <div className="flex items-center gap-2">
            <span className="font-medium text-[var(--text)]">DataBard</span>
            <span>·</span>
            <span>© {new Date().getFullYear()}</span>
          </div>
          <nav className="flex items-center gap-4">
            <a
              href="https://github.com/thisyearnofear/databard"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--text)] transition-colors"
            >
              GitHub
            </a>
            <Link href="/protocol" className="hover:text-[var(--text)] transition-colors">
              Dashboard
            </Link>
            <Link href="/alerts" className="hover:text-[var(--text)] transition-colors">
              Alerts
            </Link>
            <Link href="/labs" className="hover:text-[var(--text)] transition-colors">
              Labs
            </Link>
            <Link href="/roast" className="hover:text-[var(--text)] transition-colors">
              🔥 Roast my data
            </Link>
            {state.persona === "web3" && (
              <Link href="/leaderboard" className="hover:text-[var(--text)] transition-colors">
                Leaderboard
              </Link>
            )}
            {state.persona === "web3" && (
              <Link href="/market" className="hover:text-[var(--text)] transition-colors">
                Market
              </Link>
            )}
            {state.persona === "web3" && (
              <Link href="/onchain" className="hover:text-[var(--text)] transition-colors">
                On-chain
              </Link>
            )}
            <a
              href="https://withcoral.com/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--text)] transition-colors"
            >
              Coral Docs
            </a>
          </nav>
        </div>
      </footer>
    </>
  );
}
