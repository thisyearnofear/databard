"use client";

import { useState } from "react";

export function CopyLinkChip({ href }: { href: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const value = href.startsWith("http") ? href : `${window.location.origin}${href}`;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text)]"
    >
      {copied ? "✓ Link copied" : "Copy session link"}
    </button>
  );
}
