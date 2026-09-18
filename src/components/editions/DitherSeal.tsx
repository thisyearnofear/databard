"use client";

/**
 * DitherSeal — the edition stamp, rendered in the same pixel material as the
 * landscape. A deterministic ring of cells with a seeded texture, so each
 * report's seal is subtly its own. Static: a seal does not shimmer.
 */
import { useEffect, useRef } from "react";
import { hash01 } from "@/lib/dither-field";

const CELLS = 12;

export function DitherSeal({
  seed,
  size = 44,
  className,
}: {
  seed: number;
  size?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const palm = getComputedStyle(document.documentElement).getPropertyValue("--palm-light").trim() || "#5a9b68";
    ctx.fillStyle = palm;

    const cell = size / CELLS;
    const center = (CELLS - 1) / 2;
    for (let gy = 0; gy < CELLS; gy++) {
      for (let gx = 0; gx < CELLS; gx++) {
        const dx = gx - center;
        const dy = gy - center;
        const d = Math.sqrt(dx * dx + dy * dy);
        const h = hash01(gx, gy, seed);
        // The ring, textured: most ring cells on, a seeded few missing.
        const ring = d > 4.3 && d < 5.7 && h > 0.16;
        // The inner mark: a sparse seeded cluster at the core.
        const core = d < 2.4 && h > 0.58;
        if (ring || core) {
          ctx.fillRect(gx * cell, gy * cell, Math.max(cell - 1, 1), Math.max(cell - 1, 1));
        }
      }
    }
  }, [seed, size]);

  return <canvas ref={ref} aria-hidden="true" style={{ width: size, height: size }} className={className} />;
}
