"use client";

import type { ReactNode } from "react";
import { PixelIcon } from "@/components/dither-kit";

/** Collapsible integration guide with an explicit control affordance — a
 *  chevron that rotates on open — so the summary reads as a control, not a heading. */
export function AgentIntegrationDetails({ children }: { children: ReactNode }) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 text-lg font-semibold [&::marker]:hidden [&::-webkit-details-marker]:hidden">
        <span>Connect these tools to your agent</span>
        <PixelIcon
          name="chevronDown"
          size={12}
          aria-hidden
          className="shrink-0 text-[var(--text-muted)] transition-transform group-open:rotate-180"
        />
      </summary>
      {children}
    </details>
  );
}
