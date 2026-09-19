"use client";

import { useEffect, useRef } from "react";
import { track } from "@/lib/track";
import type { EventType } from "@/lib/events";

/**
 * Fires one whitelisted analytics event on mount — lets server-rendered pages
 * record views without converting the whole page to a client component.
 */
export function PageViewTracker({ event }: { event: EventType }) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    track(event, {});
  }, [event]);
  return null;
}
