"use client";

import { useEffect, useState } from "react";
import { track } from "@/lib/track";

function CopyButton({
  label,
  text,
  channel,
}: {
  label: string;
  text: string;
  channel: "tweet" | "linkedin" | "email" | "link";
}) {
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      track("superteam_share_copy", { channel });
      window.setTimeout(() => setDone(false), 1600);
    } catch {
      /* clipboard may be blocked */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
    >
      {done ? "Copied" : label}
    </button>
  );
}

export function ShareRow({
  tweet,
  linkedin,
  email,
  link,
}: {
  tweet: string;
  linkedin: string;
  email: string;
  link: string;
}) {
  useEffect(() => {
    track("superteam_page_view", {});
  }, []);

  return (
    <div className="flex flex-wrap gap-2">
      <CopyButton label="Copy tweet" text={tweet} channel="tweet" />
      <CopyButton label="Copy LinkedIn" text={linkedin} channel="linkedin" />
      <CopyButton label="Copy email" text={email} channel="email" />
      <CopyButton label="Copy link" text={link} channel="link" />
    </div>
  );
}
