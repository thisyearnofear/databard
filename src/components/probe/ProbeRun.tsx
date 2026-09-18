"use client";

/**
 * ProbeRun — the live run theatre.
 *
 * Every state on screen is driven by the NDJSON stream from
 * POST /api/probe/preview {stream:true}: candidates appear when the server
 * names them ("start"), stage labels advance only when the runner reports a
 * real lifecycle event ("stage"), and cards flip to their score when the
 * actual probe completes ("result"). Nothing is simulated: no fake progress
 * bars, no invented payment states. The free preview never pays, so "paying"
 * can never appear here — the stage vocabulary is honest by construction.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ResultCard, type ProbeResultCardProps } from "./ResultCard";

type StageKey = "checking" | "calling" | "challenged" | "paying" | "measuring";

const STAGE_LABEL: Record<StageKey, string> = {
  checking: "Checking the endpoint",
  calling: "Calling the service",
  challenged: "402 — payment required",
  paying: "Paying via x402",
  measuring: "Measuring the response",
};

interface CandidateSeed {
  name: string;
  endpoint: string;
  knownPriceUsd: number | null;
}

interface LiveCandidate extends CandidateSeed {
  stage: StageKey | null;
  scored: ProbeResultCardProps | null;
}

export interface ProbeRunDone {
  summary: string;
  generatedAt: string;
  cost: {
    priceUsd: string;
    outboundSpentUsd: number;
    outboundCapUsd: number;
    cachedCount: number;
    paidCount: number;
  };
  ranked: ProbeResultCardProps[];
}

interface ProbeRunProps {
  question: string;
  /** Increment to start a new run. */
  runId: number;
  onDone: (payload: ProbeRunDone | null, error: string | null) => void;
}

export function ProbeRun({ question, runId, onDone }: ProbeRunProps) {
  const [candidates, setCandidates] = useState<LiveCandidate[]>([]);
  const [completed, setCompleted] = useState(0);
  const [challenges, setChallenges] = useState(0);
  const [finished, setFinished] = useState(false);
  const reduce = useReducedMotion();
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const startRun = useCallback(
    async (signal: AbortSignal) => {
      setCandidates([]);
      setCompleted(0);
      setChallenges(0);
      setFinished(false);
      try {
        const response = await fetch("/api/probe/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stream: true,
            ...(question.trim() ? { question: question.trim() } : {}),
          }),
          signal,
        });
        if (!response.ok || !response.body) {
          const data = await response.json().catch(() => null);
          throw new Error(
            response.status === 429
              ? "The free preview is rate-limited. Please try again later."
              : data?.error ?? "The service check could not be completed."
          );
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let newline = buffer.indexOf("\n");
          while (newline !== -1) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            if (line) {
              const event = JSON.parse(line);
              if (event.type === "start") {
                setCandidates(
                  (event.candidates as CandidateSeed[]).map((c) => ({
                    ...c,
                    stage: null,
                    scored: null,
                  }))
                );
              } else if (event.type === "stage") {
                const endpoint = event.endpoint as string;
                const stage = event.stage as StageKey;
                setCandidates((prev) =>
                  prev.map((c) =>
                    c.endpoint === endpoint && !c.scored ? { ...c, stage } : c
                  )
                );
                if (stage === "challenged") setChallenges((n) => n + 1);
              } else if (event.type === "result") {
                const entry = event.candidate;
                const scored: ProbeResultCardProps = {
                  name: entry.name,
                  endpoint: entry.endpoint,
                  score: entry.score.total,
                  label: entry.score.label,
                  breakdown: entry.score.breakdown,
                  flags: entry.score.flags,
                  reachable: entry.reachable,
                  payment: entry.payment,
                  fromCache: entry.fromCache,
                };
                setCandidates((prev) =>
                  prev.map((c) =>
                    c.endpoint === scored.endpoint ? { ...c, scored } : c
                  )
                );
                setCompleted((n) => n + 1);
              } else if (event.type === "done") {
                setFinished(true);
                onDoneRef.current(event as unknown as ProbeRunDone, null);
              } else if (event.type === "error") {
                onDoneRef.current(null, event.error ?? "The service check could not be completed.");
              }
            }
            newline = buffer.indexOf("\n");
          }
        }
      } catch (failure) {
        if (signal.aborted) return;
        onDoneRef.current(
          null,
          failure instanceof Error
            ? failure.message
            : "The service check could not be completed."
        );
      }
    },
    [question]
  );

  useEffect(() => {
    if (runId === 0) return;
    const controller = new AbortController();
    void startRun(controller.signal);
    return () => controller.abort();
  }, [runId, startRun]);

  if (runId === 0) return null;

  const total = candidates.length;
  const running = !finished && total > 0;

  return (
    <section className="mt-10 space-y-5" aria-label="Live service check">
      {/* Live status strip — every number comes from a streamed event */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4 font-mono text-xs text-[var(--text-muted)]">
        <span className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${finished ? "bg-[var(--success)]" : "bg-[var(--accent)] motion-safe:animate-pulse"}`}
            aria-hidden="true"
          />
          {finished ? "Run complete" : total === 0 ? "Contacting services…" : "Run in progress"}
        </span>
        {total > 0 && (
          <>
            <span>
              {completed}/{total} scored
            </span>
            <span>{challenges} payment {challenges === 1 ? "challenge" : "challenges"}</span>
            <span>$0.00 outbound · free preview</span>
          </>
        )}
      </div>

      {/* Candidate grid — cards land at "start", flip as real results stream in */}
      <div className="grid gap-4 sm:grid-cols-2">
        {candidates.map((candidate, index) => (
          <motion.div
            key={candidate.endpoint}
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: reduce ? 0 : index * 0.06 }}
          >
            {candidate.scored ? (
              <ResultCard {...candidate.scored} />
            ) : (
              <PendingCard candidate={candidate} running={running} />
            )}
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function PendingCard({
  candidate,
  running,
}: {
  candidate: LiveCandidate;
  running: boolean;
}) {
  return (
    <div
      className="flex h-full flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{candidate.name}</h3>
          <p className="max-w-[220px] truncate font-mono text-[11px] text-[var(--text-muted)]">
            {candidate.endpoint}
          </p>
        </div>
        <span
          className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
            running ? "bg-[var(--accent)] motion-safe:animate-pulse" : "bg-[var(--border)]"
          }`}
          aria-hidden="true"
        />
      </div>
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
        {candidate.stage ? STAGE_LABEL[candidate.stage] : "Queued"}
      </p>
      {/* Indeterminate shimmer bar — deliberately not a fake percentage */}
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
        {running && (
          <div className="probe-pending-bar h-full w-1/3 rounded-full bg-[var(--accent)]/60" />
        )}
      </div>
      {candidate.knownPriceUsd != null && candidate.knownPriceUsd > 0 && (
        <p className="text-[11px] text-[var(--text-muted)]">
          Lists a paid endpoint · ${candidate.knownPriceUsd}/call
        </p>
      )}
    </div>
  );
}
