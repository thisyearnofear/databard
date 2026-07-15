import type { MusicPlan } from "@/lib/types";

export function AnthemTab({ plan }: { plan: MusicPlan }) {
  return (
    <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
      {/* Genre & mood header */}
      <div className="flex items-center gap-3 bg-[var(--bg)] rounded-lg p-3 border border-[var(--border)]">
        <span className="text-2xl">🎵</span>
        <div>
          <p className="text-sm font-semibold">{plan.genre}</p>
          <p className="text-xs text-[var(--text-muted)]">{plan.mood}</p>
        </div>
      </div>

      {/* Global styles */}
      <div>
        <p className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">Style tags</p>
        <div className="flex flex-wrap gap-1.5">
          {plan.positiveGlobalStyles.map((s) => (
            <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20">{s}</span>
          ))}
          {plan.negativeGlobalStyles.map((s) => (
            <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-[var(--border)] text-[var(--text-muted)] line-through">{s}</span>
          ))}
        </div>
      </div>

      {/* Sections / lyrics */}
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Composition</p>
        {plan.sections.map((section) => (
          <div key={section.sectionName} className="bg-[var(--bg)] rounded-lg p-3 border border-[var(--border)]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-[var(--accent)]">{section.sectionName}</span>
              <span className="text-xs text-[var(--text-muted)]">{(section.durationMs / 1000).toFixed(0)}s</span>
            </div>
            <div className="space-y-1">
              {section.lines.map((line, i) => (
                <p key={i} className="text-xs text-[var(--text-muted)] leading-relaxed italic">{line}</p>
              ))}
            </div>
            {section.positiveStyles && section.positiveStyles.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {section.positiveStyles.map((s) => (
                  <span key={s} className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text-muted)]">{s}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-[var(--text-muted)] text-center pt-1">
        This composition plan is sent to ElevenLabs Music API to generate your Data Anthem
      </p>
    </div>
  );
}
