"use client";

/**
 * AttestedRunPanel — the recorded, attested mainnet run, shown as the proof
 * beat after (or before) a live free preview. Clearly labelled as a recorded
 * run; every hash links to a public explorer. The DitherSeal ties it to the
 * registry identity.
 */
import { motion, useReducedMotion } from "motion/react";
import { DitherSeal } from "@/components/editions/DitherSeal";
import { seedFromString } from "@/lib/dither-field";
import { ATTESTED_RUN, explorerTxUrl } from "@/lib/probe-showcase";
import { scoreTextClass } from "@/lib/product/score-tone";

export function AttestedRunPanel() {
  const reduce = useReducedMotion();
  const sealSeed = seedFromString(ATTESTED_RUN.attestationTx);
  const ranAt = new Date(ATTESTED_RUN.ranAt);

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.4 }}
      className="mt-12"
      aria-label="Recorded attested run"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-[var(--border)] pb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
        <span>Recorded run · X Layer mainnet</span>
        <span>
          {ranAt.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
            timeZone: "UTC",
          })}
        </span>
      </div>

      <div className="paper-doc relative mt-6 rounded-xl p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">
              One question, five services, one verdict
            </p>
            <h2 className="mt-3 text-xl font-bold leading-snug sm:text-2xl">
              {ATTESTED_RUN.question}
            </h2>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              A paid probe run, recorded live: each service challenged and
              scored, the verdict hash anchored on-chain.
            </p>
          </div>
          <div className="shrink-0 text-center">
            <DitherSeal seed={sealSeed} size={52} />
            <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
              Attested
            </p>
          </div>
        </div>

        {/* The ranked verdict */}
        <ol className="mt-6 divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {ATTESTED_RUN.ranked.map((entry, index) => (
            <motion.li
              key={entry.name}
              initial={reduce ? false : { opacity: 0, x: -8 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: reduce ? 0 : index * 0.08 }}
              className="flex items-center gap-4 py-3"
            >
              <span className="w-6 shrink-0 font-mono text-xs text-[var(--text-muted)]">
                {String(entry.rank).padStart(2, "0")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{entry.name}</span>
                {entry.paymentNote && (
                  <span className="block text-xs text-[var(--text-muted)]">
                    {entry.paymentNote}
                  </span>
                )}
              </span>
              <span
                className={`shrink-0 font-display text-lg font-bold tabular-nums ${
                  entry.score > 0 ? scoreTextClass(entry.score) : "text-[var(--text-muted)]"
                }`}
              >
                {entry.score}
              </span>
            </motion.li>
          ))}
        </ol>

        {/* The money loop, verifiable */}
        <div className="mt-6 grid gap-3 text-xs sm:grid-cols-3">
          <a
            href={explorerTxUrl(ATTESTED_RUN.settlementTx)}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 transition-colors hover:border-[var(--accent)]"
          >
            <span className="font-mono uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Agent paid Probe
            </span>
            <span className="mt-1 block font-semibold text-[var(--text)]">
              {ATTESTED_RUN.priceUsd} · settled ↗
            </span>
          </a>
          <a
            href={explorerTxUrl(ATTESTED_RUN.outboundTx)}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 transition-colors hover:border-[var(--accent)]"
          >
            <span className="font-mono uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Probe paid services
            </span>
            <span className="mt-1 block font-semibold text-[var(--text)]">
              ${ATTESTED_RUN.outboundSpentUsd.toFixed(2)} of ${ATTESTED_RUN.outboundCapUsd.toFixed(2)} cap ↗
            </span>
          </a>
          <a
            href={explorerTxUrl(ATTESTED_RUN.attestationTx)}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 p-3 transition-colors hover:border-[var(--accent)]"
          >
            <span className="font-mono uppercase tracking-[0.14em] text-[var(--accent)]">
              Verdict anchored
            </span>
            <span className="mt-1 block font-semibold text-[var(--text)]">
              Block {ATTESTED_RUN.attestationBlock.toLocaleString("en-GB")} ↗
            </span>
          </a>
        </div>
      </div>
    </motion.section>
  );
}
