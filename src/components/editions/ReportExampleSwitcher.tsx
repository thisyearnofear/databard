"use client";

import { useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { DitherAvatar } from "@/components/dither-kit";
import { track } from "@/lib/track";
import type { ReportExampleData } from "@/lib/report-examples";
import { ReportLink } from "./ReportLink";
import { DitherDissolve } from "./DitherDissolve";

export function ReportExampleSwitcher({ examples }: { examples: ReportExampleData[] }) {
  const [selected, setSelected] = useState(0);
  const [showEvidence, setShowEvidence] = useState(false);
  const evidenceOpenedFor = useRef(new Set<string>());
  const reduce = useReducedMotion();
  const id = useId();
  const example = examples[selected] ?? examples[0];
  if (!example) return null;

  function selectExample(index: number) {
    if (index === selected) return;
    setSelected(index);
    const next = examples[index];
    if (next) track("landing_cta_click", { cta: "example_switch", example: next.id });
  }

  function toggleEvidence() {
    setShowEvidence((value) => {
      const next = !value;
      if (next && example && !evidenceOpenedFor.current.has(example.id)) {
        evidenceOpenedFor.current.add(example.id);
        track("evidence_open", { surface: "landing_example" });
      }
      return next;
    });
  }

  return (
    <article aria-label="Example report" className="paper-doc l-brackets min-w-0 rounded-2xl p-6 sm:p-10">
      {/* Filing header */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-[var(--paper-line)] pb-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--paper-accent)]">
          DataBard Registry — Earn division
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--paper-muted)]">
          Filing {String(selected + 1).padStart(2, "0")} of {String(examples.length).padStart(2, "0")} · free to read
        </p>
      </div>

      {/* Index of organizations */}
      <div className="mt-6 flex flex-wrap gap-2" aria-label="Choose an example organization">
        {examples.map((item, index) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={selected === index}
            aria-label={`Show ${item.name} report`}
            onClick={() => selectExample(index)}
            className={`min-h-11 rounded-md border px-3.5 text-sm transition-colors ${
              selected === index
                ? "border-[var(--paper-ink)] bg-[var(--paper-ink)] text-[var(--paper)]"
                : "border-[var(--paper-line)] bg-[var(--paper-raised)] text-[var(--paper-muted)] hover:border-[var(--paper-ink)] hover:text-[var(--paper-ink)]"
            }`}
          >
            <span className="mr-2 font-mono text-[10px] opacity-60">{String(index + 1).padStart(2, "0")}</span>
            {item.name.replace("Superteam ", "")}
          </button>
        ))}
      </div>
      <p className="sr-only" role="status">{example.name} report selected</p>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={example.id}
          initial={{ opacity: 0, y: reduce ? 0 : 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduce ? 0 : -8, transition: { duration: reduce ? 0.01 : 0.15, ease: "easeIn" } }}
          transition={{ duration: reduce ? 0.01 : 0.3, ease: "easeOut" }}
          className="mt-8 min-h-[14rem]"
        >
          <div className="flex items-center gap-3">
            <DitherAvatar name={example.name} size={34} animate={false} className="shrink-0 rounded-md" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">{example.name}</p>
              <p className="font-mono text-[11px] text-[var(--paper-muted)]">
                {example.source === "snapshot" ? "Snapshot example" : "Public-data example"}
                {" · "}{new Date(example.observedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}
              </p>
            </div>
          </div>
          <h3 className="mt-6 max-w-[26ch] text-2xl font-bold leading-[1.1] tracking-tight sm:text-3xl">
            {example.headline}
          </h3>
          <p className="mt-4 max-w-[62ch] text-sm leading-relaxed text-[var(--paper-muted)] sm:text-[15px]">
            {example.summary}
          </p>
        </motion.div>
      </AnimatePresence>

      {/* Evidence — the numbers behind the finding */}
      <div className="mt-8 border-t border-[var(--paper-line)] pt-5">
        <button
          type="button"
          aria-expanded={showEvidence}
          aria-controls={`${id}-evidence`}
          onClick={toggleEvidence}
          className="inline-flex min-h-11 items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-[var(--paper-accent)] hover:underline"
        >
          Why this finding? <span aria-hidden="true">{showEvidence ? "−" : "+"}</span>
        </button>
        <div id={`${id}-evidence`} hidden={!showEvidence}>
          <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-[var(--paper-line)] bg-[var(--paper-line)] sm:grid-cols-3">
            {[
              ["Listings", example.listings.toLocaleString("en-US")],
              ["USD rewards", `$${example.usdRewards.toLocaleString("en-US", { maximumFractionDigits: 0 })}`],
              ["Submissions", example.submissions.toLocaleString("en-US")],
            ].map(([label, value]) => (
              <div key={label} className="bg-[var(--paper-raised)] px-5 py-4">
                <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--paper-muted)]">{label}</dt>
                <dd className="mt-2 font-display text-2xl font-bold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 max-w-[64ch] text-xs leading-relaxed text-[var(--paper-muted)]">{example.evidenceNote}</p>
        </div>
      </div>

      {/* Document footer */}
      <div className="mt-6 flex flex-col items-start gap-2 border-t border-[var(--paper-line)] pt-5 sm:flex-row sm:items-center sm:justify-between">
        <ReportLink href={example.href} cta="example" className="inline-flex min-h-11 items-center whitespace-nowrap text-sm font-semibold text-[var(--paper-accent)] hover:underline">
          Read the full report →
        </ReportLink>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--paper-muted)]">
          Filed from public listings · Methods included
        </span>
      </div>
      <DitherDissolve trigger={selected} />
    </article>
  );
}
