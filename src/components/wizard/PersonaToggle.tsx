"use client";

import { useWizard } from "./wizard-context";
import { track } from "@/lib/track";

export function PersonaToggle() {
  const { state, dispatch } = useWizard();

  return (
    <div className="flex bg-[var(--surface)] p-1 rounded-xl border border-[var(--border)] mb-8 animate-fade-in">
      <button
        onClick={() => { track("persona_toggle", { from: state.persona, to: "enterprise" }); dispatch({ type: "SET_PERSONA", persona: "enterprise" }); }}
        className={`px-4 py-2 text-xs font-medium rounded-lg transition ${
          state.persona === "enterprise"
            ? "bg-[var(--accent)] text-[var(--bg)] shadow-sm"
            : "text-[var(--text-muted)] hover:text-[var(--text)]"
        }`}
      >
        📊 Enterprise
      </button>
      <button
        onClick={() => { track("persona_toggle", { from: state.persona, to: "web3" }); dispatch({ type: "SET_PERSONA", persona: "web3" }); }}
        className={`px-4 py-2 text-xs font-medium rounded-lg transition ${
          state.persona === "web3"
            ? "bg-[var(--accent)] text-[var(--bg)] shadow-sm"
            : "text-[var(--text-muted)] hover:text-[var(--text)]"
        }`}
      >
        ⛓️ Onchain
      </button>
    </div>
  );
}
