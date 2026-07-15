"use client";
import { useRef, type ReactNode } from "react";

/**
 * TiltCard — 3D perspective tilt that follows the cursor.
 *
 * Subtle: max 3deg rotation. Includes an inner glow that tracks the cursor
 * position. Falls back to flat (no transform) if reduced motion is preferred.
 *
 * Usage: wrap any card content. The card tilts based on mouse position
 * relative to its center.
 */
export function TiltCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    // Tilt: max 3deg, inverted so moving right tilts right edge away
    const tiltY = ((x - cx) / cx) * 3;
    const tiltX = -((y - cy) / cy) * 3;
    el.style.setProperty("--tilt-x", `${tiltX}deg`);
    el.style.setProperty("--tilt-y", `${tiltY}deg`);
    el.style.setProperty("--mouse-x", `${x}px`);
    el.style.setProperty("--mouse-y", `${y}px`);
  }

  function handleMouseLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--tilt-x", "0deg");
    el.style.setProperty("--tilt-y", "0deg");
  }

  return (
    <div
      ref={ref}
      className={`tilt-card relative ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div className="tilt-glow" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
