/* dither.js — dependency-free port of DataBard's dither-kit for the Anna
   bundle: the half-annulus Gauge, the Meter bar, and the PixelIcon glyph
   set. Ordered (Bayer) dither, alpha-modulated — one hue, opacity varies,
   so it reads on both light and dark themes. Painters are pure functions
   of (value, size, theme): they emit fill ops, never read the DOM. */

export const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((row) => row.map((v) => (v + 0.5) / 16));

const BORDER_ALPHA = 0.72;
const OFF_TIER = 0.4;
export const CELL = 2; // css px per dither cell

export const PALETTE = {
  green: [40, 210, 110],
  orange: [255, 150, 50],
  red: [240, 70, 70],
  grey: [92, 92, 100],
  purple: [150, 110, 255],
};

export const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
export const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Same thresholds as src/lib/product/score-tone.ts. */
export function scoreTone(score) {
  return score >= 80 ? "good" : score >= 50 ? "warn" : "bad";
}
export function scoreDitherColor(score) {
  const t = scoreTone(score);
  return t === "good" ? "green" : t === "warn" ? "orange" : "red";
}

export function backingSize(width, height) {
  return {
    cols: Math.min(520, Math.max(8, Math.round(width / CELL))),
    rows: Math.min(200, Math.max(8, Math.round(height / CELL))),
  };
}

/** paintGauge(fill, {width, height}, frac 0..1, {ticks, max, color})
 *  fill(x, y, cssColor) — one call per backing-canvas cell. Mirrors the
 *  web Gauge paint(): track ring, threshold notches, rim-dense value arc
 *  sweeping left→right, bright leading edge. */
export function paintGauge(fill, { width, height }, frac, opts = {}) {
  const { cols, rows } = backingSize(width, height);
  const color = PALETTE[opts.color ?? "green"];
  const track = PALETTE[opts.trackColor ?? "grey"];
  const max = opts.max ?? 100;
  const tickAngles = (opts.ticks ?? []).map((t) => Math.PI + clamp01(t / max) * Math.PI);

  const pad = 4;
  const cx = width / 2;
  const cy = height * 0.88;
  const outerR = Math.max(8, Math.min(width / 2 - pad, cy - pad));
  const innerR = outerR * 0.62;
  const span = outerR - innerR;
  const reveal = Math.PI + frac * Math.PI;

  for (let y = 0; y < rows; y++) {
    const py = ((y + 0.5) * height) / rows;
    for (let x = 0; x < cols; x++) {
      const px = ((x + 0.5) * width) / cols;
      const dx = px - cx;
      const dy = py - cy;
      const r = Math.hypot(dx, dy);
      if (r > outerR || r < innerR) continue;
      let a = Math.atan2(dy, dx);
      if (a < 0) a += Math.PI * 2;
      if (a < Math.PI) continue;

      let notched = false;
      for (const ta of tickAngles) {
        if (Math.abs(a - ta) * r < 1.4 && r > innerR + span * 0.3) { notched = true; break; }
      }
      if (notched) { fill(x, y, rgba(track, 0.85)); continue; }

      const density = (r - innerR) / Math.max(span, 1);
      if (a <= reveal) {
        if (outerR - r < 1.4 || (reveal - a) * r < 1.6) {
          fill(x, y, rgba(color, Math.min(1, BORDER_ALPHA)));
          continue;
        }
        const lit = density > BAYER[y & 3][x & 3];
        const k = 0.35 + density * 0.65;
        fill(x, y, rgba(color, Math.min(1, lit ? k : k * OFF_TIER)));
      } else {
        const lit = BAYER[y & 3][x & 3] < 0.55;
        fill(x, y, rgba(track, lit ? 0.2 + density * 0.1 : 0.08));
      }
    }
  }
}

/** paintMeter(fill, {width, height}, frac 0..1 reveal, {value, max, color})
 *  One-segment bar: dense stacked gradient, bright leading edge, quiet
 *  Bayer track. Mirrors meter.tsx paint() with stacked:true. */
export function paintMeter(fill, { width, height }, frac, opts = {}) {
  const { cols, rows } = backingSize(width, height);
  const color = PALETTE[opts.color ?? "green"];
  const max = opts.max ?? 100;
  const end = clamp01((opts.value ?? 0) / max);
  const reveal = frac * (cols - 1);
  const tickCols = new Set((opts.ticks ?? []).map((t) => Math.round(clamp01(t / max) * (cols - 1))));

  for (let x = 0; x < cols; x++) {
    const fx = x / Math.max(cols - 1, 1);
    if (fx <= end + 1e-9 && x <= reveal && !tickCols.has(x)) {
      for (let y = 0; y < rows; y++) {
        // stacked bar: solid floor, density 0.5→1 upward
        const density = 0.5 + 0.5 * (y / Math.max(rows, 1));
        const lit = density > BAYER[y & 3][x & 3];
        const k = 0.3 + density * 0.7;
        fill(x, y, rgba(color, clamp01(lit ? k : k * OFF_TIER)));
      }
      if (x >= Math.floor(reveal)) {
        for (let y = 0; y < rows; y++) fill(x, y, rgba(color, 0.95));
      }
    } else {
      for (let y = 0; y < rows; y++) {
        if (BAYER[y & 3][x & 3] < 0.5) fill(x, y, rgba(PALETTE.grey, 0.12));
      }
    }
  }
}

/** Draw via a real 2d context (bundle UI) — thin adapter over the pure
   painters so tests can hash the emitted pixels instead. */
export function drawGauge(ctx, size, frac, opts) {
  const { cols, rows } = backingSize(size.width, size.height);
  // backing canvas IS the cell grid — CSS stretches it back up pixelated
  ctx.canvas.width = cols;
  ctx.canvas.height = rows;
  ctx.clearRect(0, 0, cols, rows);
  paintGauge((x, y, css) => { ctx.fillStyle = css; ctx.fillRect(x, y, 1, 1); }, size, frac, opts);
}
export function drawMeter(ctx, size, frac, opts) {
  const { cols, rows } = backingSize(size.width, size.height);
  ctx.canvas.width = cols;
  ctx.canvas.height = rows;
  ctx.clearRect(0, 0, cols, rows);
  paintMeter((x, y, css) => { ctx.fillStyle = css; ctx.fillRect(x, y, 1, 1); }, size, frac, opts);
}

/** PixelIcon glyphs needed here — pass / partial / fail / arrow / warning —
   rendered as crisp SVG rects. Ported verbatim from icon.tsx bitmaps. */
export const GLYPHS = {
  pass: ["00000000", "00000001", "00000011", "10000110", "11001100", "01111000", "00110000", "00000000"],
  partial: ["00000000", "00000000", "00000000", "11111111", "11111111", "00000000", "00000000", "00000000"],
  fail: ["00000000", "01000010", "01100110", "00111100", "00111100", "01100110", "01000010", "00000000"],
  arrow: ["00011000", "00111100", "01111110", "00011000", "00011000", "00011000", "00011000", "00000000"],
  warning: ["00011000", "00011000", "00111100", "00111100", "01111110", "01100110", "11111111", "11111111"],
};

const SVG_NS = "http://www.w3.org/2000/svg";

/** icon(name, size) → crisp-edged 8×8 SVG element (currentColor). */
export function icon(name, size = 14) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.setAttribute("viewBox", "0 0 8 8");
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("px-icon");
  GLYPHS[name].forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== "1") { x++; continue; }
      let end = x;
      while (end < row.length && row[end] === "1") end++;
      const r = document.createElementNS(SVG_NS, "rect");
      r.setAttribute("x", x); r.setAttribute("y", y);
      r.setAttribute("width", end - x); r.setAttribute("height", 1);
      svg.append(r);
      x = end;
    }
  });
  return svg;
}
