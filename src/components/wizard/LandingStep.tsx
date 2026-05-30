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
              Your data catalog,<br />
              <span className="text-[var(--accent)]">as a podcast</span>
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
            ? "Two AI hosts debate your schema health — flag failing tests, trace lineage, call out PII gaps."
            : "Turn Dune queries and subgraphs into shareable episodes. Mint on Solana."}
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
            {state.persona === "enterprise" ? "Connect your data" : "Connect Dune or subgraph"}
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
              <span>Dune</span>
            </>
          ) : (
            <>
              <span>Dune</span>
              <span>·</span>
              <span>The Graph</span>
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
            <div className="text-2xl mb-2">🔌</div>
            <h3 className="text-sm font-semibold mb-1">Connect</h3>
            <p className="text-xs text-[var(--text-muted)]">
              {state.persona === "enterprise" 
                ? "Link your OpenMetadata, dbt, or other data source"
                : "Paste your Dune API key or subgraph URL"}
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
                ? "Listen, share MP3, or save to playlists"
                : "Record on Solana, share with your community"}
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
