"use client";
/**
 * StreamingRationale — types out the buyer LLM's rationale character-by-character.
 *
 * This is the "the moment" text — the buyer's decision-making made legible. The typing
 * animation makes it feel like an agent thinking, not a static string.
 */
import { useEffect, useState } from "react";

export function StreamingRationale({
  text,
  cps = 60,
  onComplete,
}: {
  text: string;
  cps?: number;
  onComplete?: () => void;
}) {
  const [rendered, setRendered] = useState("");

  useEffect(() => {
    setRendered("");
    if (!text) return;
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setRendered(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        onComplete?.();
      }
    }, 1000 / cps);
    return () => clearInterval(interval);
  }, [text, cps, onComplete]);

  return (
    <span>
      {rendered}
      {rendered.length < text.length && (
        <span className="inline-block w-2 h-4 bg-[var(--accent)] ml-0.5 animate-pulse align-middle" />
      )}
    </span>
  );
}
