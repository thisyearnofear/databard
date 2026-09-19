"use client";

/**
 * DitherDissolve — the signature transition.
 *
 * On `trigger` change, a seeded scatter of ink pixels covers the surface in
 * deterministic hash order, then clears — the filing pixelates out and
 * re-resolves instead of crossfading. Same ordered material as the
 * DitherField landscape; pure decoration over the real content swap, so it
 * never gates interaction. Reduced motion: renders nothing, does nothing.
 */
import { useEffect, useRef } from "react";
import { hash01 } from "@/lib/dither-field";

const CELL = 9;
const DURATION = 460;
/** Legacy fallback ink — only used when --text cannot be resolved (SSR/tests). */
const FALLBACK_INK = "rgba(37, 27, 49, 0.92)";

/**
 * Resolve the dissolve ink from the active theme so light mode dissolves in
 * dark ink and dark mode in light ink. Falls back to the historical default.
 */
function themeInk(): string {
  if (typeof window === "undefined" || typeof document === "undefined") return FALLBACK_INK;
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue("--text").trim();
    return value || FALLBACK_INK;
  } catch {
    return FALLBACK_INK;
  }
}

export function DitherDissolve({
  trigger,
  seed = 7,
  ink,
}: {
  trigger: unknown;
  seed?: number;
  ink?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const mounted = useRef(false);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Resolve at paint time: an explicit prop wins, otherwise follow --text.
    const paintInk = ink ?? themeInk();

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cols = Math.ceil(w / CELL);
    const rows = Math.ceil(h / CELL);
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min((now - start) / DURATION, 1);
      ctx.clearRect(0, 0, w, h);
      const cover = t < 0.5 ? t * 2 : (1 - t) * 2;
      ctx.fillStyle = paintInk;
      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          if (hash01(gx, gy, seed) < cover) {
            ctx.fillRect(gx * CELL, gy * CELL, CELL - 1, CELL - 1);
          }
        }
      }
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, w, h);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [trigger, seed, ink]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 h-full w-full rounded-[inherit]"
    />
  );
}
