"use client";
import { useEffect, useRef, useState } from "react";

/**
 * CountUp — animates a number from 0 to the target value on mount.
 *
 * Uses requestAnimationFrame with ease-out cubic for a natural deceleration.
 * Falls back to the final value immediately if reduced motion is preferred.
 *
 * The suffix (e.g. "%") is rendered separately so it doesn't animate.
 */
export function CountUp({
  value,
  decimals = 0,
  suffix = "",
  duration = 1200,
  className,
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    // Respect reduced motion — show final value immediately
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }

    const start = performance.now();
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      setDisplay(value * easeOut(progress));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(value);
      }
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [value, duration]);

  return (
    <span className={className}>
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}
