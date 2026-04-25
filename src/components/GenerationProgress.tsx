"use client";

interface Step {
  label: string;
  status: "pending" | "active" | "complete";
  icon: string;
}

interface Props {
  currentStep: number;
  segmentsComplete?: number;
  segmentsTotal?: number;
  startedAt?: number;
  findings?: string[];
}

export function GenerationProgress({ currentStep, segmentsComplete = 0, segmentsTotal = 0, startedAt, findings = [] }: Props) {
  const steps: Step[] = [
    { label: "Fetching metadata", status: currentStep > 0 ? "complete" : currentStep === 0 ? "active" : "pending", icon: "📊" },
    { label: "Generating script", status: currentStep > 1 ? "complete" : currentStep === 1 ? "active" : "pending", icon: "✍️" },
    { label: "Synthesizing audio", status: currentStep > 2 ? "complete" : currentStep === 2 ? "active" : "pending", icon: "🎵" },
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
    <div className="bg-[var(--surface)] border border-[var(--accent)] rounded-xl p-6 animate-slide-up animate-pulse-glow">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold">Generating your podcast...</h3>
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
              className={`w-10 h-10 rounded-full flex items-center justify-center text-xl transition-all ${
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
                className={`text-sm font-medium transition-all ${
                  step.status === "active" ? "text-[var(--text)]" : "text-[var(--text-muted)]"
                }`}
              >
                {step.label}
              </p>
              {step.status === "active" && i === 2 && segmentsTotal > 0 && (
                <div className="mt-2">
                  <div className="h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--accent)] rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(2, progress)}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-xs text-[var(--text-muted)]">{segmentsComplete}/{segmentsTotal} segments</span>
                    {eta && <span className="text-xs text-[var(--text-muted)]">{eta}</span>}
                  </div>
                </div>
              )}
              {step.status === "active" && (i < 2 || segmentsTotal === 0) && (
                <div className="mt-2 h-1 bg-[var(--border)] rounded-full overflow-hidden">
                  <div className="h-full bg-[var(--accent)] rounded-full animate-pulse" style={{ width: "60%" }}></div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {findings.length > 0 && (
        <div className="mt-4 border-t border-[var(--border)] pt-4">
          <p className="text-xs uppercase tracking-wide text-[var(--text-muted)] mb-2">Discoveries</p>
          <div className="flex flex-col gap-1.5">
            {findings.map((f, i) => (
              <p key={i} className="text-xs text-[var(--text-muted)] animate-slide-up" style={{ animationDelay: `${i * 0.15}s` }}>
                {f}
              </p>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-[var(--text-muted)] text-center mt-6">
        {eta || "This usually takes 30-60 seconds depending on schema size"}
      </p>
    </div>
  );
}
