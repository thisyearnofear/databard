import type { ActionPriority } from "@/lib/schema-analysis";

export function PriorityBadge({ priority }: { priority: ActionPriority }) {
  const styles: Record<ActionPriority, string> = {
    critical: "bg-[var(--danger)]/20 text-[var(--danger)]",
    high: "bg-yellow-500/20 text-yellow-400",
    medium: "bg-blue-500/20 text-blue-400",
    low: "bg-[var(--border)] text-[var(--text-muted)]",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${styles[priority]}`}>
      {priority}
    </span>
  );
}
