"use client";

import { useId, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ChapterRaceChart } from "@/components/superteam/ChapterRaceChart";
import { DitherDissolve } from "./DitherDissolve";
import type { ReportEvidenceData } from "@/lib/report-evidence";

const VIEWS = [
  { id: "activity", label: "Listings over time" },
  { id: "rewards", label: "Rewards in context" },
  { id: "method", label: "What is counted?" },
] as const;

export function ReportEvidenceExplorer({ evidence }: { evidence: ReportEvidenceData }) {
  const [view, setView] = useState<(typeof VIEWS)[number]["id"]>("activity");
  const [copy, setCopy] = useState<"idle" | "done" | "fallback">("idle");
  const [interacted, setInteracted] = useState(false);
  const id = useId();
  const reduce = useReducedMotion();
  const receipt = JSON.stringify(evidence.receipt, null, 2);

  async function copyReceipt() {
    try { await navigator.clipboard.writeText(receipt); setCopy("done"); }
    catch { setCopy("fallback"); }
  }

  return (
    <section aria-labelledby={`${id}-title`} className="relative min-w-0">
      <DitherDissolve trigger={view} />
      <h2 id={`${id}-title`} className="text-xl font-bold">Follow the finding</h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">Choose a question to see the evidence behind it.</p>
      <div className="my-5 flex flex-wrap gap-2" aria-label="Evidence views">
        {VIEWS.map((item) => <button key={item.id} type="button" aria-pressed={view === item.id} aria-controls={`${id}-${item.id}`} onClick={() => { setView(item.id); setInteracted(true); }} className={`min-h-11 rounded-lg border px-3 text-sm font-medium transition-colors ${view === item.id ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text)]" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent)]/60"}`}>{item.label}</button>)}
      </div>
      <p className="sr-only" role="status">Showing {VIEWS.find((item) => item.id === view)?.label.toLowerCase()}</p>
      <motion.div key={view} initial={interacted ? { opacity: 0.65, y: reduce ? 0 : 6 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduce ? 0.08 : 0.24 }}>
        <div id={`${id}-activity`} hidden={view !== "activity"}>
          <p className="mb-4 text-sm font-medium">{evidence.listings.toLocaleString("en-US")} listings attributed to {evidence.focusName}</p>
          {view === "activity" && <ChapterRaceChart race={evidence.race} focusName={evidence.focusName} spotlight />}
          <details className="mt-4 rounded-lg border border-[var(--border)] p-4">
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Read the chart as a table</summary>
            <p className="my-3 text-xs leading-relaxed text-[var(--text-muted)]">Cumulative listings by closing month, not announcement date. This timeline only includes listings with usable deadlines.</p>
            <div className="max-h-72 overflow-auto"><table className="w-full text-left text-xs"><caption className="sr-only">Cumulative listings by closing month</caption><thead><tr><th className="p-2">Closing month</th>{evidence.race.keys.map((key) => <th key={key} className="p-2">{key}</th>)}</tr></thead><tbody>{evidence.race.rows.map((row, index) => <tr key={index} className="border-t border-[var(--border)]"><th scope="row" className="p-2 font-normal">{row.t}</th>{evidence.race.keys.map((key) => <td key={key} className="p-2 font-mono tabular-nums">{row[key] ?? "—"}</td>)}</tr>)}</tbody></table></div>
          </details>
        </div>
        <div id={`${id}-rewards`} hidden={view !== "rewards"} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h3 className="text-base font-semibold">USD-denominated rewards among {evidence.isChapter ? "chapters" : "sponsors"}</h3>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">Only stablecoin-denominated listings contribute to these reward totals. Token rewards are not converted into dollars.</p>
          <ol className="mt-5 space-y-2">
            {evidence.comparisons.map((row) => <li key={row.name} className={`flex flex-wrap items-center gap-3 rounded-lg px-3 py-3 text-sm ${row.name === evidence.focusName ? "bg-[var(--accent)]/15 ring-1 ring-inset ring-[var(--accent)]/40" : "border-b border-[var(--border)]"}`}><span className="font-mono text-xs text-[var(--text-muted)]">#{row.rank}</span><span className="min-w-0 flex-1 break-words">{row.name}</span><span className="font-mono tabular-nums">${row.usdRewards.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>{row.name === evidence.focusName && <span className="sr-only">Current organization</span>}</li>)}
          </ol>
          <a href="#evidence-title" className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-[var(--accent)] hover:underline">Explore the full comparison →</a>
        </div>
        <div id={`${id}-method`} hidden={view !== "method"} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h3 className="text-base font-semibold">What these numbers cover</h3>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-[var(--text-muted)]"><li>Listings attributed to the {evidence.focusName} sponsor account. Activity published under a different account is not included.</li><li>Reward totals include stablecoin-denominated listings only. Submission counts come from the source, not a measure of unique people.</li><li>Observed {new Date(evidence.observedAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC · {evidence.source === "snapshot" ? "snapshot data" : "public API data"}.</li></ul>
          <p className="mt-5 text-sm font-semibold">An inspectable receipt, not a truth guarantee.</p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">The unsigned receipt contains hashes of the input and report. Matching original data is needed to check those hashes. It does not authenticate the issuer or prove source accuracy.</p>
          <p className="mt-4 break-all font-mono text-xs text-[var(--text-muted)]">{evidence.receipt.payloadHash}</p>
          <button type="button" onClick={copyReceipt} className="mt-3 min-h-11 text-sm font-medium text-[var(--accent)] hover:underline">{copy === "done" ? "Receipt copied" : "Copy evidence receipt"}</button>
          {copy === "done" && <p role="status" className="sr-only">Evidence receipt copied</p>}
          {copy === "fallback" && <label className="mt-3 block text-xs text-[var(--text-muted)]">Clipboard unavailable. Copy the receipt below.<textarea readOnly value={receipt} className="mt-2 min-h-40 w-full rounded border border-[var(--border)] bg-[var(--bg)] p-3 font-mono text-xs" /></label>}
          <details className="mt-3"><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Inspect receipt JSON</summary><pre className="max-h-64 overflow-auto rounded-lg bg-[var(--bg)] p-3 text-xs">{receipt}</pre></details>
        </div>
      </motion.div>
    </section>
  );
}
