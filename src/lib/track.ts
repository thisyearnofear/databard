/**
 * Client-side event tracker — fire-and-forget, never blocks the UI,
 * never throws. Types are validated server-side against the whitelist
 * in src/lib/events.ts.
 *
 * Every event is stamped with first-touch attribution (UTM source/medium/
 * campaign, else the referrer host) so the funnel can be sliced by where
 * traffic came from. Hosts and short codes only — no full URLs, no PII.
 */
import type { EventType } from "./events";

const CTX_KEY = "databard:ctx";
const UTM_MAP: readonly [param: string, key: string][] = [
  ["utm_source", "src"],
  ["utm_medium", "med"],
  ["utm_campaign", "cmp"],
];

/**
 * Landing attribution, cached in sessionStorage on first touch so it survives
 * SPA navigation after the query string is gone. Returns {} when storage is
 * unavailable (private mode) — tracking degrades to no-attribution, never throws.
 */
function attribution(): Record<string, string> {
  try {
    const cached = sessionStorage.getItem(CTX_KEY);
    if (cached) return JSON.parse(cached) as Record<string, string>;
    const ctx: Record<string, string> = {};
    const params = new URLSearchParams(window.location.search);
    for (const [param, key] of UTM_MAP) {
      const value = params.get(param);
      if (value) ctx[key] = value.slice(0, 60);
    }
    // No explicit UTM source? Fall back to the referrer host (or stay empty = direct).
    if (!ctx.src && document.referrer) {
      try { ctx.src = new URL(document.referrer).host.slice(0, 60); } catch { /* malformed referrer */ }
    }
    sessionStorage.setItem(CTX_KEY, JSON.stringify(ctx));
    return ctx;
  } catch {
    return {};
  }
}

export function track(type: EventType, meta?: Record<string, string>): void {
  if (typeof window === "undefined") return;
  try {
    // Explicit meta first so it survives the server's 5-key cap; attribution fills the rest.
    const merged: Record<string, string> = { ...(meta ?? {}), ...attribution() };
    const payload = JSON.stringify({ type, meta: merged });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/events", new Blob([payload], { type: "application/json" }));
    } else {
      fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  } catch { /* tracking must never break the product */ }
}
