"use client";
import { useState } from "react";

/**
 * LeadCapture — inline email capture form that posts to /api/leads.
 *
 * Designed for high-intent surfaces: shared episodes, verify page, leaderboard
 * claims, landing page footer. Not a modal — it sits in the page flow so it
 * feels like a natural next step, not an interruption.
 *
 * Source is tracked so we know which surface converted the lead.
 */
export function LeadCapture({
  source,
  prompt,
  buttonText = "Get started →",
  compact = false,
}: {
  source: string;
  prompt: string;
  buttonText?: string;
  compact?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus("error");
      return;
    }
    setStatus("loading");
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source }),
      });
      if (res.ok) {
        setStatus("done");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div className={`text-sm text-[var(--success)] ${compact ? "" : "text-center"}`}>
        ✓ Got it — we&apos;ll be in touch within 24 hours.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={compact ? "flex items-center gap-2 flex-wrap" : "flex flex-col items-center gap-3"}>
      {prompt && (
        <p className={`text-sm text-[var(--text)] ${compact ? "mr-1" : "mb-1"}`}>
          {prompt}
        </p>
      )}
      <div className={compact ? "flex items-center gap-2" : "flex items-center gap-2 w-full max-w-sm"}>
        <input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setStatus("idle"); }}
          placeholder="you@protocol.xyz"
          className="flex-1 text-sm px-3 py-2 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
          disabled={status === "loading"}
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="text-sm font-medium px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--bg)] hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0"
        >
          {status === "loading" ? "…" : buttonText}
        </button>
      </div>
      {status === "error" && (
        <span className="text-[10px] text-[var(--danger)]">Please enter a valid email.</span>
      )}
    </form>
  );
}
