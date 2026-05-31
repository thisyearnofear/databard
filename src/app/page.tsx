"use client";

import { WizardProvider, useWizard, PersonaToggle, LandingStep, ConnectStep, SchemaPicker, GenerationStep, EpisodeStep } from "@/components/wizard";
import { OnboardingTooltip } from "@/components/OnboardingTooltips";

function WizardContent() {
  const { state } = useWizard();
  
  // Show landing step when on landing page
  if (state.step === "landing") {
    return (
      <main className="min-h-screen flex flex-col items-center p-4 sm:p-8">
        <LandingStep />
      </main>
    );
  }
  
  // Show step indicator for all wizard steps
  // Coral skips "pick-schema" — the query IS the schema
  const isCoral = state.source === "coral";
  const steps = isCoral
    ? [
        { key: "connect", label: "Query & ask", icon: "🪸" },
        { key: "generating", label: "Generate", icon: "⚡" },
        { key: "episode", label: "Listen", icon: "🎧" },
      ]
    : [
        { key: "connect", label: "Connect", icon: "🔌" },
        { key: "pick-schema", label: "Pick dataset", icon: "📋" },
        { key: "generating", label: "Generate", icon: "⚡" },
        { key: "episode", label: "Listen", icon: "🎧" },
      ];

  return (
    <main className="min-h-screen flex flex-col items-center p-4 sm:p-8 gap-6">
      {/* Step indicator */}
      <nav className="w-full max-w-lg mx-auto mb-2" aria-label="Progress">
        <ol className="flex items-center justify-between">
          {steps.map((step, i) => {
            const stepOrder = steps.map((s) => s.key);
            const currentIdx = stepOrder.indexOf(state.step);
            const stepIdx = stepOrder.indexOf(step.key);
            const isComplete = stepIdx < currentIdx;
            const isActive = step.key === state.step;
            return (
              <li key={step.key} className="flex-1 flex flex-col items-center relative">
                {i > 0 && (
                  <div className={`absolute top-4 -left-1/2 w-full h-0.5 ${isComplete ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`} />
                )}
                <div
                  className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all ${
                    isComplete ? "bg-[var(--accent)] text-white" : isActive ? "bg-[var(--accent)] text-white ring-4 ring-[var(--accent)]/20 scale-110" : "bg-[var(--surface)] border border-[var(--border)] text-[var(--text-muted)]"
                  }`}
                >
                  {isComplete ? "✓" : step.icon}
                </div>
                <span className={`text-xs mt-1.5 ${isActive ? "text-[var(--text)] font-medium" : "text-[var(--text-muted)]"}`}>
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>
      </nav>
      
      {/* Step content — pick-schema is skipped for Coral */}
      {state.step === "connect" && <ConnectStep />}
      {!isCoral && state.step === "pick-schema" && <SchemaPicker />}
      {state.step === "generating" && <GenerationStep />}
      {state.step === "episode" && <EpisodeStep />}
    </main>
  );
}

export default function Home() {
  return (
    <WizardProvider>
      <div className="min-h-screen">
        {/* Persona toggle - always visible */}
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-40">
          <PersonaToggle />
        </div>
        
        {/* Wizard content */}
        <WizardContent />
        
        {/* Onboarding tooltips for new users */}
        <OnboardingTooltip />
      </div>
    </WizardProvider>
  );
}
