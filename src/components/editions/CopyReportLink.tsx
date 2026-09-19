"use client";

import { useState } from "react";
import { track } from "@/lib/track";

export function CopyReportLink({ href }: { href: string }) {
  const [state, setState] = useState<"idle" | "copied" | "fallback">("idle");
  const [url, setUrl] = useState("");
  async function copy() {
    const absolute = new URL(href, window.location.origin).href;
    setUrl(absolute);
    try {
      await navigator.clipboard.writeText(absolute);
      setState("copied");
      track("edition_share_copy", { channel: "link" });
    }
    catch { setState("fallback"); }
  }
  return <div><button type="button" onClick={copy} className="min-h-11 text-sm font-medium text-[var(--accent)] hover:underline">{state === "copied" ? "Report link copied" : "Copy report link"}</button>{state === "copied" && <p role="status" className="sr-only">Report link copied</p>}{state === "fallback" && <label className="block text-xs text-[var(--text-muted)]">Copy the link below<input readOnly value={url} onFocus={(event) => event.target.select()} className="mt-2 w-full rounded border border-[var(--border)] bg-[var(--bg)] p-3 text-sm" /></label>}</div>;
}
