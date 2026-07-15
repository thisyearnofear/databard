"use client";
/**
 * /market — the autonomous marketplace monitor.
 *
 * No "kick off" button. The Watchdog runs on its own cadence; when catalog drift crosses
 * threshold, the auction just starts. The viewer sees an agent economy that operates without
 * them. A tab lets you switch to the reseller graph view (Consumer → Digest → Newsroom).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Bid, Deal, Want } from "@/lib/types";
import { WatchdogMonitor, type MonitorState } from "@/components/market/WatchdogMonitor";
import { AuctionStage, type StagePhase } from "@/components/market/AuctionStage";
import { ActivityFeed } from "@/components/market/ActivityFeed";
import { GraphView } from "@/components/market/GraphView";

// Fake delta oscillator params — visual only; the real trigger is the server-side computeDelta.
const IDLE_DELTA_RANGE: [number, number] = [0.08, 0.15];
const TRIGGER_DELTA = 0.24;
const NEXT_CHECK_SEC = 45;

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? "request failed");
  return json as T;
}

type Track = "watchdog" | "graph" | "head-to-head";

interface RaceSide {
  wantId: string | null;
  want: Want | null;
  bids: Bid[];
  deal: Deal | null;
  phase: StagePhase;
}
const EMPTY_SIDE: RaceSide = { wantId: null, want: null, bids: [], deal: null, phase: "warmup" };

export default function MarketPage() {
  const [track, setTrack] = useState<Track>("watchdog");
  const [monitorState, setMonitorState] = useState<MonitorState>("idle");
  const [countdown, setCountdown] = useState(NEXT_CHECK_SEC);
  const [deltaScore, setDeltaScore] = useState(0.12);
  const [cycleCount, setCycleCount] = useState(0);

  // Auction stage state (watchdog track)
  const [want, setWant] = useState<Want | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [audio, setAudio] = useState<string | null>(null);
  const [phase, setPhase] = useState<StagePhase>("warmup");
  const [rationaleDone, setRationaleDone] = useState(false);

  // Graph track state
  const [parentDeal, setParentDeal] = useState<Deal | null>(null);
  const [subDeals, setSubDeals] = useState<Deal[]>([]);
  const [graphAudio, setGraphAudio] = useState<string | null>(null);

  // Head-to-head race track state — two Watchdogs, same schema, different budgets
  const [frugal, setFrugal] = useState<RaceSide>(EMPTY_SIDE);
  const [premium, setPremium] = useState<RaceSide>(EMPTY_SIDE);

  const cyclingRef = useRef(false);
  const trackRef = useRef<Track>(track);
  useEffect(() => {
    trackRef.current = track;
  }, [track]);

  const resetStage = useCallback(() => {
    setWant(null);
    setBids([]);
    setDeal(null);
    setAudio(null);
    setPhase("warmup");
    setRationaleDone(false);
  }, []);

  // Countdown timer while idle
  useEffect(() => {
    if (monitorState !== "idle") return;
    if (countdown <= 0) return;
    const iv = setInterval(() => setCountdown((n) => n - 1), 1000);
    return () => clearInterval(iv);
  }, [monitorState, countdown]);

  // Delta oscillator while idle — mild jitter to feel alive
  useEffect(() => {
    if (monitorState !== "idle") return;
    const iv = setInterval(() => {
      setDeltaScore((d) => {
        const [lo, hi] = IDLE_DELTA_RANGE;
        const jitter = (Math.random() - 0.5) * 0.02;
        const next = d + jitter;
        return Math.max(lo, Math.min(hi, next));
      });
    }, 1500);
    return () => clearInterval(iv);
  }, [monitorState]);

  // Auto-fire when countdown hits 0
  useEffect(() => {
    if (monitorState !== "idle") return;
    if (countdown > 0) return;
    if (cyclingRef.current) return;
    cyclingRef.current = true;
    runCycle().finally(() => {
      cyclingRef.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown, monitorState]);

  async function runCycle() {
    if (trackRef.current === "watchdog") {
      await runWatchdogCycle();
    } else if (trackRef.current === "graph") {
      await runGraphCycle();
    } else {
      await runHeadToHeadCycle();
    }
  }

  async function runHeadToHeadCycle() {
    try {
      setFrugal(EMPTY_SIDE);
      setPremium(EMPTY_SIDE);
      setMonitorState("detected");
      setDeltaScore(TRIGGER_DELTA);
      await pause(1200);

      setMonitorState("in-cycle");
      const post = await postJson<{
        frugal: { wantId: string; want: Want; bids: Bid[] };
        premium: { wantId: string; want: Want; bids: Bid[] };
      }>("/api/market/head-to-head", { fixture: "ecommerce", phase: "post" });

      setFrugal((s) => ({ ...s, wantId: post.frugal.wantId, want: post.frugal.want, bids: post.frugal.bids, phase: "warmup" }));
      setPremium((s) => ({ ...s, wantId: post.premium.wantId, want: post.premium.want, bids: post.premium.bids, phase: "warmup" }));

      await pause(1500);
      const awarded = await postJson<{
        frugal: { deal: Deal };
        premium: { deal: Deal };
      }>("/api/market/head-to-head", {
        phase: "award",
        frugalWantId: post.frugal.wantId,
        premiumWantId: post.premium.wantId,
      });
      setFrugal((s) => ({ ...s, deal: awarded.frugal.deal, phase: "picking" }));
      setPremium((s) => ({ ...s, deal: awarded.premium.deal, phase: "picking" }));

      await pause(1800);
      setFrugal((s) => ({ ...s, phase: "depositing" }));
      setPremium((s) => ({ ...s, phase: "depositing" }));
      await pause(600);

      const delivered = await postJson<{
        frugal: { deal: Deal };
        premium: { deal: Deal };
      }>("/api/market/head-to-head", {
        phase: "deliver",
        frugalWantId: post.frugal.wantId,
        premiumWantId: post.premium.wantId,
      });
      setFrugal((s) => ({ ...s, deal: delivered.frugal.deal, phase: "committing" }));
      setPremium((s) => ({ ...s, deal: delivered.premium.deal, phase: "committing" }));
      await pause(1000);

      const released = await postJson<{
        frugal: { deal: Deal };
        premium: { deal: Deal };
      }>("/api/market/head-to-head", {
        phase: "release",
        frugalWantId: post.frugal.wantId,
        premiumWantId: post.premium.wantId,
      });
      setFrugal((s) => ({ ...s, deal: released.frugal.deal, phase: "settled" }));
      setPremium((s) => ({ ...s, deal: released.premium.deal, phase: "settled" }));

      setCycleCount((n) => n + 1);
      await pause(20_000);

      setMonitorState("idle");
      setCountdown(NEXT_CHECK_SEC);
      setDeltaScore(IDLE_DELTA_RANGE[0] + Math.random() * (IDLE_DELTA_RANGE[1] - IDLE_DELTA_RANGE[0]));
      setFrugal(EMPTY_SIDE);
      setPremium(EMPTY_SIDE);
    } catch (err) {
      console.error("[head-to-head cycle]", err);
      setMonitorState("idle");
      setCountdown(NEXT_CHECK_SEC);
    }
  }

  async function runWatchdogCycle() {
    try {
      resetStage();
      // (a) delta rises above threshold visually
      setMonitorState("detected");
      setDeltaScore(TRIGGER_DELTA);
      await pause(1200);

      // (b) POST — Watchdog posts WANT + bids arrive
      setMonitorState("in-cycle");
      const post = await postJson<{ wantId: string }>("/api/market/demo", {
        fixture: "ecommerce",
        phase: "post",
      });
      const wantId = post.wantId;

      // Fetch the WANT + bids for the stage
      const bidsResp = await fetch(`/api/market/bids?wantId=${wantId}`).then((r) => r.json());
      setWant(bidsResp.want);
      setBids(bidsResp.bids ?? []);
      setPhase("warmup");
      await pause(900 + (bidsResp.bids?.length ?? 0) * 200);

      // (c) AWARD — deposit lands
      setPhase("picking");
      const awarded = await postJson<{ deal: Deal }>("/api/market/demo", {
        wantId,
        phase: "award",
      });
      setDeal(awarded.deal);
      // Wait for rationale animation to finish (StreamingRationale calls onRationaleDone)
      await waitFor(() => rationaleDone, 6000);

      // (d) DELIVER — commit hash lands
      setPhase("depositing"); // brief hold on state-pill "deposited"
      await pause(500);
      setPhase("committing");
      const delivered = await postJson<{ deal: Deal; audio: string }>("/api/market/demo", {
        wantId,
        phase: "deliver",
      });
      setDeal(delivered.deal);
      setAudio(delivered.audio);
      await pause(1200); // fingerprint fill-in visible

      // (e) RELEASE — funds move to seller
      setPhase("releasing");
      const released = await postJson<{ deal: Deal }>("/api/market/demo", {
        wantId,
        phase: "release",
      });
      setDeal(released.deal);
      await pause(600);

      // (f) SETTLED — receipt visible, activity feed refreshes
      setPhase("settled");
      setCycleCount((n) => n + 1);
      await pause(20_000);

      // Reset to monitor
      setMonitorState("idle");
      setCountdown(NEXT_CHECK_SEC);
    } catch (e: unknown) {
      console.error("[Market] cycle failed:", e);
      setMonitorState("idle");
      setCountdown(NEXT_CHECK_SEC);
    }
  }

  async function runGraphCycle() {
    try {
      setParentDeal(null);
      setSubDeals([]);
      setGraphAudio(null);
      setMonitorState("detected");
      setDeltaScore(TRIGGER_DELTA);
      await pause(1000);
      setMonitorState("in-cycle");

      const post = await postJson<{ wantId: string }>("/api/market/graph-demo", { phase: "post" });
      const wantId = post.wantId;
      await pause(600);

      const awarded = await postJson<{ parentDeal: Deal }>("/api/market/graph-demo", {
        wantId,
        phase: "award",
      });
      setParentDeal(awarded.parentDeal);
      await pause(1200);

      const delivered = await postJson<{ parentDeal: Deal; subDeals: Deal[]; audio: string }>(
        "/api/market/graph-demo",
        { wantId, phase: "deliver" },
      );
      setParentDeal(delivered.parentDeal);
      setSubDeals(delivered.subDeals);
      setGraphAudio(delivered.audio);
      await pause(1500);

      const released = await postJson<{ parentDeal: Deal; subDeals: Deal[] }>("/api/market/graph-demo", {
        wantId,
        phase: "release",
      });
      setParentDeal(released.parentDeal);
      setSubDeals(released.subDeals);
      setCycleCount((n) => n + 1);

      await pause(30_000);
      setMonitorState("idle");
      setCountdown(NEXT_CHECK_SEC);
    } catch (e: unknown) {
      console.error("[Market] graph cycle failed:", e);
      setMonitorState("idle");
      setCountdown(NEXT_CHECK_SEC);
    }
  }

  // Manual trigger — accelerate the countdown
  function triggerNow() {
    setCountdown(0);
  }

  return (
    <main className="enter-up max-w-6xl mx-auto p-6">
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold">Marketplace of AI Hosts</h1>
          <p className="text-[var(--text-muted)] mt-1">
            Every transaction on this page is a live devnet settlement. No humans in the loop.
          </p>
          <a
            href="https://explorer.solana.com/address/ErwrNVN9DgGvPkHTm1KziXhHjWm6ehE2MUnsauYmfgdK?cluster=devnet"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 mt-2 text-[11px] font-mono text-[var(--success)] bg-[var(--success)]/10 border border-[var(--success)]/30 rounded-full px-2.5 py-1 hover:bg-[var(--success)]/20 transition-colors"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] animate-pulse" />
            Live on devnet · ErwrNVN…sauYmfgdK ↗
          </a>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTrack("watchdog")}
            className={[
              "px-3 py-1.5 rounded text-sm border",
              track === "watchdog"
                ? "bg-[var(--accent)] text-[var(--bg)] border-[var(--accent)]"
                : "bg-[var(--surface)] text-[var(--text)] border-[var(--border)]",
            ].join(" ")}
          >
            Watchdog auction
          </button>
          <button
            onClick={() => setTrack("graph")}
            className={[
              "px-3 py-1.5 rounded text-sm border",
              track === "graph"
                ? "bg-[var(--accent)] text-[var(--bg)] border-[var(--accent)]"
                : "bg-[var(--surface)] text-[var(--text)] border-[var(--border)]",
            ].join(" ")}
          >
            Consumer → Digest graph
          </button>
          <button
            onClick={() => setTrack("head-to-head")}
            className={[
              "px-3 py-1.5 rounded text-sm border",
              track === "head-to-head"
                ? "bg-[var(--accent)] text-[var(--bg)] border-[var(--accent)]"
                : "bg-[var(--surface)] text-[var(--text)] border-[var(--border)]",
            ].join(" ")}
          >
            Head-to-head race
          </button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <WatchdogMonitor
            countdownSec={countdown}
            deltaScore={deltaScore}
            state={monitorState}
            cycleCount={cycleCount}
          />

          {monitorState === "idle" && (
            <div className="text-xs text-[var(--text-muted)]">
              or{" "}
              <button
                onClick={triggerNow}
                className="text-[var(--accent)] underline hover:no-underline"
              >
                trigger the next cycle now
              </button>{" "}
              (dev-only skip)
            </div>
          )}

          {track === "watchdog" && (
            <AuctionStage
              want={want}
              bids={bids}
              deal={deal}
              phase={phase}
              audio={audio}
              onRationaleDone={() => setRationaleDone(true)}
            />
          )}

          {track === "graph" && (
            <>
              <GraphView parentDeal={parentDeal} subDeals={subDeals} />
              {graphAudio && (
                <section className="rounded-lg border-2 border-[var(--success)] bg-[var(--success)]/5 p-4 space-y-2">
                  <div className="text-sm text-[var(--success)] font-semibold">
                    ✓ Digest package settled — combined episode
                  </div>
                  <audio controls autoPlay className="w-full" src={`data:audio/mpeg;base64,${graphAudio}`} />
                </section>
              )}
            </>
          )}

          {track === "head-to-head" && (
            <section className="space-y-3">
              <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
                Two Watchdogs · same schema · different budgets · same instant
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="hover-depth rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">Frugal Fund</span>
                    <span className="text-xs font-mono text-[var(--text-muted)]">budget 0.080 SOL</span>
                  </div>
                  <AuctionStage
                    want={frugal.want}
                    bids={frugal.bids}
                    deal={frugal.deal}
                    phase={frugal.phase}
                    audio={null}
                  />
                </div>
                <div className="hover-depth rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">Premium Fund</span>
                    <span className="text-xs font-mono text-[var(--text-muted)]">budget 0.150 SOL</span>
                  </div>
                  <AuctionStage
                    want={premium.want}
                    bids={premium.bids}
                    deal={premium.deal}
                    phase={premium.phase}
                    audio={null}
                  />
                </div>
              </div>
              {frugal.deal?.state === "released" && premium.deal?.state === "released" && (
                <div className="rounded-lg border-2 border-[var(--success)] bg-[var(--success)]/5 p-4 text-sm">
                  ✓ Race settled — {frugal.deal.personaId === premium.deal.personaId
                    ? `both funds chose ${frugal.deal.personaId}`
                    : `Frugal chose ${frugal.deal.personaId}, Premium chose ${premium.deal.personaId}`} —
                  the market responded to buyer budget in real time.
                </div>
              )}
            </section>
          )}
        </div>

        <ActivityFeed />
      </div>
    </main>
  );
}

function pause(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

async function waitFor(fn: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  return new Promise((resolve) => {
    const iv = setInterval(() => {
      if (fn() || Date.now() - start > timeoutMs) {
        clearInterval(iv);
        resolve();
      }
    }, 50);
  });
}
