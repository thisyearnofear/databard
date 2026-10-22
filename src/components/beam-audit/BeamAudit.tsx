"use client";

import { useEffect, useRef, useState } from "react";
import { PixelIcon } from "@/components/dither-kit/icon";
import { scoreTextClass, scoreTintClass, scoreLabel } from "@/lib/product/score-tone";
import type { SchemaInsights } from "@/lib/schema-analysis";
import type { ScriptSegment, SchemaMeta } from "@/lib/types";

type Source = "web3" | "ecommerce" | "custom";
type Format = "podcast" | "executive-summary";
type StageState = "pending" | "active" | "done";

interface Stats {
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  } | null;
  elapsedMs: number;
  cached: boolean;
  reasoningChars: number;
}

const FIXTURE_AUDIO: Record<Exclude<Source, "custom">, string> = {
  web3: "/demo-episode-dune.mp3",
  ecommerce: "/demo-episode.mp3",
};

const EXAMPLE_DDL = `CREATE TABLE customers (
  id BIGINT PRIMARY KEY,
  email VARCHAR(255),
  full_name VARCHAR(120),
  phone VARCHAR(32),
  created_at TIMESTAMP
);

CREATE TABLE orders (
  id BIGINT PRIMARY KEY,
  customer_id BIGINT,
  total NUMERIC(12,2),
  status VARCHAR(32),
  placed_at TIMESTAMP
);

CREATE TABLE shipments (
  id BIGINT PRIMARY KEY,
  order_id BIGINT,
  carrier VARCHAR(64),
  delivered_at TIMESTAMP
);`;

export function BeamAudit() {
  const [source, setSource] = useState<Source>("web3");
  const [ddl, setDdl] = useState("");
  const [question, setQuestion] = useState("");
  const [format, setFormat] = useState<Format>("podcast");

  const [running, setRunning] = useState(false);
  const [stages, setStages] = useState<Record<"parse" | "score" | "narrate", StageState>>({
    parse: "pending", score: "pending", narrate: "pending",
  });
  const [thoughts, setThoughts] = useState("");
  const [contentPreview, setContentPreview] = useState("");
  const [schema, setSchema] = useState<SchemaMeta | null>(null);
  const [insights, setInsights] = useState<{ i: SchemaInsights; name: string; tables: number } | null>(null);
  const [segments, setSegments] = useState<ScriptSegment[] | null>(null);
  const [shapeFailure, setShapeFailure] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [notice, setNotice] = useState<{ kind: "error" | "quota"; message: string } | null>(null);

  const thoughtsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    thoughtsRef.current?.scrollTo({ top: thoughtsRef.current.scrollHeight });
  }, [thoughts]);

  function reset() {
    setStages({ parse: "pending", score: "pending", narrate: "pending" });
    setThoughts(""); setContentPreview(""); setSchema(null); setInsights(null);
    setSegments(null); setShapeFailure(null); setStats(null); setNotice(null);
  }

  async function run() {
    if (running) return;
    reset();
    setRunning(true);
    try {
      const res = await fetch("/api/labs/beam-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, ddl, question, format }),
      });
      if (!res.ok || !res.body) {
        setNotice({ kind: "error", message: `Request failed (HTTP ${res.status}).` });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          try {
            handleEvent(JSON.parse(line.slice(5)));
          } catch { /* skip */ }
        }
      }
    } catch (e) {
      setNotice({ kind: "error", message: e instanceof Error ? e.message : "Connection lost." });
    } finally {
      setRunning(false);
    }
  }

  function handleEvent(ev: Record<string, unknown>) {
    switch (ev.type) {
      case "stage":
        setStages((s) => ({ ...s, [ev.stage as "parse"]: ev.state === "start" ? "active" : "done" }));
        break;
      case "reasoning":
        setThoughts((t) => (t + (ev.delta as string)).slice(-6000));
        break;
      case "content":
        setContentPreview((c) => (c + (ev.delta as string)).slice(-4000));
        break;
      case "schema":
        setSchema(ev.schema as SchemaMeta);
        break;
      case "insights":
        setInsights({ i: ev.insights as SchemaInsights, name: ev.schemaName as string, tables: ev.tableCount as number });
        break;
      case "segments":
        setSegments(ev.segments as ScriptSegment[]);
        setContentPreview("");
        break;
      case "shapeFailure":
        setShapeFailure(ev.raw as string);
        setContentPreview("");
        break;
      case "stats":
        setStats(ev as unknown as Stats);
        break;
      case "quota":
        setNotice({ kind: "quota", message: ev.message as string });
        break;
      case "error":
        setNotice({ kind: "error", message: ev.message as string });
        break;
    }
  }

  const stageUi = (["parse", "score", "narrate"] as const).map((s, i) => ({
    key: s,
    label: ["Parse schema", "Score health", "Narrate findings"][i],
    state: stages[s],
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-6">
      {/* ── Inputs ── */}
      <div className="flex flex-col gap-4">
        <div className="border border-[var(--border)] rounded-xl bg-[var(--surface)] p-4 flex flex-col gap-3">
          <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Dataset</label>
          <div className="flex flex-col gap-2">
            <FixtureButton active={source === "web3"} onClick={() => setSource("web3")}
              title="Uniswap V3 subgraph" sub="6 tables · featured audio briefing" />
            <FixtureButton active={source === "ecommerce"} onClick={() => setSource("ecommerce")}
              title="Acme e-commerce warehouse" sub="6 tables · featured audio briefing" />
            <FixtureButton active={source === "custom"} onClick={() => setSource("custom")}
              title="Your own DDL" sub="Beam parses it — no SQL parser in sight" />
          </div>

          {source === "custom" && (
            <>
              <textarea
                value={ddl}
                onChange={(e) => setDdl(e.target.value)}
                placeholder={EXAMPLE_DDL}
                spellCheck={false}
                rows={10}
                className="w-full font-mono text-xs bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3 text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
              />
              <button
                onClick={() => setDdl(EXAMPLE_DDL)}
                className="self-start font-mono text-[11px] text-[var(--accent)] hover:underline"
              >
                load a 3-table example
              </button>
            </>
          )}

          <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mt-1">
            Optional research question
          </label>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. Where are the governance gaps?"
            className="w-full text-sm bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
          />

          <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Output format</label>
          <div className="flex gap-2">
            <FormatChip active={format === "podcast"} onClick={() => setFormat("podcast")}>Podcast · 12–25 segments</FormatChip>
            <FormatChip active={format === "executive-summary"} onClick={() => setFormat("executive-summary")}>Executive · 5–8</FormatChip>
          </div>

          <button
            onClick={run}
            disabled={running}
            className="mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--accent)] text-white font-semibold text-sm px-4 py-3 disabled:opacity-50 hover:opacity-90"
          >
            <PixelIcon name="spark" size={14} />
            {running ? "Beam is working ..." : "Run the audit"}
          </button>
          <p className="font-mono text-[10px] text-[var(--text-muted)] leading-relaxed">
            Free tier: 280 generations/day shared, 8 per visitor, resets 00:00 UTC.
            Featured runs cache — replays are instant and spend nothing.
          </p>
        </div>
      </div>

      {/* ── Output ── */}
      <div className="flex flex-col gap-4 min-w-0">
        {/* Stage tracker */}
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
          {stageUi.map((s, i) => (
            <span key={s.key} className="flex items-center gap-2">
              {i > 0 && <span className="text-[var(--text-muted)]">→</span>}
              <span className={
                s.state === "done" ? "text-[var(--text)]" :
                s.state === "active" ? "text-[var(--accent)]" : "text-[var(--text-muted)]"
              }>
                {s.state === "done" ? "✓" : s.state === "active" ? "▸" : "·"} {i + 1} {s.label}
              </span>
            </span>
          ))}
        </div>

        {notice && (
          <div className={`border rounded-xl p-4 text-sm ${notice.kind === "quota"
            ? "border-dashed border-[var(--border)] text-[var(--text-muted)]"
            : "border-[var(--danger)] text-[var(--danger)]"}`}>
            {notice.message}{" "}
            {notice.kind === "quota" && (
              <>The frozen artifacts stay up: <a className="underline" href="/benchmarks/beam">benchmark</a> ·{" "}
              <a className="underline" href="https://huggingface.co/datasets/Papajams/agent-service-quality" target="_blank" rel="noopener noreferrer">dataset</a>.</>
            )}
          </div>
        )}

        {/* Beam's thoughts */}
        {(thoughts || running) && (
          <details open className="border border-[var(--border)] rounded-xl bg-[var(--surface)]">
            <summary className="cursor-pointer px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] flex items-center gap-2">
              <PixelIcon name="search" size={12} /> Beam&apos;s thoughts — raw reasoning stream
              {stats?.usage?.completion_tokens_details?.reasoning_tokens != null && (
                <span className="ml-auto normal-case tracking-normal">
                  {stats.usage.completion_tokens_details.reasoning_tokens.toLocaleString("en-US")} reasoning tokens
                </span>
              )}
            </summary>
            <div ref={thoughtsRef} className="px-4 pb-3 max-h-52 overflow-y-auto font-mono text-[11px] leading-relaxed text-[var(--text-muted)] whitespace-pre-wrap">
              {thoughts || "..."}
            </div>
          </details>
        )}

        {/* Score panel */}
        {insights && <ScorePanel insights={insights.i} name={insights.name} tables={insights.tables} />}

        {/* Schema accordion */}
        {schema && (
          <details className="border border-[var(--border)] rounded-xl bg-[var(--surface)]">
            <summary className="cursor-pointer px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Extracted schema · {schema.tables.length} tables
            </summary>
            <pre className="px-4 pb-3 overflow-x-auto font-mono text-[11px] text-[var(--text-muted)] max-h-72 overflow-y-auto">
              {JSON.stringify(schema, null, 1).slice(0, 6000)}
            </pre>
          </details>
        )}

        {/* Transcript / live content / shape failure */}
        {segments && (
          <div className="flex flex-col gap-2.5">
            {segments.map((s, i) => (
              <TranscriptBubble key={i} seg={s} />
            ))}
          </div>
        )}
        {shapeFailure && (
          <div className="border border-[var(--warn)] rounded-xl p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--warn)] flex items-center gap-2">
              <PixelIcon name="warning" size={12} /> Shape failure — the famous one
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-2">
              Beam answered twice, but not as the required JSON array. In production the pipeline rejects this and falls
              back to templates. The benchmark saw exactly this pattern on executive-summary runs — now you&apos;ve met it live.
            </p>
            <pre className="mt-2 font-mono text-[11px] text-[var(--text-muted)] whitespace-pre-wrap max-h-40 overflow-y-auto">{shapeFailure}</pre>
          </div>
        )}
        {!segments && contentPreview && (
          <pre className="border border-[var(--border)] rounded-xl p-4 font-mono text-[11px] text-[var(--text-muted)] whitespace-pre-wrap max-h-56 overflow-y-auto">
            {contentPreview}
          </pre>
        )}

        {/* Featured audio */}
        {segments && source !== "custom" && (
          <div className="border border-[var(--border)] rounded-xl bg-[var(--surface)] p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-2 flex items-center gap-2">
              <PixelIcon name="mic" size={12} /> Featured audio briefing — this dataset, pre-recorded
            </p>
            <audio controls src={FIXTURE_AUDIO[source]} className="w-full" preload="none" />
          </div>
        )}

        {/* Stats */}
        {stats && (
          <p className="font-mono text-[11px] text-[var(--text-muted)] leading-relaxed">
            {stats.cached ? "served from cache — zero new tokens" : stats.usage
              ? `${stats.usage.prompt_tokens.toLocaleString("en-US")} prompt / ${stats.usage.completion_tokens.toLocaleString("en-US")} completion tokens`
              : ""}
            {!stats.cached && stats.usage?.completion_tokens_details?.reasoning_tokens != null && stats.usage.completion_tokens > 0 && (
              <> · {Math.round((100 * stats.usage.completion_tokens_details.reasoning_tokens) / stats.usage.completion_tokens)}% reasoning</>
            )}
            {" · "}{(stats.elapsedMs / 1000).toFixed(1)}s
            {" · "}
            <a href="/benchmarks/beam" className="text-[var(--accent)] hover:underline">benchmark</a>{" · "}
            <a href="https://huggingface.co/datasets/Papajams/agent-service-quality" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">dataset</a>
          </p>
        )}
      </div>
    </div>
  );
}

function FixtureButton({ active, onClick, title, sub }: { active: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${active
        ? "border-[var(--accent)] bg-[var(--accent)]/10"
        : "border-[var(--border)] hover:border-[var(--text-muted)]"}`}
    >
      <span className="block text-sm font-medium text-[var(--text)]">{title}</span>
      <span className="block font-mono text-[10px] text-[var(--text-muted)] mt-0.5">{sub}</span>
    </button>
  );
}

function FormatChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`font-mono text-[11px] px-3 py-1.5 rounded-full border transition-colors ${active
        ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10"
        : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-muted)]"}`}
    >
      {children}
    </button>
  );
}

function ScorePanel({ insights, name, tables }: { insights: SchemaInsights; name: string; tables: number }) {
  const findings: string[] = [];
  if (insights.failingTests > 0) findings.push(`${insights.failingTests} failing quality tests`);
  if (insights.untestedTables.length > 0) findings.push(`${insights.untestedTables.length} tables with zero tests (${insights.testCoverage}% coverage)`);
  if (insights.undocumentedTables.length > 0) findings.push(`${insights.undocumentedTables.length} undocumented tables`);
  if (insights.piiTables.length > 0) findings.push(`${insights.piiTables.reduce((n, p) => n + p.columns.length, 0)} PII columns in ${insights.piiTables.length} tables`);
  if (insights.ownerlessTables.length > 0) findings.push(`${insights.ownerlessTables.length} tables have no owner`);
  if (findings.length === 0) findings.push("no structural defects detected");

  return (
    <div className="border border-[var(--border)] rounded-xl bg-[var(--surface)] p-5">
      <div className="flex flex-wrap items-baseline gap-3">
        <span className={`font-display text-5xl font-extrabold ${scoreTextClass(insights.healthScore)}`}>{insights.healthScore}</span>
        <span className="text-[var(--text-muted)] text-sm">/100</span>
        <span className={`font-mono text-[10px] uppercase tracking-[0.18em] px-2.5 py-1 rounded ${scoreTintClass(insights.healthScore)}`}>
          {scoreLabel(insights.healthScore)}
        </span>
      </div>
      <p className="text-xs text-[var(--text-muted)] mt-1">
        {name} · {tables} tables · deterministic production rubric — no LLM in the scoring
      </p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-4">
        <CoverageBar label="Test coverage" value={insights.testCoverage} />
        <CoverageBar label="Doc coverage" value={insights.docCoverage} />
      </div>
      <ul className="mt-3 space-y-1">
        {findings.map((f) => (
          <li key={f} className="text-xs text-[var(--text-muted)] flex items-start gap-2">
            <span className={`mt-1 inline-block w-1.5 h-1.5 shrink-0 ${scoreTextClass(insights.healthScore).replace("text-", "bg-")}`} />
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CoverageBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--text-muted)]">
        <span>{label}</span><span>{value}%</span>
      </div>
      <div className="h-1.5 rounded bg-[var(--border)] mt-1 overflow-hidden">
        <div
          className={`h-full ${value >= 80 ? "bg-[var(--success)]" : value >= 50 ? "bg-[var(--warning)]" : "bg-[var(--danger)]"}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function TranscriptBubble({ seg }: { seg: ScriptSegment }) {
  const alex = seg.speaker === "Alex";
  return (
    <div className={`flex flex-col max-w-full ${alex ? "items-start" : "items-end"}`}>
      <span className={`font-mono text-[10px] uppercase tracking-[0.15em] mb-1 ${alex ? "text-[var(--accent)]" : "text-[var(--warning)]"}`}>
        {seg.speaker}{seg.topic && seg.topic !== "discussion" ? ` · ${seg.topic}` : ""}
      </span>
      <div className={`rounded-xl border px-4 py-2.5 text-sm leading-relaxed max-w-[92%] ${alex
        ? "bg-[var(--surface)] border-[var(--border)] text-[var(--text)]"
        : "bg-[var(--warning)]/10 border-[var(--warning)]/30 text-[var(--text)]"}`}>
        {seg.text}
      </div>
    </div>
  );
}
