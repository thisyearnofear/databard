"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWizard } from "./wizard-context";
import { track } from "@/lib/track";
import { costHighlights } from "@/lib/cost-framing";
import { setDataContext } from "@/lib/data-context";
import { StatTile } from "@/components/viz";
import { PixelIcon } from "@/components/dither-kit";
import { LeadCapture } from "@/components/LeadCapture";
import { LandingProof } from "./LandingProof";
import type { Episode } from "@/lib/types";
import type { InsightTotals } from "@/app/api/insights/route";
import { WORKSPACES, workspaceHref } from "@/lib/product/workspaces";

export function LandingStep() {
  const { state, dispatch, showConnect } = useWizard();
  const router = useRouter();
  const workspace = state.persona === "web3" ? "protocols" : "teams";
  const workspaceCopy = WORKSPACES[workspace].landing;
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

    // Protocols demo lands on this week's public table, then the briefing.
    try {
      const res = await fetch("/api/demo/seed", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Demo seed failed");
      dispatch({ type: "SET_STATUS", status: "" });
      setDataContext({ kind: "demo", label: "Demo", detail: "sample briefing", source: "demo", demo: true });
      router.push(workspace === "protocols" ? "/league?from=demo" : `/protocol?episode=demo-enterprise&demo=1&workspace=teams`);
      return;
    } catch {
      // Fall back to the in-wizard episode demo below
    }

    dispatch({ type: "SET_STEP", step: "generating" });
    dispatch({ type: "SET_GEN_STEP", step: 0 });
    dispatch({ type: "SET_STATUS", status: "Loading demo…" });
    setDataContext({ kind: "demo", label: "Demo", detail: "sample episode", source: "demo", demo: true });

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
      {/* Hero — analysis-first, with mouse-tracking spotlight */}
      <section
        className="spotlight-host enter-up relative flex flex-col items-center text-center pt-24 sm:pt-28 pb-8 max-w-2xl"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          e.currentTarget.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
          e.currentTarget.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
        }}
      >
        <div className="spotlight" aria-hidden />
        <div className="relative z-10 mb-3 font-mono text-[10px] font-medium tracking-[0.2em] text-[var(--accent)]">{workspaceCopy.eyebrow}</div>
        <h1 className="relative z-10 text-4xl sm:text-5xl font-bold tracking-tight mb-4">
          {workspaceCopy.title}
        </h1>

        <p className="relative z-10 text-base sm:text-lg text-[var(--text-muted)] mb-8 max-w-md">
          {workspaceCopy.description}
        </p>

        {/* Demo-first: the zero-friction "wow" is the highest-converting path,
            so it leads. Connect is a real step, kept as an equal-weight secondary. */}
        <div className="relative z-10 flex flex-col items-center gap-3 mb-8">
          <button
            data-testid="demo-button"
            onClick={handleDemo}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] hover:brightness-110 text-[var(--bg)] px-7 py-3.5 text-base font-semibold cursor-pointer transition-[transform,filter] duration-200 ease-out hover:scale-[1.02] active:scale-[0.97] shadow-lg shadow-[var(--accent)]/20"
          >
            <span>{workspaceCopy.demoLabel}</span>
            <span aria-hidden>→</span>
          </button>
          <button
            data-testid="connect-button"
            onClick={() => {
              track("landing_cta_click", { cta: "connect", persona: state.persona });
              track("connect_start", { persona: state.persona });
              if (state.persona === "enterprise") {
                dispatch({ type: "SET_SOURCE", source: "dbt-local" });
              }
              showConnect();
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] text-[var(--text)] px-7 py-3.5 text-base font-semibold cursor-pointer transition-[transform,color,border-color] duration-200 ease-out hover:scale-[1.02] active:scale-[0.97]"
          >
            <span>{workspaceCopy.connectLabel}</span>
            <span aria-hidden>→</span>
          </button>
        </div>

        <p className="relative z-10 text-xs text-[var(--text-muted)]">
          {state.persona === "web3"
            ? "Public subgraphs and Dune queries · no wallet needed to listen"
            : "Read-only setup · Upload a manifest and your analyst starts in 90 seconds"}
        </p>

        {/* Live problem-cost pill — the problem statement proving itself with real data */}
        {state.persona === "enterprise" && totals && costHighlights(totals).length > 0 && (
          <Link
            href={workspaceHref("/protocol", workspace)}
            className="relative z-10 mt-6 inline-flex items-center gap-2 text-xs bg-[var(--danger)]/10 hover:bg-[var(--danger)]/20 text-[var(--danger)] border border-[var(--danger)]/30 rounded-full px-3 py-1.5 font-medium transition-colors"
          >
            <PixelIcon name="flame" size={12} />
            <span>
              Right now, across {totals.sources} source{totals.sources !== 1 ? "s" : ""} DataBard watches: {costHighlights(totals)[0]}
            </span>
          </Link>
        )}

        {/* On-chain social proof pill */}
        {state.persona === "web3" && state.mintStats && state.mintStats.total > 0 && (
          <Link
            href={workspaceHref("/onchain", workspace)}
            className="relative z-10 mt-6 inline-flex items-center gap-2 text-xs bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30 rounded-full px-3 py-1.5 font-medium transition-colors"
          >
            <PixelIcon name="chain" size={12} />
            <span><b>{state.mintStats.total.toLocaleString()}</b> reports minted on Solana</span>
          </Link>
        )}
      </section>

      <LandingProof
        workspace={workspace}
        onConnect={() => {
          track("landing_cta_click", { cta: "proof", persona: state.persona });
          track("connect_start", { persona: state.persona });
          if (state.persona === "enterprise") {
            dispatch({ type: "SET_SOURCE", source: "dbt-local" });
          }
          showConnect();
        }}
      />

      {/* Product preview — show the actual dashboard, not just talk about it */}
      <section className="enter-up enter-delay-1 w-full max-w-3xl pb-10">
        <Link href={workspaceHref("/protocol", workspace)} className="block group">
          <div className="relative rounded-xl overflow-hidden border border-[var(--border)] shadow-2xl shadow-black/40 transition-transform duration-300 group-hover:scale-[1.01]">
            {/* Browser chrome */}
            <div className="flex items-center gap-2 px-4 py-2.5 bg-[var(--surface)] border-b border-[var(--border)]">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-[var(--danger)]/60" />
                <div className="w-3 h-3 rounded-full bg-[var(--warning)]/60" />
                <div className="w-3 h-3 rounded-full bg-[var(--success)]/60" />
              </div>
              <div className="flex-1 ml-3 text-xs font-mono text-[var(--text-muted)] bg-[var(--bg)] rounded-md px-3 py-1 border border-[var(--border)]">
                databard.persidian.com/protocol
              </div>
            </div>
            {/* Screenshot */}
            <img
              src="/dashboard-preview.png"
              alt="DataBard protocol dashboard showing health scores, trend narratives, and source health list"
              className="w-full block"
              loading="lazy"
            />
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-[var(--accent)]/0 group-hover:bg-[var(--accent)]/5 transition-colors duration-300 pointer-events-none" />
          </div>
          <p className="text-center text-xs text-[var(--text-muted)] mt-3 group-hover:text-[var(--accent)] transition-colors">
            See the live dashboard →
          </p>
        </Link>
      </section>

      {/* Live dashboard stats — proof the engine is running */}
      {totals && totals.sources > 0 && (
        <section className="w-full max-w-2xl pb-10">
          <Link href={workspaceHref("/protocol", workspace)} className="block group">
            <div className="flex flex-wrap gap-3 justify-center">
              <StatTile icon="chart" value={totals.sources} label="Sources watched" />
              <StatTile icon="warning" value={totals.failingTests} label="Failing tests" />
              <StatTile icon="clock" value={totals.staleTables} label="Stale tables" />
              <StatTile icon="book" value={totals.undocumentedTables} label="Undocumented" />
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
              <span>DataHub</span>
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
              <Link href={workspaceHref("/league", workspace)} className="hover:text-[var(--text)]">League</Link>
            </>
          )}
        </div>
      </section>

      {/* Why DataBard — three pillars, minimal (no cards) */}
      <section className="enter-up enter-delay-2 w-full max-w-2xl pb-12">
        <h2 className="text-lg font-semibold text-center mb-6">Why DataBard</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
          {/* Pillar 1: Synthesis */}
          <div className="text-center">
            <div className="mb-2 flex justify-center text-[var(--accent)]"><PixelIcon name="spark" size={20} /></div>
            <h3 className="text-sm font-semibold mb-1">Synthesis, not raw data</h3>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              {state.persona === "enterprise"
                ? "Your analyst computes health scores from test coverage, lineage risk, PII flags, and freshness — then explains why they changed, across every table you own."
                : "Your analyst scores indexer lag, freshness, and entity relationships — then explains why they changed, across every subgraph you run."}
            </p>
          </div>
          {/* Pillar 2: Always watching */}
          <div className="text-center">
            <div className="mb-2 flex justify-center text-[var(--accent)]"><PixelIcon name="bell" size={20} /></div>
            <h3 className="text-sm font-semibold mb-1">Always watching</h3>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              Your analyst checks your data 24/7 and reaches out via Slack or webhook when it finds something. Weekly briefings keep your team informed without a dashboard tab open.
            </p>
            <Link href={workspaceHref("/alerts", workspace)} className="text-xs text-[var(--accent)] hover:underline mt-1.5 inline-block">Set up alerts →</Link>
          </div>
          {/* Pillar 3: weekly delivery (Teams) or attestation (Protocols) */}
          <div className="text-center">
            <div className="mb-2 flex justify-center text-[var(--accent)]"><PixelIcon name={state.persona === "web3" ? "chain" : "mail"} size={20} /></div>
            <h3 className="text-sm font-semibold mb-1">
              {state.persona === "web3" ? "Verifiable by design" : "In the Monday inbox"}
            </h3>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              {state.persona === "web3"
                ? "Every health report is mintable on Solana. Anyone can recompute the hash and check it against the on-chain memo — no need to trust our servers."
                : "Your analyst emails the 2-minute briefing every Monday. Forward it in Slack. Unlimited listeners — you are not charged per seat."}
            </p>
            {state.persona === "web3" ? (
              <div className="flex items-center justify-center gap-3 mt-1.5">
                <Link href={workspaceHref("/onchain", workspace)} className="text-xs text-[var(--accent)] hover:underline inline-block">See the showcase →</Link>
                <Link href={workspaceHref("/verify", workspace)} className="text-xs text-[var(--accent)] hover:underline inline-block">Verify an attestation →</Link>
              </div>
            ) : (
              <Link href="/pro" className="text-xs text-[var(--accent)] hover:underline mt-1.5 inline-block">Set up the weekly digest →</Link>
            )}
          </div>
        </div>
      </section>

      {/* Coral showcase — Protocols only; Teams should not look like a SQL engine */}
      {state.persona === "web3" && (
      <section className="enter-up enter-delay-3 w-full max-w-2xl pb-12">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[var(--accent)]"><PixelIcon name="search" size={16} /></span>
            <h2 className="text-lg font-semibold">Query 50+ sources with SQL</h2>
          </div>
          <p className="text-sm text-[var(--text-muted)] mb-4">
            Join Dune, GitHub, Slack, and protocol APIs in one query — no ETL. DataBard narrates the result as a briefing.
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
            {["Dune", "The Graph", "GitHub", "Slack", "Postgres"].map((src) => (
              <span key={src} className="text-xs bg-[var(--bg)] border border-[var(--border)] rounded-full px-2.5 py-1 text-[var(--text-muted)]">
                {src}
              </span>
            ))}
            <span className="text-xs text-[var(--accent)] font-medium">+ 40 more</span>
          </div>
        </div>
      </section>
      )}

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
              {state.persona === "web3"
                ? "Credentials are sent over HTTPS and never persisted on disk. Generated audio is ephemeral unless you explicitly save or mint it. Public subgraph scores can be attested on-chain."
                : "Credentials are sent over HTTPS and never persisted on disk. Upload a dbt manifest or connect a catalog with a read-only token. Generated audio is ephemeral unless you save it."}
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
              <span>{state.persona === "web3" ? "What is Coral?" : "What do I need to connect?"}</span>
              <span className="text-[var(--text-muted)] group-open:rotate-45 transition-transform text-lg">+</span>
            </summary>
            <p className="text-xs text-[var(--text-muted)] mt-2 leading-relaxed">
              {state.persona === "web3"
                ? "Coral is an open-source SQL engine for 50+ sources. Write a query that joins Dune, GitHub, or Slack, and DataBard turns the result into a briefing. You can also paste a Dune query URL or subgraph endpoint directly."
                : "A dbt target/manifest.json is enough. If you have OpenMetadata, DataHub, or dbt Cloud, connect those for lineage, owners, and tests. Everything is read-only."}
            </p>
          </details>
          <details className="group bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
            <summary className="text-sm font-medium cursor-pointer flex items-center justify-between list-none">
              <span>{state.persona === "enterprise" ? "Does it cost anything?" : "Do I need SOL to use this?"}</span>
              <span className="text-[var(--text-muted)] group-open:rotate-45 transition-transform text-lg">+</span>
            </summary>
            <p className="text-xs text-[var(--text-muted)] mt-2 leading-relaxed">
              {state.persona === "enterprise"
                ? "One briefing is free. Weekly digests are $49/month for the whole team — unlimited listeners, no per-seat fee."
                : "Listening is free. Minting a report on-chain costs a small SOL transaction fee (~0.01 SOL). No wallet needed just to generate and listen."}
            </p>
          </details>
          <details className="group bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
            <summary className="text-sm font-medium cursor-pointer flex items-center justify-between list-none">
              <span>Can I get alerts when something breaks?</span>
              <span className="text-[var(--text-muted)] group-open:rotate-45 transition-transform text-lg">+</span>
            </summary>
            <p className="text-xs text-[var(--text-muted)] mt-2 leading-relaxed">
              Yes. Slack or webhook alerts fire when health drops. You can also schedule a weekly briefing — a fresh 2-minute audio every Monday, without anyone opening a dashboard.
            </p>
          </details>
        </div>
      </section>

      {/* Email capture — the "talk to us" moment */}
      <section className="enter-up enter-delay-4 w-full max-w-2xl pb-8">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 text-center">
          <h2 className="text-base font-semibold mb-1">
            {state.persona === "web3" ? "Want a briefing on your subgraph?" : "Want a briefing on your warehouse?"}
          </h2>
          <p className="text-xs text-[var(--text-muted)] mb-4">
            {state.persona === "web3"
              ? "Send us a Dune dashboard or subgraph URL. We'll run the report and send you the 2-minute briefing — no setup."
              : "Send a dbt manifest or catalog URL. We'll run the report and send you the briefing — no commitment."}
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
          <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-left">
            <a
              href="https://github.com/thisyearnofear/databard"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--text)] transition-colors"
            >
              GitHub
            </a>
            <Link href={workspaceHref("/protocol", workspace)} className="hover:text-[var(--text)] transition-colors">
              Dashboard
            </Link>
            <Link href={workspaceHref("/alerts", workspace)} className="hover:text-[var(--text)] transition-colors">
              Alerts
            </Link>
            <Link href="/labs" className="hover:text-[var(--text)] transition-colors">
              Labs
            </Link>
            <Link href="/roast" className="inline-flex items-center gap-1.5 hover:text-[var(--text)] transition-colors">
              <PixelIcon name="flame" size={11} className="text-[var(--danger)]" />
              Roast my data
            </Link>
            {state.persona === "web3" && (
              <Link href={workspaceHref("/league", workspace)} className="hover:text-[var(--text)] transition-colors">
                League
              </Link>
            )}
            {state.persona === "web3" && (
              <Link href={workspaceHref("/market", workspace)} className="hover:text-[var(--text)] transition-colors">
                Market
              </Link>
            )}
            {state.persona === "web3" && (
              <Link href={workspaceHref("/onchain", workspace)} className="hover:text-[var(--text)] transition-colors">
                On-chain
              </Link>
            )}
            {state.persona === "web3" && (
              <a
                href="https://withcoral.com/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[var(--text)] transition-colors"
              >
                Coral Docs
              </a>
            )}
            <Link href="/privacy" className="hover:text-[var(--text)] transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-[var(--text)] transition-colors">
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
