"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  BAYER,
  bloomLayerStyle,
  clamp01,
  easeOutCubic,
  prefersReducedMotion,
  type BloomInput,
} from "./dither-paint"
import { cn } from "./lib"
import { PALETTE, rgb, type DitherColor } from "./palette"
import { useChartDimensions } from "./use-chart-dimensions"

export type HeatmapDay = {
  /** ISO day, "YYYY-MM-DD". */
  date: string
  value: number
}

export type ActivityHeatmapProps = {
  /** Day → count map, or a list of {date, value}. Missing days read as 0. */
  data: Record<string, number> | HeatmapDay[]
  /** Number of week columns ending this week. */
  weeks?: number
  color?: DitherColor
  /** Intensity cap — values above it saturate. Defaults to the data max. */
  max?: number
  /** CSS px per cell. */
  cell?: number
  /** CSS px between cells. */
  gap?: number
  /** Month labels above the columns they start in. */
  monthLabels?: boolean
  /** Custom hover readout — receives the day and its value. */
  formatTooltip?: (date: string, value: number) => string
  animate?: boolean
  animationDuration?: number
  bloom?: BloomInput
  className?: string
  ariaLabel?: string
}

const DAY_MS = 86_400_000
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const isoDay = (d: Date) => d.toISOString().slice(0, 10)

type Cell = { col: number; row: number; date: string; value: number }

/**
 * Dithered **activity heatmap** — a GitHub-style week×day grid where ordered
 * dither density carries the intensity (no colour ramp needed). Cells reveal
 * column by column, hover reads out the day, and empty days stay as a faint
 * ghost grid so cadence gaps are visible too.
 */
export function ActivityHeatmap({
  data,
  weeks = 16,
  color = "green",
  max,
  cell = 11,
  gap = 3,
  monthLabels = true,
  formatTooltip = (date, v) => `${date} · ${v}`,
  animate = true,
  animationDuration = 900,
  bloom = "off",
  className,
  ariaLabel,
}: ActivityHeatmapProps) {
  const { ref } = useChartDimensions<HTMLDivElement>()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bloomRef = useRef<HTMLCanvasElement>(null)
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null)
  const tipRef = useRef(tip !== null)
  useEffect(() => {
    tipRef.current = tip !== null
  }, [tip])

  const counts = useMemo<Record<string, number>>(() => {
    if (Array.isArray(data)) {
      const out: Record<string, number> = {}
      for (const d of data) out[d.date] = (out[d.date] ?? 0) + d.value
      return out
    }
    return data
  }, [data])

  const pitch = cell + gap
  const { cells, width, height, top, months, cap } = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const dow = (today.getDay() + 6) % 7 // Mon = 0
    const start = new Date(today.getTime() - ((weeks - 1) * 7 + dow) * DAY_MS)
    const top = monthLabels ? 16 : 0
    const cells: Cell[] = []
    const months: { label: string; x: number }[] = []
    let lastMonth = -1
    for (let col = 0; col < weeks; col++) {
      const d0 = new Date(start.getTime() + col * 7 * DAY_MS)
      if (monthLabels && d0.getMonth() !== lastMonth && d0 <= today) {
        lastMonth = d0.getMonth()
        months.push({ label: MONTHS[lastMonth], x: col * pitch })
      }
      for (let row = 0; row < 7; row++) {
        const d = new Date(start.getTime() + (col * 7 + row) * DAY_MS)
        if (d > today) break // trailing future days in the last week stay empty
        const date = isoDay(d)
        cells.push({ col, row, date, value: counts[date] ?? 0 })
      }
    }
    const cap = Math.max(1, max ?? Math.max(...cells.map((c) => c.value), 1))
    return {
      cells,
      months,
      cap,
      top,
      width: weeks * pitch - gap,
      height: top + 7 * pitch - gap,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counts, weeks, cell, gap, monthLabels, max])

  // Backing resolution is half CSS so cells render as chunky dither blocks.
  const bcols = Math.ceil(width / 2)
  const brows = Math.ceil(height / 2)
  const cellPx = Math.max(2, Math.round(cell / 2))

  // The RAF loop reads latest props via a ref (written in an effect).
  const stateRef = useRef({ cells, cap, top, color, animate, animationDuration })
  useEffect(() => {
    stateRef.current = { cells, cap, top, color, animate, animationDuration }
  })

  useEffect(() => {
    const canvas = canvasRef.current
    const c = canvas?.getContext("2d")
    if (!(canvas && c) || width <= 0 || height <= 0) return
    canvas.width = bcols
    canvas.height = brows

    const bloomCanvas = bloomRef.current
    const bloomCtx = bloomCanvas?.getContext("2d") ?? null
    if (bloomCanvas) {
      bloomCanvas.width = bcols
      bloomCanvas.height = brows
    }

    const reduce = prefersReducedMotion()
    let raf = 0
    let animStart = 0
    let lastSig = ""
    let intensity = 0

    const paint = (prog: number, it: number) => {
      const s = stateRef.current
      const seed = PALETTE[s.color]
      c.clearRect(0, 0, bcols, brows)
      const revealCol = easeOutCubic(prog) * (weeks + 1)
      for (const cellData of s.cells) {
        if (cellData.col > revealCol) continue
        const t = clamp01(cellData.value / s.cap)
        const bx = Math.round((cellData.col * pitch) / 2)
        const by = Math.round((s.top + cellData.row * pitch) / 2)
        for (let y = 0; y < cellPx; y++) {
          for (let x = 0; x < cellPx; x++) {
            const lit = BAYER[y & 3][x & 3] < t * 1.05 + it * 0.08
            const alpha = t <= 0 ? 0.07 : lit ? 0.3 + 0.68 * t : 0.1
            c.fillStyle =
              t <= 0 ? rgb(PALETTE.grey.fill, 1, alpha) : rgb(seed.fill, 1, alpha)
            c.fillRect(bx + x, by + y, 1, 1)
          }
        }
      }
    }

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      const s = stateRef.current
      if (!animStart) animStart = now
      const prog =
        s.animate && !reduce ? Math.min(1, (now - animStart) / s.animationDuration) : 1
      const itTarget = tipRef.current ? 1 : 0
      const it = Math.abs(itTarget - intensity) < 0.01 ? itTarget : intensity + (itTarget - intensity) * 0.16
      intensity = it
      const sig = `${prog.toFixed(3)}|${it.toFixed(2)}|${s.cells.length}`
      if (sig !== lastSig) {
        lastSig = sig
        paint(prog, it)
        if (bloomCtx) {
          bloomCtx.clearRect(0, 0, bcols, brows)
          if (bloom !== "off") bloomCtx.drawImage(canvas, 0, 0)
        }
      }
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bcols, brows, width, height, pitch, cellPx, weeks, bloom])

  const pickCell = (clientX: number, clientY: number) => {
    const el = ref.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const px = clientX - rect.left
    const py = clientY - rect.top
    const col = Math.floor(px / pitch)
    const row = Math.floor((py - top) / pitch)
    if (col < 0 || col >= weeks || row < 0 || row >= 7) return null
    const cellData = cells.find((d) => d.col === col && d.row === row)
    if (!cellData) return null
    return {
      x: col * pitch,
      y: top + row * pitch,
      text: formatTooltip(cellData.date, cellData.value),
    }
  }

  const bloomStyle = bloomLayerStyle(bloom, true)
  const busy = cells.filter((d) => d.value > 0).length

  return (
    <div
      ref={ref}
      role="img"
      aria-label={ariaLabel ?? `Activity over the last ${weeks} weeks — ${busy} active days`}
      className={cn("relative inline-block", className)}
      onPointerMove={(e) => setTip(pickCell(e.clientX, e.clientY))}
      onPointerLeave={() => setTip(null)}
    >
      {months.map((m, i) => (
        <span
          key={i}
          className="absolute font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)]"
          style={{ left: m.x, top: 0 }}
        >
          {m.label}
        </span>
      ))}
      {width > 0 && (
        <>
          <canvas
            ref={canvasRef}
            className="pointer-events-none block"
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
      {tip && (
        <span
          className="pointer-events-none absolute z-10 whitespace-nowrap rounded border border-[var(--border)] bg-[var(--bg)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text)]"
          style={{ left: Math.max(0, Math.min(tip.x, width - 90)), top: tip.y - 22 }}
        >
          {tip.text}
        </span>
      )}
    </div>
  )
}
