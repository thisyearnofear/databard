"use client";

import { useEffect } from "react";

/**
 * WebMcpLoader — injects /webmcp.js only when the browser exposes a WebMCP
 * provider (`document.modelContext` / `navigator.modelContext`).
 * Browsers without support download nothing and change nothing.
 */
export function WebMcpLoader() {
  useEffect(() => {
    try {
      const mc =
        (typeof document !== "undefined" &&
          (document as unknown as Record<string, unknown>).modelContext) ||
        (typeof navigator !== "undefined" &&
          (navigator as unknown as Record<string, unknown>).modelContext);
      if (!mc) return;
      if (document.querySelector('script[data-webmcp="1"]')) return;
      const s = document.createElement("script");
      s.src = "/webmcp.js";
      s.defer = true;
      s.dataset.webmcp = "1";
      document.head.appendChild(s);
    } catch {
      /* WebMCP is progressive enhancement — never break the page */
    }
  }, []);
  return null;
}
