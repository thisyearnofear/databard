"use client";

import type { WizardStep } from "./wizard-context";

const WIZARD_STEPS: { key: WizardStep; label: string; icon: string }[] = [
  { key: "connect", label: "Connect", icon: "🔌" },
  { key: "pick-schema", label: "Pick a dataset", icon: "📋" },
  { key: "generating", label: "Create episode", icon: "⚡" },
  { key: "episode", label: "Listen / Play", icon: "🎧" },
];

export function StepIndicator({ current }: { current: WizardStep }) {
  if (current === "landing") return null;
  const currentIdx = WIZARD_STEPS.findIndex((s) => s.key === current);
  
  return (
    <nav className="w-full max-w-lg mx-auto mb-6 animate-fade-in" aria-label="Progress">
      <ol className="flex items-center justify-between">
        {WIZARD_STEPS.map((step, i) => {
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
                className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all ${
                  isComplete 
                    ? "bg-[var(--accent)] text-white" 
                    : isActive 
                      ? "bg-[var(--accent)] text-white ring-4 ring-[var(--accent)]/20 scale-110" 
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
