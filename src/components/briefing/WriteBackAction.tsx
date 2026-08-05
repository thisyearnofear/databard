"use client";

import { useEffect, useState } from "react";

interface WriteBackResult {
  tablesTouched: number;
  tagsApplied: number;
  descriptionsUpdated: number;
  errors: number;
}

/**
 * Dashboard "Contribute back to DataHub" control. Only renders when the
 * current session is connected to DataHub; writes DataBard's findings (health +
 * defect tags, AI summary description) back into the context graph.
 */
export function WriteBackAction() {
  const [source, setSource] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/actions/connection")
      .then((r) => r.json())
      .then((d) => setSource(d.ok ? d.source : null))
      .catch(() => setSource(null));
  }, []);

  if (source !== "datahub") return null;

  async function writeBack() {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/actions/writeback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.ok) {
        const w = data.written as WriteBackResult;
        setStatus({
          kind: "ok",
          text: `Wrote ${w.tagsApplied} tags · ${w.descriptionsUpdated} descriptions across ${w.tablesTouched} tables → DataHub${w.errors ? ` (${w.errors} errors)` : ""}`,
        });
      } else {
        setStatus({ kind: "err", text: data.error || "Write-back failed" });
      }
    } catch (e) {
      setStatus({ kind: "err", text: e instanceof Error ? e.message : "Write-back failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-6 rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold">Contribute back to DataHub</p>
          <p className="text-xs text-[var(--text-muted)]">
            Write DataBard&apos;s findings — health + defect tags, AI summary — back into the DataHub context graph.
          </p>
        </div>
        <button
          type="button"
          onClick={writeBack}
          disabled={busy}
          className="shrink-0 bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--bg)] transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? "Writing…" : "Write back →"}
        </button>
      </div>
      {status && (
        <p className={`mt-2 text-xs ${status.kind === "ok" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
          {status.text}
        </p>
      )}
    </section>
  );
}
