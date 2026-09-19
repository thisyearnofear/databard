"use client";

import { useEffect } from "react";
import { track } from "@/lib/track";

/** Fires the /agents page-view funnel event once on mount. */
export function AgentsPageTracker() {
  useEffect(() => {
    track("agents_page_view", {});
  }, []);
  return null;
}
