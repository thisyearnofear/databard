"use client";

interface Step {
  label: string;
  status: "pending" | "active" | "complete";
  icon: string;
}

export function GenerationProgress({ currentStep }: { currentStep: number }) {
  const steps: Step[] = [
    { label: "Fetching metadata", status: currentStep > 0 ? "complete" : currentStep === 0 ? "active" : "pending", icon: "📊" },
    { label: "Generating script", status: currentStep > 1 ? "complete" : currentStep === 1 ? "active" : "pending", icon: "✍️" },
    { label: "Synthesizing audio", status: currentStep > 2 ? "complete" : currentStep === 2 ? "active" : "pending", icon: "🎵" },
  ];

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
                  step.status === "active" ? "text-[var(--text)] typing-effect" : "text-[var(--text-muted)]"
                }`}
              >
                {step.label}
              </p>
              {step.status === "active" && (
                <div className="mt-2 h-1 bg-[var(--border)] rounded-full overflow-hidden">
                  <div className="h-full bg-[var(--accent)] rounded-full animate-pulse" style={{ width: "60%" }}></div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-[var(--text-muted)] text-center mt-6">
        This usually takes 30-60 seconds depending on schema size
      </p>
    </div>
  );
}
