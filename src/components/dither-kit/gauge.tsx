"use client"

import { useEffect, useRef, useState } from "react"
import {
  BAYER,
  backingSize,
  bloomLayerStyle,
  BORDER_ALPHA,
  clamp01,
  easeOutCubic,
  OFF_TIER,
  prefersReducedMotion,
  type BloomInput,
} from "./dither-paint"
import { cn } from "./lib"
import { PALETTE, rgb, type DitherColor } from "./palette"
import { useChartDimensions } from "./use-chart-dimensions"

const PI = Math.PI
const TAU = PI * 2

export type GaugeProps = {
  /** Current value, clamped to [0, max]. */
  value: number
  max?: number
  /** Fill hue for the value arc — callers map semantics (e.g. score tone). */
  color?: DitherColor
  /** Track hue — defaults to the no-data grey. */
  trackColor?: DitherColor
  /** Threshold positions (in value units) notched into the arc. */
  ticks?: number[]
  /** Show the centre numeral. */
  showValue?: boolean
  formatValue?: (value: number) => string
  /** Small caption under the numeral. */
  label?: string
  animate?: boolean
  animationDuration?: number
  bloom?: BloomInput
  bloomOnHover?: boolean
  className?: string
  valueClassName?: string
  labelClassName?: string
}

/**
 * Dithered **gauge** — a half-annulus dial. The grey track is always present;
 * the value arc sweeps over it from the left, dense at the rim and thinning
 * inward like the pie family. `ticks` etch threshold notches into the band
 * (e.g. the 50/80 score boundaries), and the value's leading edge keeps a
 * bright cap so the dial reads as a needle-less pointer.
 *
 * Standalone (no chart context needed) — the numeral and label live in DOM so
 * they stay theme-safe and selectable.
 */
export function Gauge({
  value,
  max = 100,
  color = "purple",
  trackColor = "grey",
  ticks,
  showValue = true,
  formatValue = (v) => `${Math.round(v)}`,
  label,
  animate = true,
  animationDuration = 900,
  bloom = "off",
  bloomOnHover = false,
  className,
  valueClassName,
  labelClassName,
}: GaugeProps) {
  const { ref, size } = useChartDimensions<HTMLDivElement>()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bloomRef = useRef<HTMLCanvasElement>(null)
  const numeralRef = useRef<HTMLSpanElement>(null)
  const [mouseIn, setMouseIn] = useState(false)

  const { width, height } = size
  const { cols, rows } = backingSize(width, height)

  // Geometry: centre sits near the bottom edge so the half-annulus fills the
  // box; the numeral tucks inside the hollow below the arc.
  const pad = 4
  const cx = width / 2
  const cy = height * 0.88
  const outerR = Math.max(8, Math.min(width / 2 - pad, cy - pad))
  const innerR = outerR * 0.62

  // Live value easing — persists across prop changes so updates glide from the
  // displayed position rather than restarting the sweep. Read via refs inside
  // the RAF loop; written in an effect (never during render).
  const dispRef = useRef(0)
  const targetRef = useRef(clamp01(value / max))
  const mouseInRef = useRef(false)
  useEffect(() => {
    targetRef.current = clamp01(max > 0 ? value / max : 0)
  }, [value, max])
  useEffect(() => {
    mouseInRef.current = mouseIn
  }, [mouseIn])

  const ticksKey = ticks?.join(",") ?? ""

  useEffect(() => {
    const canvas = canvasRef.current
    const c = canvas?.getContext("2d")
    if (!(canvas && c) || cols <= 0 || rows <= 0) return
    canvas.width = cols
    canvas.height = rows

    const bloomCanvas = bloomRef.current
    const bloomCtx = bloomCanvas?.getContext("2d") ?? null
    if (bloomCanvas) {
      bloomCanvas.width = cols
      bloomCanvas.height = rows
    }

    const seed = PALETTE[color]
    const track = PALETTE[trackColor]
    const tickAngles = (ticks ?? []).map((t) => PI + clamp01(t / max) * PI)
    const reduce = prefersReducedMotion()
    const span = outerR - innerR
    let raf = 0
    let lastPaint = -1
    let lastMouse = false
    let intensity = 0
    let animStart = 0
    let animFrom = dispRef.current
    let lastTarget = targetRef.current

    const paint = (frac: number, it: number) => {
      c.clearRect(0, 0, cols, rows)
      const reveal = PI + frac * PI // arc grows left→right from the 9 o'clock end
      for (let y = 0; y < rows; y++) {
        const py = ((y + 0.5) * height) / rows
        for (let x = 0; x < cols; x++) {
          const px = ((x + 0.5) * width) / cols
          const dx = px - cx
          const dy = py - cy
          const r = Math.hypot(dx, dy)
          if (r > outerR || r < innerR) continue
          let a = Math.atan2(dy, dx)
          if (a < 0) a += TAU
          if (a < PI) continue // below the baseline — outside the dial

          // Threshold notches — brighter cells at each tick angle, inward from
          // the rim, in the track hue so they read on both zones.
          let notched = false
          for (const ta of tickAngles) {
            if (Math.abs(a - ta) * r < 1.4 && r > innerR + span * 0.3) {
              notched = true
              break
            }
          }
          if (notched) {
            c.fillStyle = rgb(track.fill, 1, 0.85)
            c.fillRect(x, y, 1, 1)
            continue
          }

          const density = (r - innerR) / Math.max(span, 1)
          if (a <= reveal) {
            // Value zone — rim cap, then the ordered-dither scatter dense at
            // the rim thinning inward, plus a bright cap on the leading edge.
            if (outerR - r < 1.4 || (reveal - a) * r < 1.6) {
              c.fillStyle = rgb(seed.fill, 1, Math.min(1, BORDER_ALPHA + it * 0.28))
              c.fillRect(x, y, 1, 1)
              continue
            }
            const lit = density > BAYER[y & 3][x & 3] - 0.1 * it
            const k = (0.35 + density * 0.65) * (1 + 0.22 * it)
            c.fillStyle = rgb(seed.fill, 1, Math.min(1, lit ? k : k * OFF_TIER))
            c.fillRect(x, y, 1, 1)
          } else {
            // Track zone — a quiet Bayer-gated band so the dial reads as
            // textured rather than a flat grey ring.
            const lit = BAYER[y & 3][x & 3] < 0.55
            c.fillStyle = rgb(track.fill, 1, lit ? 0.2 + density * 0.1 : 0.08)
            c.fillRect(x, y, 1, 1)
          }
        }
      }
    }

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      const target = targetRef.current
      if (target !== lastTarget) {
        // Value moved — glide from wherever the dial is now.
        lastTarget = target
        animFrom = dispRef.current
        animStart = now
      }
      if (!animStart) animStart = now
      const prog =
        animate && !reduce ? Math.min(1, (now - animStart) / animationDuration) : 1
      const next = animFrom + (target - animFrom) * easeOutCubic(prog)
      const itTarget = mouseInRef.current ? 1 : 0
      const it =
        Math.abs(itTarget - intensity) < 0.01
          ? itTarget
          : intensity + (itTarget - intensity) * 0.16
      const mouse = mouseInRef.current
      if (next !== lastPaint || it !== intensity || mouse !== lastMouse) {
        paint(next, it)
        lastPaint = next
        intensity = it
        lastMouse = mouse
        dispRef.current = next
        if (numeralRef.current) {
          numeralRef.current.textContent = formatValue(next * max)
        }
        if (bloomCtx) {
          bloomCtx.clearRect(0, 0, cols, rows)
          if (bloom !== "off" && (!bloomOnHover || mouse)) {
            bloomCtx.drawImage(canvas, 0, 0)
          }
        }
      }
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, rows, width, height, cx, cy, outerR, innerR, color, trackColor, ticksKey, max, animate, animationDuration, bloom, bloomOnHover])

  const bloomStyle = bloomLayerStyle(bloom, bloomOnHover ? mouseIn : true)

  return (
    <div
      ref={ref}
      role="img"
      aria-label={`${formatValue(value)} of ${max}${label ? ` — ${label}` : ""}`}
      className={cn("@container relative w-full", className)}
      style={{ aspectRatio: "8 / 5" }}
      onPointerEnter={() => setMouseIn(true)}
      onPointerLeave={() => setMouseIn(false)}
    >
      {width > 0 && height > 0 && (
        <>
          <canvas
            ref={canvasRef}
            className="pointer-events-none absolute inset-0"
            style={{ width, height, imageRendering: "pixelated" }}
            aria-hidden
          />
          <canvas
            ref={bloomRef}
            className="pointer-events-none absolute inset-0"
            style={{
              width,
              height,
              transition: "opacity 220ms ease",
              ...(bloomStyle ?? { opacity: 0 }),
            }}
            aria-hidden
          />
          {(showValue || label) && (
            <div
              className="pointer-events-none absolute inset-x-0 text-center"
              style={{ top: cy - innerR * 0.9 }}
            >
              {showValue && (
                <span
                  ref={numeralRef}
                  className={cn(
                    "font-display block font-bold tabular-nums leading-none text-[clamp(0.8rem,24cqw,2.5rem)]",
                    valueClassName
                  )}
                >
                  {formatValue(value)}
                </span>
              )}
              {label && (
                <span
                  className={cn(
                    "mt-1 block font-mono uppercase tracking-[0.14em] text-[var(--text-muted)] text-[clamp(0.5rem,8cqw,0.75rem)]",
                    labelClassName
                  )}
                >
                  {label}
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
