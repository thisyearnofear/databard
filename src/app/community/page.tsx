"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { PixelIcon } from "@/components/dither-kit";
import { MondaySignup } from "@/components/MondaySignup";
import { track } from "@/lib/track";
import { scoreTextClass, scoreTintClass, scoreLabel } from "@/lib/product/score-tone";
import { SAMPLES, parseCsv, verdictFor, type CommunityReport } from "@/lib/community-health";

export default function CommunityPage() {
  const [csv, setCsv] = useState("");
  const [report, setReport] = useState<CommunityReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    track("community_page_view", {});
  }, []);

  const detected = useMemo(() => {
    if (csv.trim().split(/\r?\n/).length < 2) return null;
    try {
      const { header, rows } = parseCsv(csv);
      if (header.length < 1 || rows.length < 1) return null;
      return { rows: rows.length, cols: header.length };
    } catch {
      return null;
    }
  }, [csv]);

  async function runCheck(source: string) {
    if (!csv.trim()) {
      setError("Paste your member list first, or pick a sample.");
      return;
    }
    setBusy(true);
    setError(null);
    setReport(null);
    setCopied(false);
    track("roast_cta_click", { variant: "community", source });
    try {
      const res = await fetch("/api/community/health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? `Check failed (HTTP ${res.status}).`);
      } else {
        setReport(data as CommunityReport);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection lost.");
    } finally {
      setBusy(false);
    }
  }

  function loadText(text: string, source: string) {
    setCsv(text);
    setError(null);
    // score on the next tick so state has settled
    setTimeout(() => void scoreCsv(text, source), 0);
  }

  async function scoreCsv(text: string, source: string) {
    setBusy(true);
    setError(null);
    setReport(null);
    setCopied(false);
    track("roast_cta_click", { variant: "community", source });
    try {
      const res = await fetch("/api/community/health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: text }),
      });
      const data = await res.json();
      if (!res.ok) setError(data?.error ?? `Check failed (HTTP ${res.status}).`);
      else setReport(data as CommunityReport);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection lost.");
    } finally {
      setBusy(false);
    }
  }

  function onFile(f: File | null) {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => loadText(String(reader.result ?? ""), "file");
    reader.readAsText(f);
  }

  async function copyShare() {
    if (!report) return;
    const v = verdictFor(report);
    const text = `Our community's member list scored ${report.score}/100 on DataBard's free health check — "${v.title}". Top fix: ${report.actions[0] ?? "keep it fresh"}. Check yours: https://databard.persidian.com/community`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      track("clip_share", { surface: "community" });
    } catch {
      setError("Couldn't copy — select and copy manually.");
    }
  }

  return (
    <main
      className={`report-surface min-h-screen flex flex-col items-center p-4 sm:p-8 gap-8 max-w-3xl mx-auto enter-up ${dragging ? "outline-dashed outline-2 outline-[var(--accent)]" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        onFile(e.dataTransfer.files?.[0] ?? null);
      }}
    >
      <div className="w-full">
        <Link href="/" className="inline-flex items-center py-1.5 text-sm text-[var(--text-muted)] no-underline hover:text-[var(--text)]">← Back to DataBard</Link>
      </div>

      {/* Hero */}
      <div className="text-center space-y-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--accent)] flex items-center justify-center gap-2">
          <PixelIcon name="user" size={13} /> For community organisers
        </p>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight font-display">
          Is your member list actually usable?
        </h1>
        <p className="text-[var(--text-muted)] max-w-xl mx-auto">
          Every community runs on a spreadsheet — members, RSVPs, sponsors. Drop yours here and get a
          deterministic health score in seconds: duplicates, dead columns, undeliverable emails, staleness.
          No LLM, no account, nothing stored — the list never leaves the check.
        </p>
      </div>

      {/* Input card */}
      <div className={`w-full bg-[var(--surface)] border rounded-xl p-5 flex flex-col gap-3 transition-colors ${dragging ? "border-[var(--accent)]" : "border-[var(--border)]"}`}>
        <textarea
          value={csv}
          onChange={(e) => { setCsv(e.target.value); setError(null); }}
          placeholder={"Paste CSV here, drop a .csv file anywhere on this page, or pick a sample below.\n\nname,email,joined_at\nAmara,amara@example.com,2026-08-14\n..."}
          spellCheck={false}
          rows={7}
          className="w-full font-mono text-xs bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3 text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => runCheck("paste")}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] text-white font-semibold text-sm px-4 py-2.5 disabled:opacity-50 hover:opacity-90"
          >
            <PixelIcon name="check" size={13} /> {busy ? "Scoring ..." : "Score my list"}
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] text-sm px-3 py-2.5 text-[var(--text)] hover:border-[var(--text-muted)]"
          >
            <PixelIcon name="folder" size={13} /> Upload .csv
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
          {detected && (
            <span className="ml-auto font-mono text-[11px] text-[var(--success)]">
              ✓ {detected.rows.toLocaleString("en-US")} rows · {detected.cols} columns detected
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[var(--border)]">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)] mr-1">Or try:</span>
          {SAMPLES.map((s) => (
            <button
              key={s.key}
              onClick={() => loadText(s.csv, `sample_${s.key}`)}
              disabled={busy}
              title={s.blurb}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] text-xs px-3 py-2 text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-50"
            >
              <PixelIcon name="spark" size={11} /> {s.name}
            </button>
          ))}
        </div>

        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      </div>

      {/* Report */}
      {report && <ReportCard report={report} copied={copied} onCopy={copyShare} />}

      {/* Footer CTA */}
      <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <h3 className="text-sm font-semibold flex items-center gap-2"><PixelIcon name="bell" size={13} className="text-[var(--accent)]" /> Make it a habit</h3>
          <p className="text-xs text-[var(--text-muted)] mt-1 mb-3">A community list rots quietly. Get this check every Monday.</p>
          <MondaySignup schema="community-list" source="community" />
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <h3 className="text-sm font-semibold flex items-center gap-2"><PixelIcon name="plug" size={13} className="text-[var(--accent)]" /> For your community bot</h3>
          <p className="text-xs text-[var(--text-muted)] mt-1 mb-3">The same health engine is a free MCP tool your agent can call.</p>
          <Link href="/agents" className="text-sm text-[var(--accent)] no-underline hover:underline">See the agent tools →</Link>
        </div>
      </div>

      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
        Public accounting · measured, never crafted
      </p>
    </main>
  );
}

/** Score number that counts up for the reveal. */
function ScoreCountUp({ target }: { target: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const dur = 900;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return <>{n}</>;
}

function ReportCard({ report, copied, onCopy }: { report: CommunityReport; copied: boolean; onCopy: () => void }) {
  const stateColor = { pass: "text-[var(--success)]", partial: "text-[var(--warning)]", fail: "text-[var(--danger)]" } as const;
  const verdict = verdictFor(report);
  const barColor = { pass: "bg-[var(--success)]", partial: "bg-[var(--warning)]", fail: "bg-[var(--danger)]" } as const;

  return (
    <div className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 flex flex-col gap-5">
      {/* Verdict + score */}
      <div className="flex flex-wrap items-center gap-4">
        <span className={`font-display text-6xl font-extrabold ${scoreTextClass(report.score)}`}>
          <ScoreCountUp target={report.score} />
        </span>
        <div className="min-w-0">
          <span className={`inline-block font-mono text-[10px] uppercase tracking-[0.18em] px-2.5 py-1 rounded ${scoreTintClass(report.score)}`}>
            {scoreLabel(report.score)}
          </span>
          <h2 className="text-lg font-semibold mt-1.5">{verdict.title}</h2>
          <p className="text-sm text-[var(--text-muted)]">{verdict.blurb}</p>
        </div>
        <button
          onClick={onCopy}
          className="ml-auto inline-flex items-center gap-2 rounded-lg border border-[var(--border)] text-sm px-3 py-2 text-[var(--text)] hover:border-[var(--accent)] self-start"
        >
          <PixelIcon name="link" size={13} /> {copied ? "Copied ✓" : "Share result"}
        </button>
      </div>

      <p className="font-mono text-[11px] text-[var(--text-muted)]">{report.rowCount} rows · {report.columnCount} columns</p>

      {/* Checks, revealed one by one */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {report.checks.map((c, i) => (
          <div key={c.id} className="flex items-start gap-2.5 border border-[var(--border)] rounded-lg p-3 animate-fade-in" style={{ animationDelay: `${300 + i * 220}ms`, animationFillMode: "backwards" }}>
            <span className={`mt-0.5 ${stateColor[c.state]}`}><PixelIcon name={c.state === "pass" ? "check" : "warning"} size={14} /></span>
            <div>
              <p className="text-sm font-medium text-[var(--text)]">{c.name}</p>
              <p className="text-xs text-[var(--text-muted)]">{c.detail}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Column completeness */}
      <div>
        <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-2">Column by column</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2.5">
          {report.columns.map((c) => {
            const state = c.completeness >= 90 ? "pass" : c.completeness >= 60 ? "partial" : "fail";
            return (
              <div key={c.name}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-[var(--text)] truncate" title={c.name}>{c.name}</span>
                  <span className="font-mono text-[10px] text-[var(--text-muted)]">{c.completeness}%</span>
                </div>
                <div className="h-1.5 rounded bg-[var(--border)] overflow-hidden mt-1">
                  <div className={`h-full ${barColor[state]} transition-all`} style={{ width: `${Math.max(c.completeness, 3)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {report.findings.length > 0 && (
        <div>
          <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-2">What we found</h3>
          <ul className="space-y-1.5">
            {report.findings.map((f, i) => (
              <li key={i} className="text-sm text-[var(--text-muted)] flex gap-2"><span className="text-[var(--accent)]">·</span>{f}</li>
            ))}
          </ul>
        </div>
      )}

      {report.actions.length > 0 && (
        <div>
          <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-2">Fix it in this order</h3>
          <ol className="space-y-1.5 list-decimal pl-5">
            {report.actions.map((a, i) => (
              <li key={i} className="text-sm text-[var(--text)]">{a}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
