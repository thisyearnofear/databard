"use client";

import { LeadCapture } from "@/components/LeadCapture";
import { track } from "@/lib/track";

/** One field on the finding — the habit starts before /pro. */
export function MondaySignup({
  schema,
  source = "monday_digest",
}: {
  schema?: string;
  source?: string;
}) {
  const leadSource = schema ? `monday:${schema}` : source;
  return (
    <div>
      <p className="text-xs text-[var(--text-muted)] mb-2">
        Send me this every Monday
      </p>
      <LeadCapture
        source={leadSource}
        prompt=""
        buttonText="Send it →"
        compact
        successMessage="✓ Monday it is. First send goes out next week."
        onSuccess={() => track("monday_signup", { schema: schema ?? "", source: leadSource })}
      />
    </div>
  );
}
