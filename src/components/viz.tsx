"use client";

import { useEffect, useRef } from "react";

/**
 * Shared data-viz primitives — single source of truth for health bars,
 * trend indicators, and history sparklines. Used by /leaderboard,
 * /protocol (health analytics dashboard), and /history.
 */

// 4x4 Bayer ordered dither matrix, normalized by 16.
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

export function resolveColor(value: string): { r: number; g: number; b: number } | null {
  if (typeof document === "undefined") return null;
  const div = document.createElement("div");
  div.style.color = value.startsWith("var(") ? value : value;
  div.style.display = "none";
  document.body.appendChild(div);
  const rgb = getComputedStyle(div).color;
  document.body.removeChild(div);
  const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(rgb);
  if (!m) return null;
  return { r: parseInt(m[1], 10), g: parseInt(m[2], 10), b: parseInt(m[3], 10) };
}

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let s = 0;
  let h = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function healthColor(score: number): string {
  return score >= 80 ? "var(--success)" : score >= 50 ? "var(--warning)" : "var(--danger)";
}

/** Dithered horizontal fill for progress bars and health bars. */
function DitheredFill({
  value,
  color,
  height,
  className,
  transition = "width 0.6s ease-out",
}: {
  value: number;
  color: string;
  height: number;
  className?: string;
  transition?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    function draw() {
      rafRef.current = 0;
      if (!container || !canvas) return;
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(height * dpr));
      if (canvas.width === w && canvas.height === h) return;
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${height}px`;

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      const rgb = resolveColor(color);
      if (!rgb) return;

      ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.75)`;
      ctx.fillRect(0, 0, w, h);

      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;
      for (let row = 0; row < h; row++) {
        for (let col = 0; col < w; col++) {
          const idx = (row * w + col) * 4;
          const a = data[idx + 3];
          if (a === 0) continue;
          const threshold = (BAYER[row % 4][col % 4] / 16) * 255;
          if (a > threshold) {
            data[idx] = rgb.r;
            data[idx + 1] = rgb.g;
            data[idx + 2] = rgb.b;
            data[idx + 3] = 255;
          } else {
            data[idx + 3] = 0;
          }
        }
      }
      ctx.putImageData(imageData, 0, 0);
    }

    function scheduleDraw() {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(draw);
    }

    const ro = new ResizeObserver(scheduleDraw);
    ro.observe(container);
    scheduleDraw();
    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
  }, [color, height, value]);

  return (
    <div ref={containerRef} className={className} style={{ width: `${value}%`, height, transition }}>
      <canvas ref={canvasRef} aria-hidden="true" />
    </div>
  );
}

/** Horizontal 0–100 score bar with % label. Fills its container when width is omitted. */
export function HealthBar({ score, width }: { score: number; width?: number }) {
  const color = healthColor(score);
  return (
    <div className="flex items-center gap-2" style={width ? undefined : { flex: 1 }}>
      <div className="h-1.5 bg-[var(--border)] rounded-md overflow-hidden" style={{ width: width ? width : undefined, flex: width ? undefined : 1 }}>
        <DitheredFill value={score} color={color} height={6} className="rounded-md" />
      </div>
      <span className="font-bold text-sm min-w-[36px]" style={{ color }}>{score}%</span>
    </div>
  );
}

/** ↑/↓/→ trend arrow, optionally with a text label. */
export function TrendBadge({ trend, showLabel = false }: { trend: "up" | "down" | "stable"; showLabel?: boolean }) {
  const [color, arrow, label] =
    trend === "up"
      ? ["var(--success)", "↑", "Improving"]
      : trend === "down"
        ? ["var(--danger)", "↓", "Declining"]
        : ["var(--text-muted)", "→", "Stable"];
  return (
    <span className="text-base" style={{ color }}>
      {arrow}
      {showLabel ? ` ${label}` : ""}
    </span>
  );
}

/**
 * Inline dithered canvas sparkline for a chronological series of 0–100 health scores.
 * Fixed 0–100 y-scale so shapes are comparable across cards.
 */
export function Sparkline({ values, width = 96, height = 28 }: { values: number[]; width?: number; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || values.length < 2) return;
    const dpr = window.devicePixelRatio || 1;
    const scaledWidth = Math.round(width * dpr);
    const scaledHeight = Math.round(height * dpr);
    canvas.width = scaledWidth;
    canvas.height = scaledHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const pad = 2;
    const step = (width - pad * 2) / (values.length - 1);
    const y = (v: number) => pad + (1 - v / 100) * (height - pad * 2);
    const color = healthColor(values[values.length - 1]);
    const rgb = resolveColor(color);
    if (!rgb) return;

    // Draw a semi-transparent thick stroke so the ordered dither gives a
    // retro stippled line rather than a hard antialiased edge.
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`;
    ctx.beginPath();
    ctx.moveTo(pad, y(values[0]));
    for (let i = 1; i < values.length; i++) {
      ctx.lineTo(pad + i * step, y(values[i]));
    }
    ctx.stroke();

    // End dot.
    const lastX = pad + (values.length - 1) * step;
    const lastY = y(values[values.length - 1]);
    ctx.beginPath();
    ctx.arc(lastX, lastY, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`;
    ctx.fill();

    // Apply Bayer ordered dither to the alpha channel.
    const imageData = ctx.getImageData(0, 0, scaledWidth, scaledHeight);
    const data = imageData.data;
    for (let row = 0; row < scaledHeight; row++) {
      for (let col = 0; col < scaledWidth; col++) {
        const idx = (row * scaledWidth + col) * 4;
        const a = data[idx + 3];
        if (a === 0) continue;
        const threshold = (BAYER[row % 4][col % 4] / 16) * 255;
        if (a > threshold) {
          data[idx] = rgb.r;
          data[idx + 1] = rgb.g;
          data[idx + 2] = rgb.b;
          data[idx + 3] = 255;
        } else {
          data[idx + 3] = 0;
        }
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }, [values, width, height]);

  if (values.length < 2) return null;
  return <canvas ref={canvasRef} width={width} height={height} aria-label="Health score history" role="img" />;
}

/** Compact stat tile for dashboard summary rows. */
export function StatTile({ icon, value, label }: { icon: string; value: string | number; label: string }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-5 py-3 flex-1 min-w-[140px] text-center">
      <div className="text-lg">{icon}</div>
      <div className="text-2xl font-extrabold mt-1">{value}</div>
      <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider">{label}</div>
    </div>
  );
}

/** Labeled thin progress bar for coverage percentages. */
export function CoverageBar({ label, value, color = "var(--accent)" }: { label: string; value: number; color?: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-[var(--text-muted)]">{label}</span>
        <span className="tabular-nums">{value}%</span>
      </div>
      <div className="h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
        <DitheredFill value={value} color={color} height={6} className="rounded-full" transition="width 0.3s ease-out" />
      </div>
    </div>
  );
}

/** Small numeric stat cell for insight grids. */
export function MiniStat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="bg-[var(--bg)] rounded-lg p-2 text-center">
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
    </div>
  );
}

export interface CriticalTableRow {
  name: string;
  failingTests: number;
  downstreamCount: number;
  risk: string;
}

/** Risk-dotted list of critical tables (failing tests × downstream dependents). */
export function CriticalTablesList({ tables }: { tables: CriticalTableRow[] }) {
  if (tables.length === 0) return null;
  return (
    <div>
      <h4 className="text-xs font-medium text-[var(--text-muted)] mb-2">Critical Tables</h4>
      <div className="space-y-1.5">
        {tables.map((ct) => (
          <div key={ct.name} className="flex items-center gap-2 text-xs bg-[var(--bg)] rounded-lg px-3 py-2">
            <span className={`w-2 h-2 rounded-full shrink-0 ${
              ct.risk === "critical" ? "bg-[var(--danger)]" : ct.risk === "high" ? "bg-[var(--warning)]" : "bg-[var(--border)]"
            }`} />
            <span className="font-medium truncate">{ct.name}</span>
            <span className="text-[var(--text-muted)] ml-auto shrink-0">
              {ct.failingTests > 0 && `${ct.failingTests} failing`}
              {ct.failingTests > 0 && ct.downstreamCount > 0 && " · "}
              {ct.downstreamCount > 0 && `${ct.downstreamCount} dependents`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Chip row of lineage hotspots (most-connected tables). */
export function HotspotChips({ hotspots, title = "High-traffic tables" }: { hotspots: { name: string; connections: number }[]; title?: string }) {
  if (hotspots.length === 0) return null;
  return (
    <div>
      <h4 className="text-xs font-medium text-[var(--text-muted)] mb-2">{title}</h4>
      <div className="flex flex-wrap gap-1.5">
        {hotspots.map((h) => (
          <span key={h.name} className="text-xs px-2 py-1 rounded bg-[var(--bg)] text-[var(--text-muted)]">
            {h.name} <span className="text-[var(--accent)]">({h.connections})</span>
          </span>
        ))}
      </div>
    </div>
  );
}
