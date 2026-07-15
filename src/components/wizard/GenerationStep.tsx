"use client";

import { useWizard } from "./wizard-context";
import { GenerationProgress } from "@/components/GenerationProgress";

export function GenerationStep() {
  const { state } = useWizard();
  
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-8 gap-6">
      <GenerationProgress 
        isProtocols={state.persona === "web3"}
        currentStep={state.genStep} 
        segmentsComplete={state.genSegments} 
        segmentsTotal={state.genTotal} 
        startedAt={state.genStartedAt} 
        findings={state.genFindings} 
        signal={state.liveSignal}
      />
      {state.status && <p className="text-sm text-[var(--text-muted)]">{state.status}</p>}
    </main>
  );
}
