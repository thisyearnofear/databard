"use client";

import { useState } from "react";
import { useWizard } from "./wizard-context";

export function EmailGate() {
  const { state, dispatch } = useWizard();
  const [email, setEmail] = useState(state.leadEmail);
  const [submitting, setSubmitting] = useState(false);
  
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    
    setSubmitting(true);
    try {
      await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), source: "landing" }),
      });
      dispatch({ type: "SET_LEAD_EMAIL", email: email.trim() });
      dispatch({ type: "SET_SHOW_EMAIL_GATE", show: false });
    } finally {
      setSubmitting(false);
    }
  }
  
  if (!state.showEmailGate) return null;
  
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 max-w-md mx-4 shadow-2xl animate-slide-up">
        <div className="text-center mb-4">
          <div className="text-3xl mb-2">🎙️</div>
          <h2 className="text-lg font-semibold">Get early access</h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Leave your email and we&apos;ll notify you when DataBard is ready for your team.
          </p>
        </div>
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            required
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm focus:border-[var(--accent)] focus:outline-none transition-colors"
            autoFocus
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-[var(--accent)] hover:brightness-110 text-[var(--bg)] rounded-lg px-4 py-2.5 text-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition ease-out"
          >
            {submitting ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-[var(--bg)]/30 border-t-[var(--bg)] rounded-full animate-spin" />
                Submitting…
              </>
            ) : (
              "Notify me"
            )}
          </button>
        </form>
        
        <button
          onClick={() => dispatch({ type: "SET_SHOW_EMAIL_GATE", show: false })}
          className="w-full text-center text-xs text-[var(--text-muted)] hover:text-[var(--text)] mt-4 cursor-pointer"
        >
          Continue without signing up
        </button>
      </div>
    </div>
  );
}
