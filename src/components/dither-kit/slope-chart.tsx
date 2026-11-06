"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  backingSize,
  bloomLayerStyle,
  clamp01,
  easeInOutCubic,
  paintColumn,
  prefersReducedMotion,
  type BloomInput,
} from "./dither-paint"
import { cn } from "./lib"
import { PALETTE, type DitherColor } from "./palette"
import { useChartDimensions } from "./use-chart-dimensions"

export type SlopeDatum = {
  key: string
  name: string
  /** Value at the left column. */
  prev: number
  /** Value at the right column. */
  current: number
  /** Overrides the direction-derived hue. */
  color?: DitherColor
}

export type SlopeChartProps = {
  data: SlopeDatum[]
  /** Fixed [min, max] domain; defaults to the data range padded ~12%. */
  domain?: [number, number]
  leftHeader?: string
  rightHeader?: string
  /** Left-side label (default: datum name). */
  leftLabel?: (d: SlopeDatum) => string
  /** Right-side label (default: formatted current value). */
  rightLabel?: (d: SlopeDatum) => string
  /** Hue by movement — green up, red down, grey flat (default on). */
  colorByDirection?: boolean
  /** px reserved for the left/right label columns. */
  leftGutter?: number
  rightGutter?: number
  /** CSS height of the whole chart. */
  height?: number
  formatValue?: (value: number) => string
  animate?: boolean
  animationDuration?: number
  bloom?: BloomInput
  bloomOnHover?: boolean
  onHoverDatum?: (key: string | null) => void
  ariaLabel?: string
  className?: string
}

const LABEL_GAP = 14 // min px between de-collided label rows
const TOP_PAD = 20 // room for the column headers
const BOTTOM_PAD = 10

/** Spread label y-positions apart (two passes) without moving the threads. */
function spreadLabels(ys: number[], lo: number, hi: number, gap: number) {
  const order = ys.map((y, i) => [y, i] as const).sort((a, b) => a[0] - b[0])
  const out = new Array<number>(ys.length)
  let prev = -Infinity
  for (const [y, i] of order) {
    out[i] = Math.min(Math.max(y, prev + gap), hi)
    prev = out[i]
  }
  prev = Infinity
  for (let k = order.length - 1; k >= 0; k--) {
    const i = order[k][1]
    out[i] = Math.max(Math.min(out[i], prev - gap), lo)
    prev = out[i]
  }
  return out
}

/**
 * Dithered **slope chart** — a slopegraph for two-column comparisons
 * (last week → this week, before → after). Each entity is a pixel thread:
 * a bright dithered line with a fading glow band underneath, anchored by
 * solid pips at both ends. Threads reveal left→right; hovering near a thread
 * or a gutter label spotlights it while the rest dim.
 */
export function SlopeChart({
  data,
  domain,
  leftHeader,
  rightHeader,
  leftLabel = (d) => d.name,
  rightLabel,
  colorByDirection = true,
  leftGutter = 120,
  rightGutter = 64,
  height = 240,
  formatValue = (v) => `${Math.round(v)}`,
  animate = true,
  animationDuration = 800,
  bloom = "off",
  bloomOnHover = false,
  onHoverDatum,
  ariaLabel,
  className,
}: SlopeChartProps) {
  const { ref, size } = useChartDimensions<HTMLDivElement>()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bloomRef = useRef<HTMLCanvasElement>(null)
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const [mouseIn, setMouseIn] = useState(false)

  const { width } = size
  const { cols, rows } = backingSize(width, height)
  // On narrow screens the gutters give ground first: labels truncate harder
  // and the plot keeps a workable minimum span.
  const minPlot = Math.min(96, Math.max(40, width * 0.3))
  const effRight = Math.max(40, Math.min(rightGutter, width - minPlot))
  const effLeft = Math.max(0, Math.min(leftGutter, width - effRight - minPlot))
  const x0 = effLeft
  const x1 = Math.max(x0 + 24, width - effRight)

  const [d0, d1] = useMemo(() => {
    if (domain) return domain
    const vals = data.flatMap((d) => [d.prev, d.current])
    if (vals.length === 0) return [0, 1]
    const lo = Math.min(...vals)
    const hi = Math.max(...vals)
    const pad = Math.max(4, (hi - lo) * 0.12)
    return [lo - pad, hi + pad]
  }, [data, domain])

  const yOf = (v: number) =>
    TOP_PAD + (1 - clamp01((v - d0) / Math.max(d1 - d0, 1e-6))) * (height - TOP_PAD - BOTTOM_PAD)

  const series = useMemo(
    () =>
      data.map((d) => {
        const dir = d.current > d.prev ? "up" : d.current < d.prev ? "down" : "flat"
        const color: DitherColor =
          d.color ?? (colorByDirection ? (dir === "up" ? "green" : dir === "down" ? "red" : "grey") : "purple")
        return { ...d, dir, color, yPrev: yOf(d.prev), yCur: yOf(d.current) }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, colorByDirection, d0, d1, height]
  )

  const leftYs = useMemo(
    () => spreadLabels(series.map((s) => s.yPrev), LABEL_GAP / 2 + 8, height - 10, LABEL_GAP),
    [series, height]
  )
  const rightYs = useMemo(
    () => spreadLabels(series.map((s) => s.yCur), LABEL_GAP / 2 + 8, height - 10, LABEL_GAP),
    [series, height]
  )

  // The RAF loop reads latest props/state through refs; refs are written in an
  // effect (never during render).
  const stateRef = useRef({ series, x0, x1, width, height, hoverKey, mouseIn, animate, animationDuration })
  useEffect(() => {
    stateRef.current = { series, x0, x1, width, height, hoverKey, mouseIn, animate, animationDuration }
  })

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
    // Thin trail under the thread — a hint of dither, not a filled band.
    const glow = Math.max(2, Math.round(rows * 0.045))
    let raf = 0
    let animStart = 0
    let lastSig = ""
    let intensity = 0

    const paint = (prog: number, it: number) => {
      const s = stateRef.current
      c.clearRect(0, 0, cols, rows)
      const span = Math.max(s.x1 - s.x0, 1)
      const revealT = easeInOutCubic(prog)
      for (const ser of s.series) {
        const seed = PALETTE[ser.color]
        const dim = s.hoverKey === null ? 1 : s.hoverKey === ser.key ? 1 : 0.3
        const hot = s.hoverKey === ser.key ? 1 : 0
        for (let x = 0; x < cols; x++) {
          const px = ((x + 0.5) * s.width) / cols
          const t = (px - s.x0) / span
          if (t < 0 || t > 1 || t > revealT) continue
          const ly = ser.yPrev + (ser.yCur - ser.yPrev) * t
          const top = Math.round((ly / s.height) * (rows - 1))
          paintColumn(c, x, top, Math.min(rows - 1, top + glow), seed, {
            variant: "gradient",
            intensity: it * 0.5 + hot * 0.5,
            dim,
            stacked: false,
            // Sparse scatter keeps the trail translucent so crossing threads
            // read through each other instead of stacking into ribbons.
            sparse: 0.42 - hot * 0.16,
          })
          // Bright tip on the leading edge while the thread draws in.
          if (revealT < 1 && t > revealT - 2 / span) {
            c.fillStyle = `rgba(${seed.fill[0]},${seed.fill[1]},${seed.fill[2]},${0.95 * dim})`
            c.fillRect(x, top - 1, 1, 2)
          }
        }
        // Endpoint pips — solid anchors at both columns.
        const pip = (cxp: number, ly: number) => {
          const row = Math.round((ly / s.height) * (rows - 1))
          c.fillStyle = `rgba(${seed.fill[0]},${seed.fill[1]},${seed.fill[2]},${0.95 * dim})`
          c.fillRect(cxp, Math.max(0, row - 1), 1, 2)
          c.fillRect(cxp + 1, Math.max(0, row - 1), 1, 2)
        }
        pip(0, ser.yPrev)
        if (prog > 0.96) pip(cols - 2, ser.yCur)
      }
    }

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      const s = stateRef.current
      if (!animStart) animStart = now
      const prog =
        s.animate && !reduce ? Math.min(1, (now - animStart) / s.animationDuration) : 1
      const itTarget = s.mouseIn ? 1 : 0
      const it = Math.abs(itTarget - intensity) < 0.01 ? itTarget : intensity + (itTarget - intensity) * 0.16
      intensity = it
      const sig = `${prog.toFixed(3)}|${it.toFixed(2)}|${s.hoverKey ?? ""}|${s.series.length}|${s.width}`
      if (sig !== lastSig) {
        lastSig = sig
        paint(prog, it)
        if (bloomCtx) {
          bloomCtx.clearRect(0, 0, cols, rows)
          const s2 = stateRef.current
          if (bloom !== "off" && (!bloomOnHover || s2.mouseIn)) {
            bloomCtx.drawImage(canvas, 0, 0)
          }
        }
      }
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, rows, bloom, bloomOnHover])

  const pickHover = (clientX: number, clientY: number) => {
    const el = ref.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const px = clientX - rect.left
    const py = clientY - rect.top
    const span = Math.max(x1 - x0, 1)
    const s = series
    if (px < x0) {
      // Left gutter — nearest (de-collided) left label.
      let best: string | null = null
      let bd = Infinity
      s.forEach((ser, i) => {
        const d = Math.abs(py - leftYs[i])
        if (d < bd) { bd = d; best = ser.key }
      })
      return bd <= LABEL_GAP ? best : null
    }
    if (px > x1) {
      let best: string | null = null
      let bd = Infinity
      s.forEach((ser, i) => {
        const d = Math.abs(py - rightYs[i])
        if (d < bd) { bd = d; best = ser.key }
      })
      return bd <= LABEL_GAP ? best : null
    }
    const t = (px - x0) / span
    let best: string | null = null
    let bd = Infinity
    for (const ser of s) {
      const ly = ser.yPrev + (ser.yCur - ser.yPrev) * t
      const d = Math.abs(py - ly)
      if (d < bd) { bd = d; best = ser.key }
    }
    return bd <= 12 ? best : null
  }

  const setHover = (key: string | null) => {
    setHoverKey((prev) => {
      if (prev === key) return prev
      onHoverDatum?.(key)
      return key
    })
  }

  const bloomStyle = bloomLayerStyle(bloom, bloomOnHover ? mouseIn : true)
  const formatRight = rightLabel ?? ((d: SlopeDatum) => formatValue(d.current))
  const dim = (key: string) => hoverKey !== null && hoverKey !== key

  return (
    <div
      ref={ref}
      role="img"
      aria-label={
        ariaLabel ??
        `Slope chart: ${data.map((d) => `${d.name} ${formatValue(d.prev)} to ${formatValue(d.current)}`).join(", ")}`
      }
      className={cn("relative w-full select-none", className)}
      style={{ height }}
      onPointerEnter={() => setMouseIn(true)}
      onPointerMove={(e) => setHover(pickHover(e.clientX, e.clientY))}
      onPointerLeave={() => {
        setMouseIn(false)
        setHover(null)
      }}
    >
      {leftHeader && (
        <span
          className="absolute top-0 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]"
          style={{ right: width - x0 }}
        >
          {leftHeader}
        </span>
      )}
      {rightHeader && (
        <span
          className="absolute top-0 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]"
          style={{ left: x1 }}
        >
          {rightHeader}
        </span>
      )}
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
              ...(bloomStyle ?? { opacity: 0 }),
            }}
            aria-hidden
          />
        </>
      )}
      {effLeft > 30 &&
        series.map((ser, i) => (
          <span
            key={`l-${ser.key}`}
            className={cn(
              "pointer-events-none absolute left-0 truncate text-right text-xs leading-none",
              dim(ser.key) ? "text-[var(--text-muted)] opacity-40" : "text-[var(--text)]"
            )}
            style={{ top: leftYs[i] - 6, width: effLeft - 14 }}
          >
            {leftLabel(ser)}
          </span>
        ))}
      {effRight > 30 &&
        series.map((ser, i) => (
          <span
            key={`r-${ser.key}`}
            className={cn(
              "pointer-events-none absolute truncate font-mono text-xs leading-none",
              dim(ser.key) ? "text-[var(--text-muted)] opacity-40" : "text-[var(--text)]"
            )}
            style={{ left: x1 + 12, top: rightYs[i] - 6, width: effRight - 12 }}
          >
            {formatRight(ser)}
          </span>
        ))}
    </div>
  )
}
