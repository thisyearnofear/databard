"use client";

import { track } from "@/lib/track";

/** GET search into /earn — the query travels in the URL, never in the event. */
export function EarnReportSearch() {
  return (
    <form
      role="search"
      action="/earn"
      method="get"
      onSubmit={() => track("landing_cta_click", { cta: "find_organization" })}
      className="flex min-w-0 items-stretch gap-2"
    >
      <label htmlFor="report-query" className="sr-only">Organization name</label>
      <input
        type="search"
        id="report-query"
        name="q"
        placeholder="Search organizations"
        className="min-h-11 min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-2 focus:border-[var(--accent)] focus:outline-[var(--accent)]"
      />
      <button
        type="submit"
        className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--bg)] transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      >
        Search
      </button>
    </form>
  );
}
