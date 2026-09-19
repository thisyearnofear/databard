"use client";

import Link from "next/link";
import { track } from "@/lib/track";

/** Quiet accent link — the inline conversion path on the Superteam report,
 *  right after the L0 headline stats, ahead of the long evidence sections. */
export function InlineReportCta() {
  return (
    <p className="mt-4">
      <Link
        href="/earn"
        onClick={() => track("landing_cta_click", { cta: "inline_report", surface: "superteam" })}
        className="text-xs font-medium text-[var(--accent)] hover:underline"
      >
        Get a report for your organization →
      </Link>
    </p>
  );
}
