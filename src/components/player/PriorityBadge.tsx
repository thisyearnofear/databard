import type { ActionPriority } from "@/lib/schema-analysis";

export function PriorityBadge({ priority }: { priority: ActionPriority }) {
  const styles: Record<ActionPriority, string> = {
    critical: "bg-[var(--danger)]/20 text-[var(--danger)]",
    high: "bg-[var(--warning)]/20 text-[var(--warning)]",
    medium: "bg-[var(--accent-light)]/20 text-[var(--accent-light)]",
    low: "bg-[var(--border)] text-[var(--text-muted)]",
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${styles[priority]}`}>
      {priority}
    </span>
  );
}
