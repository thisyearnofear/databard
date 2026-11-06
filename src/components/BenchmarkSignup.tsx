"use client";

import { useState } from "react";
import { LeadCapture } from "@/components/LeadCapture";
import { track } from "@/lib/track";

const CATEGORIES = [
  "DTC skincare",
  "fashion & apparel",
  "food & beverage",
  "supplements",
  "home goods",
  "SaaS",
] as const;

/** Weekly micro-verdict signup — "one metric vs your category, every Monday". */
export function BenchmarkSignup() {
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  return (
    <div>
      <p className="text-xs text-[var(--text-muted)] mb-2">One metric vs your category, every Monday</p>
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="mb-2 w-full bg-[var(--surface)] border border-[var(--border)] rounded-md px-2.5 py-2 text-sm text-[var(--text)]"
        aria-label="Your category"
      >
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <LeadCapture
        source={`monday:benchmark:${category}`}
        prompt=""
        buttonText="Send it →"
        compact
        successMessage="✓ First benchmark lands Monday."
        onSuccess={() => track("monday_signup", { schema: category, source: `monday:benchmark:${category}` })}
      />
    </div>
  );
}
