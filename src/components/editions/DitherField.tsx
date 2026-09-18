"use client";

/**
 * DitherField — the hero's living landscape.
 *
 * A canvas of ordered-dither pixels grown from the dataset: the terrain
 * silhouette is the monthly listing series (see src/lib/dither-field.ts),
 * every pixel decision is a deterministic hash of (x, y, seed), and the
 * pointer parts the field with a warm glow and a short pollen trail —
 * Sylva's moss, recast in DataBard's own pixel material.
 *
 * Discipline: one rAF loop shared by field + pollen, DPR capped, pauses when
 * hidden, and a fully static render under prefers-reduced-motion (no loop,
 * no pointer response).
 */
import { useEffect, useRef } from "react";
import { hash01 } from "@/lib/dither-field";

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

const CELL = 9;
const WARM = { r: 240, g: 214, b: 150 };

function hexToRgb(hex: string, fallback: { r: number; g: number; b: number }) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return fallback;
  const v = parseInt(m[1], 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

interface Pollen {
  x: number;
  y: number;
  vy: number;
  life: number;
}

export function DitherField({
  series,
  seed,
  className,
  static: frozen = false,
}: {
  series: number[];
  seed: number;
  className?: string;
  /** Frozen editions render one static frame — the landscape of a pinned report. */
  static?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || series.length < 2) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const ctx: CanvasRenderingContext2D = context;

    const reduce = frozen || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const styles = getComputedStyle(document.documentElement);
    const accent = hexToRgb(styles.getPropertyValue("--accent"), { r: 139, g: 92, b: 246 });
    const accentLight = hexToRgb(styles.getPropertyValue("--accent-light"), { r: 196, g: 181, b: 253 });

    let w = 0;
    let h = 0;
    let raf = 0;
    let running = true;
    let t = 0;
    const pointer = { x: -9999, y: -9999 };
    const pollen: Pollen[] = [];

    const max = Math.max(...series, 1);
    const norm = series.map((v) => v / max);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    /** Terrain silhouette: the dataset series, interpolated, plus seeded jaggedness. */
    const ridge = (col: number, cols: number): number => {
      const tPos = (col / Math.max(cols - 1, 1)) * (norm.length - 1);
      const i = Math.min(Math.floor(tPos), norm.length - 2);
      const f = tPos - i;
      const v = norm[i] + (norm[i + 1] - norm[i]) * f;
      const jag = (hash01(col, 0, seed) - 0.5) * 0.09;
      return h * (0.78 - v * 0.34) + jag * h;
    };

    const frame = () => {
      if (w === 0 || h === 0) return;
      ctx.clearRect(0, 0, w, h);
      const cols = Math.ceil(w / CELL);
      const rows = Math.ceil(h / CELL);

      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          const px = gx * CELL;
          const py = gy * CELL;
          const ty = ridge(gx, cols);
          const jitter = hash01(gx, gy, seed);

          if (py >= ty) {
            // Inside the terrain: depth ramp, brighter near the ridge line.
            const depth = Math.min((py - ty) / (h - ty || 1), 1);
            const shimmer = reduce ? 0 : 0.07 * Math.sin(t * 0.7 + gx * 0.33 + gy * 0.21);
            let intensity = 0.62 - depth * 0.4 + shimmer + jitter * 0.12;

            // Pointer parts the field with a warm glow.
            const dx = px - pointer.x;
            const dy = py - pointer.y;
            const d2 = dx * dx + dy * dy;
            const glow = reduce ? 0 : 0.55 * Math.exp(-d2 / 5200);
            intensity += glow;

            if (intensity > (BAYER[gy % 4][gx % 4] + 0.5) / 16) {
              const warmMix = Math.min(glow * 2.2, 1);
              const c = warmMix > 0.25 ? WARM : depth < 0.18 ? accentLight : accent;
              ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},${Math.min(intensity, 0.92)})`;
              ctx.fillRect(px, py, CELL - 1, CELL - 1);
            }
          } else if (jitter > 0.9965) {
            // Sparse pollen motes above the ridge.
            ctx.fillStyle = `rgba(${accentLight.r},${accentLight.g},${accentLight.b},0.5)`;
            ctx.fillRect(px, py, CELL - 1, CELL - 1);
          }
        }
      }

      // Pollen trail behind the pointer.
      for (let i = pollen.length - 1; i >= 0; i--) {
        const p = pollen[i];
        p.y += p.vy;
        p.life -= 0.016;
        if (p.life <= 0) {
          pollen.splice(i, 1);
          continue;
        }
        ctx.fillStyle = `rgba(${WARM.r},${WARM.g},${WARM.b},${(p.life * 0.85).toFixed(3)})`;
        ctx.fillRect(Math.round(p.x / CELL) * CELL, Math.round(p.y / CELL) * CELL, CELL - 2, CELL - 2);
      }
    };

    const loop = () => {
      if (!running) return;
      t += 0.016;
      frame();
      raf = requestAnimationFrame(loop);
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      if (pollen.length < 90 && Math.random() < 0.35) {
        pollen.push({ x: pointer.x, y: pointer.y, vy: -0.25 - Math.random() * 0.5, life: 1 });
      }
    };

    const onPointerLeave = () => {
      pointer.x = -9999;
      pointer.y = -9999;
    };

    const onVisibility = () => {
      running = document.visibilityState === "visible";
      if (running && !reduce) {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(loop);
      }
    };

    resize();
    const observer = new ResizeObserver(() => {
      resize();
      if (reduce) frame();
    });
    observer.observe(canvas);

    if (reduce) {
      frame();
    } else {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      window.addEventListener("pointerleave", onPointerLeave);
      document.addEventListener("visibilitychange", onVisibility);
      raf = requestAnimationFrame(loop);
    }

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [series, seed, frozen]);

  return <canvas ref={ref} aria-hidden="true" className={className} />;
}
