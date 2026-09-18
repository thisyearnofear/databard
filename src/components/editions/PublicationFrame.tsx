"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { DitherSeal } from "./DitherSeal";
import { seedFromString } from "@/lib/dither-field";

const STAGES = ["preview", "review", "confirm", "published"] as const;
export type PublicationStage = (typeof STAGES)[number];

export function publicationStage(state: string): PublicationStage {
  if (state === "success") return "published";
  if (["signing", "confirming", "publishing", "pending"].includes(state)) return "confirm";
  if (["idle", "preparing", "review", "error"].includes(state)) return "review";
  return "preview";
}

export function PublicationFrame({ sponsor, stage, children }: { sponsor: string; stage: PublicationStage; children: ReactNode }) {
  const reduce = useReducedMotion();
  const current = STAGES.indexOf(stage);
  return (
    <div className="min-w-0">
      <div className="mb-4 flex items-center gap-3">
        {stage === "published" && (
          <motion.span
            aria-hidden="true"
            initial={{ scale: reduce ? 1 : 1.06, opacity: 0, rotate: reduce ? 0 : -6 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ duration: reduce ? 0 : 0.22, ease: "easeOut" }}
            className="shrink-0"
          >
            <DitherSeal seed={seedFromString(sponsor)} size={44} />
          </motion.span>
        )}
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-muted)]">{sponsor} report</p>
      </div>
      <ol aria-label="Publication progress" className="mb-5 grid grid-cols-4 gap-1 font-mono text-[10px] uppercase tracking-[0.14em]">
        {STAGES.map((step, index) => <li key={step} aria-current={step === stage ? "step" : undefined} className={index <= current ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}><span aria-hidden="true" className={`mb-2 block h-0.5 rounded-full transition-colors ${index <= current ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`} />{step[0].toUpperCase() + step.slice(1)}{index < current && <span className="sr-only"> complete</span>}</li>)}
      </ol>
      <motion.div key={stage} initial={{ opacity: 0.7, y: reduce ? 0 : 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduce ? 0 : 0.2, ease: "easeOut" }}>{children}</motion.div>
    </div>
  );
}
