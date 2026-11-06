"use client"

import { useEffect, useRef, useState } from "react"
import {
  BAYER,
  backingSize,
  bloomLayerStyle,
  clamp01,
  easeOutCubic,
  paintColumn,
  prefersReducedMotion,
  type BloomInput,
} from "./dither-paint"
import { cn } from "./lib"
import { PALETTE, rgb, type DitherColor } from "./palette"
import { useChartDimensions } from "./use-chart-dimensions"

export type MeterSegment = {
  value: number
  color: DitherColor
}

export type MeterProps = {
  /** Convenience single-segment value (0–max). */
  value?: number
  color?: DitherColor
  /** Stacked segments laid end-to-end (composition) — overrides value. */
  segments?: MeterSegment[]
  max?: number
  /** CSS height of the bar. */
  height?: number
  /** Threshold positions notched through the bar (in value units). */
  ticks?: number[]
  animate?: boolean
  animationDuration?: number
  bloom?: BloomInput
  className?: string
  ariaLabel?: string
}

/**
 * Dithered **meter** — a thin horizontal bar: faint Bayer-gated track with the
 * fill painted bottom-dense via the shared column painter, a bright cap on the
 * leading edge, and optional threshold notches. With `segments` it becomes a
 * split bar for compositions. Value changes glide rather than re-sweeping.
 */
export function Meter({
  value,
  color = "purple",
  segments,
  max = 100,
  height = 8,
  ticks,
  animate = true,
  animationDuration = 700,
  bloom = "off",
  className,
  ariaLabel,
}: MeterProps) {
  const { ref, size } = useChartDimensions<HTMLDivElement>()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bloomRef = useRef<HTMLCanvasElement>(null)
  const [mouseIn, setMouseIn] = useState(false)

  const { width } = size
  const { cols, rows } = backingSize(width, height)

  const segs: MeterSegment[] = segments ?? [{ value: value ?? 0, color }]
  const total = Math.max(
    1,
    segs.reduce((s, seg) => s + Math.max(0, seg.value), 0)
  )
  // End fraction of each segment along the bar (composition → cumulative).
  const ends = segs.reduce<number[]>((acc, seg) => {
    acc.push((acc[acc.length - 1] ?? 0) + clamp01(seg.value / total) * (max > 0 ? Math.min(1, total / max) : 0))
    return acc
  }, [])

  const dispRef = useRef(0)
  const targetRef = useRef(1)
  const mouseInRef = useRef(false)
  useEffect(() => {
    mouseInRef.current = mouseIn
  }, [mouseIn])

  const segKey = segs.map((s) => `${s.color}:${s.value}`).join("|")
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

    const reduce = prefersReducedMotion()
    const tickCols = new Set(
      (ticks ?? []).map((t) => Math.round(clamp01(t / max) * (cols - 1)))
    )
    let raf = 0
    let animStart = 0
    let animFrom = dispRef.current
    let intensity = 0
    let lastPaint = ""

    const paint = (frac: number, it: number) => {
      c.clearRect(0, 0, cols, rows)
      const reveal = frac * (cols - 1)
      for (let x = 0; x < cols; x++) {
        const fx = x / Math.max(cols - 1, 1)
        // Which segment (if any) owns this column.
        let si = -1
        for (let k = 0; k < ends.length; k++) {
          if (fx <= ends[k] + 1e-9) { si = k; break }
        }
        if (si >= 0 && x <= reveal && !tickCols.has(x)) {
          const seed = PALETTE[segs[si].color]
          paintColumn(c, x, 0, rows, seed, {
            variant: "gradient",
            intensity: it,
            dim: 1,
            stacked: true, // denser floor — a bar reads solid, not misty
          })
          // Bright cap on the bar's leading edge.
          if (x >= Math.floor(reveal)) {
            c.fillStyle = rgb(seed.fill, 1, 0.95)
            c.fillRect(x, 0, 1, rows)
          }
        } else {
          // Track — quiet grey Bayer-gated band.
          for (let y = 0; y < rows; y++) {
            if (BAYER[y & 3][x & 3] < 0.5) {
              c.fillStyle = rgb(PALETTE.grey.fill, 1, 0.12)
              c.fillRect(x, y, 1, 1)
            }
          }
        }
      }
    }

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      if (!animStart) animStart = now
      const prog = animate && !reduce ? Math.min(1, (now - animStart) / animationDuration) : 1
      const frac = animFrom + (targetRef.current - animFrom) * easeOutCubic(prog)
      const itTarget = mouseInRef.current ? 1 : 0
      const it = Math.abs(itTarget - intensity) < 0.01 ? itTarget : intensity + (itTarget - intensity) * 0.16
      intensity = it
      const sig = `${frac.toFixed(3)}|${it.toFixed(2)}`
      if (sig !== lastPaint) {
        lastPaint = sig
        dispRef.current = frac
        paint(frac, it)
        if (bloomCtx) {
          bloomCtx.clearRect(0, 0, cols, rows)
          if (bloom !== "off") bloomCtx.drawImage(canvas, 0, 0)
        }
      }
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, rows, width, height, max, segKey, ticksKey, animate, animationDuration, bloom])

  const label =
    ariaLabel ??
    (segments
      ? `${segments.map((s) => s.value).join(" / ")} of ${max}`
      : `${value ?? 0} of ${max}`)

  return (
    <div
      ref={ref}
      role="img"
      aria-label={label}
      className={cn("relative w-full", className)}
      style={{ height }}
      onPointerEnter={() => setMouseIn(true)}
      onPointerLeave={() => setMouseIn(false)}
    >
      {width > 0 && (
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
              ...(bloomLayerStyle(bloom, true) ?? { opacity: 0 }),
            }}
            aria-hidden
          />
        </>
      )}
    </div>
  )
}
