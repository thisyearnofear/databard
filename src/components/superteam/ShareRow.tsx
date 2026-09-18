"use client";

import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/track";

function CopyButton({
  label,
  text,
  channel,
  source,
  slug,
  published,
}: {
  label: string;
  text: string;
  channel: "tweet" | "linkedin" | "email" | "link" | "receipt";
  source: "superteam" | "edition";
  slug?: string;
  published: boolean;
}) {
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      if (source === "edition") {
        track("edition_share_copy", {
          channel,
          slug: slug ?? "",
          state: published ? "published" : "preview",
        });
      } else {
        track("superteam_share_copy", { channel });
      }
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
  receipt,
  source = "superteam",
  slug,
  published = false,
}: {
  tweet: string;
  linkedin: string;
  email: string;
  link: string;
  /** Canonical `databard.evidence-receipt` JSON — copyable so it travels with the numbers. */
  receipt: string;
  source?: "superteam" | "edition";
  slug?: string;
  published?: boolean;
}) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    if (source === "superteam") {
      track("superteam_page_view", {});
    } else if (!published) {
      track("edition_preview", { slug: slug ?? "" });
    }
  }, [source, slug, published]);

  return (
    <div className="flex flex-wrap gap-2">
      <CopyButton label="Copy tweet" text={tweet} channel="tweet" source={source} slug={slug} published={published} />
      <CopyButton label="Copy LinkedIn" text={linkedin} channel="linkedin" source={source} slug={slug} published={published} />
      <CopyButton label="Copy email" text={email} channel="email" source={source} slug={slug} published={published} />
      <CopyButton label="Copy link" text={link} channel="link" source={source} slug={slug} published={published} />
      <CopyButton label="Copy evidence receipt" text={receipt} channel="receipt" source={source} slug={slug} published={published} />
    </div>
  );
}
