"use client";

import { useWizard } from "./wizard-context";

export function PersonaToggle() {
  const { state, dispatch } = useWizard();
  
  return (
    <div className="flex bg-[var(--surface)] p-1 rounded-xl border border-[var(--border)] mb-8 animate-fade-in">
      <button 
        onClick={() => dispatch({ type: "SET_PERSONA", persona: "enterprise" })}
        className={`px-4 py-2 text-xs font-medium rounded-lg transition-all ${
          state.persona === "enterprise" 
            ? "bg-[var(--accent)] text-white shadow-sm" 
            : "text-[var(--text-muted)] hover:text-[var(--text)]"
        }`}
      >
        📊 Data teams
      </button>
      <button 
        onClick={() => dispatch({ type: "SET_PERSONA", persona: "web3" })}
        className={`px-4 py-2 text-xs font-medium rounded-lg transition-all ${
          state.persona === "web3" 
            ? "bg-[var(--accent)] text-white shadow-sm" 
            : "text-[var(--text-muted)] hover:text-[var(--text)]"
        }`}
      >
        ⛓️ Onchain teams
      </button>
    </div>
  );
}
