"use client";

import type { WizardStep } from "./wizard-context";

const WIZARD_STEPS: { key: WizardStep; label: string; icon: string }[] = [
  { key: "connect", label: "Connect", icon: "🔌" },
  { key: "pick-schema", label: "Pick a dataset", icon: "📋" },
  { key: "generating", label: "Create episode", icon: "⚡" },
  { key: "episode", label: "Listen / Play", icon: "🎧" },
];

export function StepIndicator({ current, coral = false }: { current: WizardStep; coral?: boolean }) {
  if (current === "landing") return null;
  const steps = coral
    ? [
        { key: "connect" as const, label: "Query & ask", icon: "●" },
        { key: "generating" as const, label: "Generate", icon: "●" },
        { key: "episode" as const, label: "Briefing", icon: "●" },
      ]
    : WIZARD_STEPS;
  const currentIdx = steps.findIndex((s) => s.key === current);
  
  return (
    <nav className="w-full max-w-lg mx-auto mb-6 animate-fade-in" aria-label="Progress">
      <ol className="flex items-center justify-between">
        {steps.map((step, i) => {
          const isComplete = i < currentIdx;
          const isActive = i === currentIdx;
          return (
            <li key={step.key} className="flex-1 flex flex-col items-center relative">
              {i > 0 && (
                <div 
                  className={`absolute top-4 -left-1/2 w-full h-0.5 ${
                    isComplete ? "bg-[var(--accent)]" : "bg-[var(--border)]"
                  }`} 
                />
              )}
              <div
                className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-sm transition ${
                  isComplete 
                    ? "bg-[var(--accent)] text-[var(--bg)]" 
                    : isActive 
                      ? "bg-[var(--accent)] text-[var(--bg)] ring-4 ring-[var(--accent)]/20 scale-110" 
                      : "bg-[var(--surface)] border border-[var(--border)] text-[var(--text-muted)]"
                }`}
              >
                {isComplete ? "✓" : step.icon}
              </div>
              <span className={`text-xs mt-1.5 ${
                isActive ? "text-[var(--text)] font-medium" : "text-[var(--text-muted)]"
              }`}>
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
