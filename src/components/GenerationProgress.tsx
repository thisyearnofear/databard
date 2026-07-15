"use client";

import type { LiveBriefingSignal } from "@/components/wizard/wizard-context";

interface Step {
  label: string;
  status: "pending" | "active" | "complete";
  icon: string;
}

interface Props {
  isProtocols?: boolean;
  currentStep: number;
  segmentsComplete?: number;
  segmentsTotal?: number;
  startedAt?: number;
  findings?: string[];
  signal?: LiveBriefingSignal | null;
}

export function GenerationProgress({ isProtocols = false, currentStep, segmentsComplete = 0, segmentsTotal = 0, startedAt, findings = [], signal }: Props) {
  const [primaryFinding, ...supportingFindings] = findings;
  const signalTone = signal?.healthLabel === "critical" ? "var(--danger)" : signal?.healthLabel === "at-risk" ? "var(--warning)" : "var(--success)";
  const steps: Step[] = [
    { label: isProtocols ? "Reading protocol data" : "Reading your data", status: currentStep > 0 ? "complete" : currentStep === 0 ? "active" : "pending", icon: "📊" },
    { label: isProtocols ? "Writing the protocol briefing" : "Preparing the explanation", status: currentStep > 1 ? "complete" : currentStep === 1 ? "active" : "pending", icon: "✍️" },
    { label: isProtocols ? "Recording the briefing" : "Preparing the audio briefing", status: currentStep > 2 ? "complete" : currentStep === 2 ? "active" : "pending", icon: "🎵" },
  ];

  // ETA calculation based on segments synthesized
  let eta = "";
  if (currentStep === 2 && segmentsComplete > 0 && segmentsTotal > 0 && startedAt) {
    const elapsed = (Date.now() - startedAt) / 1000;
    const perSegment = elapsed / segmentsComplete;
    const remaining = Math.round(perSegment * (segmentsTotal - segmentsComplete));
    eta = remaining > 60 ? `~${Math.ceil(remaining / 60)}m remaining` : `~${remaining}s remaining`;
  }

  const progress = segmentsTotal > 0 ? Math.round((segmentsComplete / segmentsTotal) * 100) : 0;

  return (
    <div className="w-full max-w-xl bg-[var(--surface)] border border-[var(--accent)] rounded-xl p-6 animate-slide-up">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--accent)]">{isProtocols ? "Live protocol briefing" : "Initial assessment"}</p>
          <h3 className="mt-1 text-lg font-semibold">{isProtocols ? "Preparing your briefing" : "Reviewing your data"}</h3>
        </div>
        <div className="flex gap-1">
          <div className="w-2 h-2 bg-[var(--accent)] rounded-full animate-ping"></div>
          <div className="w-2 h-2 bg-[var(--accent)] rounded-full animate-ping" style={{ animationDelay: "0.2s" }}></div>
          <div className="w-2 h-2 bg-[var(--accent)] rounded-full animate-ping" style={{ animationDelay: "0.4s" }}></div>
        </div>
      </div>

      <div className="space-y-4">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-4">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center text-xl transition ${
                step.status === "complete"
                  ? "bg-[var(--success)] scale-100"
                  : step.status === "active"
                  ? "bg-[var(--accent)] scale-110 animate-pulse"
                  : "bg-[var(--border)] scale-90 opacity-50"
              }`}
            >
              {step.status === "complete" ? "✓" : step.icon}
            </div>
            <div className="flex-1">
              <p
                className={`text-sm font-medium transition-colors ${
                  step.status === "active" ? "text-[var(--text)]" : "text-[var(--text-muted)]"
                }`}
              >
                {step.label}
              </p>
              {step.status === "active" && i === 2 && segmentsTotal > 0 && (
                <div className="mt-2">
                  <div className="h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--accent)] rounded-full transition-[width] duration-500"
                      style={{ width: `${Math.max(2, progress)}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-xs text-[var(--text-muted)]">{segmentsComplete}/{segmentsTotal} sections</span>
                    {eta && <span className="text-xs text-[var(--text-muted)]">{eta}</span>}
                  </div>
                </div>
              )}
              {step.status === "active" && (i < 2 || segmentsTotal === 0) && (
                <div className="mt-2 h-1 bg-[var(--border)] rounded-full overflow-hidden">
                  <div className="h-full bg-[var(--accent)] rounded-full animate-pulse w-[60%]"></div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {(signal || primaryFinding) && (
        <div className="mt-5 border-y border-[var(--accent)]/30 bg-[var(--accent)]/10 px-4 py-4 animate-slide-up" aria-live="polite">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--accent)]">{isProtocols ? "First protocol signal" : "What needs attention"}</p>
              <p className="mt-2 text-xl font-semibold leading-snug">{signal?.primaryFinding ?? primaryFinding}</p>
            </div>
            {signal && (
              <div className="shrink-0 text-right">
                <div className="text-4xl font-extrabold tabular-nums leading-none" style={{ color: signalTone }}>{signal.healthScore}</div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">health score</div>
              </div>
            )}
          </div>
          {(signal?.supportingFindings ?? supportingFindings).length > 0 && (
            <div className="mt-3 flex flex-col gap-1">
              {(signal?.supportingFindings ?? supportingFindings).map((finding) => (
                <p key={finding} className="text-xs text-[var(--text-muted)]">{finding}</p>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-[var(--text-muted)] text-center mt-6">
        {eta || "This usually takes 30-60 seconds depending on how many tables you have"}
      </p>
    </div>
  );
}
