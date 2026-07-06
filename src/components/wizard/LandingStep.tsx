"use client";

import { useEffect, useCallback } from "react";
import Link from "next/link";
import { useWizard } from "./wizard-context";
import type { Episode } from "@/lib/types";

export function LandingStep() {
  const { state, dispatch, showConnect } = useWizard();
  
  // Handle checkout cancellation return
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "cancelled") {
      window.history.replaceState({}, "", "/");
    }
  }, []);
  
  async function handleDemo() {
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
      {/* Hero */}
      <section className="flex flex-col items-center text-center pt-12 sm:pt-16 pb-8 max-w-2xl">
        {/* Tagline */}
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
          {state.persona === "enterprise" ? (
            <>
              An AI analyst<br />
              <span className="text-[var(--accent)]">for your data estate</span>
            </>
          ) : (
            <>
              On-chain data,<br />
              <span className="text-[var(--accent)]">on-chain reports</span>
            </>
          )}
        </h1>

        <p className="text-base sm:text-lg text-[var(--text-muted)] mb-8 max-w-md">
          {state.persona === "enterprise"
            ? "One engine computes health scores, lineage risk, and PII flags — two AI hosts debate the findings, delivered as podcasts, dashboards, and reports."
            : "Two AI hosts analyze your on-chain data — join Dune, subgraphs, GitHub, and Slack in one query. Mint on Solana."}
        </p>
        
        {/* Primary CTA */}
        <div className="flex flex-wrap justify-center gap-3 mb-8">
          <button
            data-testid="demo-button"
            onClick={handleDemo}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] hover:brightness-110 text-white px-6 py-3 font-medium cursor-pointer transition-all hover:scale-[1.02]"
          >
            <span>▶</span>
            <span>Try the demo</span>
          </button>
          <button
            data-testid="connect-button"
            onClick={showConnect}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)] hover:text-[var(--accent)] px-6 py-3 text-sm font-medium cursor-pointer transition-colors"
          >
            {state.persona === "enterprise" ? "Connect your data" : "Query your data"}
          </button>
        </div>
        
        <p className="text-xs text-[var(--text-muted)]">No signup required · 30 seconds to hear it</p>
        
        {/* On-chain social proof pill */}
        {state.persona === "web3" && state.mintStats && state.mintStats.total > 0 && (
          <Link
            href="/onchain"
            className="mt-6 inline-flex items-center gap-2 text-xs bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30 rounded-full px-3 py-1.5 font-medium transition-colors"
          >
            <span>⛓️</span>
            <span><b>{state.mintStats.total.toLocaleString()}</b> reports minted on Solana</span>
          </Link>
        )}
      </section>
      
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
      
      {/* How it works */}
      <section className="w-full max-w-2xl pb-12">
        <h2 className="text-lg font-semibold text-center mb-4">
          {state.persona === "enterprise" ? "How it works" : "How it works"}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
            <div className="text-2xl mb-2">{state.persona === "enterprise" ? "🔌" : "🪸"}</div>
            <h3 className="text-sm font-semibold mb-1">{state.persona === "enterprise" ? "Connect" : "Query"}</h3>
            <p className="text-xs text-[var(--text-muted)]">
              {state.persona === "enterprise" 
                ? "Link your OpenMetadata, dbt, or use Coral for cross-source SQL"
                : "Join Dune, subgraphs, GitHub, Slack, and 50+ sources in one SQL query"}
            </p>
          </div>
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
            <div className="text-2xl mb-2">🎙️</div>
            <h3 className="text-sm font-semibold mb-1">Analyze</h3>
            <p className="text-xs text-[var(--text-muted)]">
              {state.persona === "enterprise" 
                ? "AI reviews table health, test coverage, lineage"
                : "AI reviews indexer lag, freshness, entity relationships"}
            </p>
          </div>
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
            <div className="text-2xl mb-2">{state.persona === "enterprise" ? "📤" : "⛓️"}</div>
            <h3 className="text-sm font-semibold mb-1">{state.persona === "enterprise" ? "Share" : "Mint"}</h3>
            <p className="text-xs text-[var(--text-muted)]">
              {state.persona === "enterprise"
                ? "Listen, share MP3, export reports, track trends on the dashboard"
                : "Record on Solana, share with your community"}
            </p>
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
              No. Credentials are sent over HTTPS and never persisted on disk. Coral queries run locally on your machine — data never leaves it. Generated audio is ephemeral unless you explicitly save or mint it.
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
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full max-w-2xl border-t border-[var(--border)] pt-6 pb-8 mt-auto">
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
            {state.persona === "web3" && (
              <Link href="/leaderboard" className="hover:text-[var(--text)] transition-colors">
                Leaderboard
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
