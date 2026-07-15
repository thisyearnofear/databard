"use client";

import { WizardProvider, useWizard, PersonaToggle, LandingStep, ConnectStep, SchemaPicker, GenerationStep, StepIndicator } from "@/components/wizard";
import { OnboardingTooltip } from "@/components/OnboardingTooltips";
import dynamic from "next/dynamic";

const EpisodeStep = dynamic(
  () => import("@/components/wizard/EpisodeStep").then((module) => ({ default: module.EpisodeStep })),
  { ssr: false, loading: () => <div className="min-h-[12rem]" /> },
);

function WizardContent() {
  const { state } = useWizard();
  
  // Show landing step when on landing page — no onboarding overlay here so it
  // never covers the hero or a demo
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

  return (
    <main className="min-h-screen flex flex-col items-center p-4 sm:p-8 gap-6">
      <StepIndicator current={state.step} coral={isCoral} />
      
      {/* Step content — pick-schema is skipped for Coral */}
      {state.step === "connect" && <ConnectStep />}
      {!isCoral && state.step === "pick-schema" && <SchemaPicker />}
      {state.step === "generating" && <GenerationStep />}
      {state.step === "episode" && <EpisodeStep />}

      {/* Onboarding tour — only once the user is past the landing step */}
      <OnboardingTooltip />
    </main>
  );
}

export default function Home() {
  return (
    <WizardProvider>
      <div className="min-h-screen">
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-40 w-full max-w-lg px-4 flex justify-center">
          <PersonaToggle />
        </div>

        {/* Wizard content (renders the onboarding tour past the landing step) */}
        <WizardContent />
      </div>
    </WizardProvider>
  );
}
