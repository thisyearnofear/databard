/**
 * Client-side event tracker — fire-and-forget, never blocks the UI,
 * never throws. Types are validated server-side against the whitelist
 * in src/lib/events.ts.
 */
import type { EventType } from "./events";

export function track(type: EventType, meta?: Record<string, string>): void {
  if (typeof window === "undefined") return;
  try {
    const payload = JSON.stringify({ type, ...(meta ? { meta } : {}) });
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
