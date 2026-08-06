"use client";

import { useDataContext } from "@/lib/data-context";

/**
 * DataContextChip — always-visible "whose data am I looking at?" indicator.
 * Demo / Sample data / Connected-to-X are visually distinct so a user can
 * never mistake the demo for their own data (or vice-versa).
 */
export function DataContextChip() {
  const ctx = useDataContext();
  if (!ctx) return null;

  const style = {
    demo: { ring: "border-[#eab308]/40 text-[#eab308]", icon: "🧪" },
    sample: { ring: "border-[var(--border)] text-[var(--text-muted)]", icon: "🐚" },
    connected: { ring: "border-[var(--accent)]/40 text-[var(--accent)]", icon: "🔌" },
  }[ctx.kind];

  return (
    <span
      className={`hidden sm:inline-flex items-center gap-1.5 rounded-lg border ${style.ring} bg-[var(--bg)]/50 px-2.5 py-1.5 text-[11px] font-medium`}
      title={ctx.detail ? `${ctx.label} — ${ctx.detail}` : ctx.label}
    >
      <span aria-hidden>{style.icon}</span>
      <span className="whitespace-nowrap">{ctx.label}</span>
      {ctx.detail && <span className="max-w-[9rem] truncate opacity-70 font-mono">{ctx.detail}</span>}
    </span>
  );
}
