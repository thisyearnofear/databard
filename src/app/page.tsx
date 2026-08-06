"use client";

import { WizardProvider, useWizard, PersonaToggle, LandingStep, ConnectStep, SchemaPicker, GenerationStep, StepIndicator } from "@/components/wizard";
import { AccountMenu } from "@/components/AccountMenu";
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
      // overflow-x-hidden guards against any wide child (spotlight/aurora/stats)
      // pushing the layout wider than the viewport on small screens.
      <main className="min-h-screen flex flex-col items-center p-4 sm:p-8 overflow-x-hidden">
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

// Landing exposes sign-in in the top bar (the global header is hidden on "/").
function LandingAccount() {
  const { state } = useWizard();
  return <AccountMenu workspace={state.persona === "web3" ? "protocols" : "teams"} />;
}

export default function Home() {
  return (
    <WizardProvider>
      <div className="min-h-screen">
        <div className="fixed top-3 inset-x-0 z-40 mx-auto flex w-[min(100%-2rem,44rem)] items-center justify-between gap-2">
          <div className="hidden sm:block w-24 shrink-0" aria-hidden />
          <PersonaToggle />
          <div className="flex shrink-0 justify-end w-24">
            <LandingAccount />
          </div>
        </div>

        {/* Wizard content (renders the onboarding tour past the landing step) */}
        <WizardContent />
      </div>
    </WizardProvider>
  );
}
