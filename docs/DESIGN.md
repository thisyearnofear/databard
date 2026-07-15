# DataBard Design System

A canonical reference for the visual language of DataBard. The goal is a distinctive, defensible aesthetic that is easy to maintain and hard to confuse with generic AI/observability tools.

## 1. Brand Position

DataBard is not a dashboard tool. It is an **AI analyst** that distills data health into a brief humans can actually consume. The interface should feel like a briefing, not a spreadsheet.

- **Tone:** Calm, precise, authoritative, with a hint of retro-digital personality.
- **Promise:** "Signal from noise."
- **Differentiator:** Dithered data visualization as a signature — charts that look like they were beamed from a focused, opinionated machine.

## 2. Aesthetic Direction: "Dithered Intelligence"

The visual identity is built on a contrast between two things:

1. **Clean, matte UI surfaces** — cards, type, controls.
2. **1-bit ordered-dither data marks** — the only place where the interface gets noisy, because that is where the data lives.

This makes the app feel like a modern analyst's console that still prints its charts on a retro CRT. It is distinctive without being childish.

### What we do

- Dark-first, high-contrast interfaces.
- Subtle rounded corners (`12px` / `16px`) on containers.
- Thin, low-contrast borders (`var(--border)`) to separate cards without shadow bloat.
- CSS-variable color tokens for every semantic color.
- Dithered canvas charts for health history and trends.
- System-adjacent typography for readability, one accent face for flavor if needed.

### What we do not do

- Gradient backgrounds or purple-on-white hero sections.
- Glassmorphism, blur-heavy overlays, or shadow-heavy cards.
- Chart libraries that look like stock dashboards.
- Generic emoji-only hierarchy (emoji are accents, never labels).
- `transition-all` — it is lazy and triggers unexpected layout work.

## 3. Color Tokens

All colors live as CSS custom properties in `src/app/globals.css` and are accessed through Tailwind as `bg-[var(--token)]`, `text-[var(--token)]`, etc.

### Palette

| Token | Default | Light | Usage |
| --- | --- | --- | --- |
| `--bg` | `#0a0a0f` | `#f5f5f7` | Page background |
| `--surface` | `#14141f` | `#ffffff` | Cards, pills, elevated containers |
| `--border` | `#2a2a3a` | `#d4d4d8` | Dividers, card borders, input borders |
| `--text` | `#e4e4ef` | `#18181b` | Primary text |
| `--text-muted` | `#8888a0` | `#71717a` | Secondary text, metadata, labels |
| `--accent` | `#7c5bf5` | `#6d4de6` | Primary actions, links, active states |
| `--accent-glow` | `#7c5bf540` | `#6d4de640` | Focus rings, subtle glows |
| `--accent-vivid` | `#a855f7` | `#a855f7` | Vivid gradient end, secondary host labels |
| `--accent-light` | `#a78bfa` | `#a78bfa` | Light accent text for metadata links |
| `--danger` | `#f55b5b` | `#dc2626` | Failing tests, alerts, errors |
| `--success` | `#5bf58c` | `#16a34a` | Healthy scores, passing states |
| `--warning` | `#f5c842` | `#ca8a04` | Health scores 50-79, warning states |

### Auxiliary palettes

| Token | Default | Light | Usage |
| --- | --- | --- | --- |
| `--palm` | `#3f6b4a` | `#3f6b4a` | Palm USD / Solana payment buttons |
| `--palm-light` | `#5a9b68` | `#4d8a5c` | Palm gradient end |
| `--palm-glow` | `#3f6b4a40` | `#3f6b4a30` | Palm glows |
| `--briefing-bg` | `#002b36` | `#002b36` | /briefing page background |
| `--briefing-surface` | `#112130` | `#112130` | /briefing card surfaces |
| `--briefing-surface-2` | `#001e26` | `#001e26` | /briefing inputs and code blocks |
| `--briefing-gold` | `#d4af37` | `#d4af37` | /briefing primary accent |
| `--briefing-teal` | `#2aa198` | `#2aa198` | /briefing links and secondary accent |
| `--briefing-muted` | `#93a1a1` | `#93a1a1` | /briefing secondary text |
| `--briefing-dim` | `#586e75` | `#586e75` | /briefing metadata and placeholders |
| `--briefing-text` | `#fdf6e3` | `#fdf6e3` | /briefing input text |
| `--briefing-code` | `#b58900` | `#b58900` | /briefing inline code |
| `--briefing-danger` | `#dc322f` | `#dc322f` | /briefing errors |

### Semantic color rules

- Health scores use `healthColor(score)` in `src/components/viz.tsx`:
  - `>= 80` → `--success`
  - `>= 50` → `--warning`
  - `< 50` → `--danger`
- Do not hardcode hex colors in components. Every color must resolve through a token.
- Do not use `color-mix(...)` in components unless the token is intended for opacity variants. Prefer `bg-[var(--accent)]/10` style opacity in Tailwind.

## 4. Typography

- **Primary:** `system-ui, -apple-system, sans-serif`
- **Monospace:** `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` for hashes, code, wallet addresses, and small technical labels.
- **Scale:** Tailwind defaults. Use `text-sm`, `text-xs` for data-dense UI.
- **Weights:** `font-medium` for labels, `font-semibold` for section headings, `font-bold` for hero numbers.
- **Uppercase tracking:** Use `uppercase tracking-wider` sparingly for section labels and metadata captions.

## 5. Layout & Components

### Container rhythm

- Centered, constrained layouts: `max-w-2xl`, `max-w-4xl`, `max-w-[900px]`.
- Page padding: `p-4 sm:p-8`.
- Card padding: `p-4` to `p-6`.
- Card gap: `gap-4` to `gap-6`.

### Cards

- Background: `bg-[var(--surface)]`
- Border: `border border-[var(--border)]`
- Radius: `rounded-xl` or `rounded-2xl`
- Hover (when clickable): `hover:border-[var(--accent)]/50 transition-colors`
- No box shadows by default. Depth is created by contrast, not elevation.

### Buttons

Primary CTA:
- `bg-[var(--accent)] text-[var(--bg)] rounded-xl px-6 py-3 font-medium`
- Press feedback: `active:scale-[0.97]`
- Transition: `transition-transform transition-colors duration-150 ease-out`

Secondary CTA:
- `bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded-xl px-6 py-3 font-medium`
- Hover: `hover:border-[var(--accent)] hover:text-[var(--accent)]`

Ghost / Link:
- `text-[var(--text-muted)] hover:text-[var(--text)] transition-colors`

### Inputs

- `bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm`
- Focus: `focus:border-[var(--accent)] outline-none` (global focus outline already defined in `globals.css`)

## 6. Motion

### Principles

1. **Motion explains state.** A card expanding, a tab switching, a toast arriving — movement should clarify where something came from and where it went.
2. **Motion is fast.** Most UI animations are under 200 ms.
3. **Motion is restrained.** Use one entrance animation per surface, not three.

### Easing curves

Add these to `globals.css` and use them everywhere:

```css
:root {
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
}
```

### Duration scale

| Element | Duration | Easing |
| --- | --- | --- |
| Button press | `100-150ms` | `ease-out` |
| Hover color/border | `150ms` | `ease` |
| Dropdown / select | `150-200ms` | `ease-out` |
| Modal / drawer | `200-300ms` | `ease-out` or `--ease-drawer` |
| Page section entrance | `300-400ms` | `ease-out` |
| Progress bar width | `300ms` | `ease-out` |

### Transitions checklist

- **Never use `transition-all` in production code.** Specify the property: `transition-colors`, `transition-transform`, `transition-opacity`, `transition-[width]`.
- `hover:brightness-110` does not animate with `transition-all` because `filter` is not in `all`. Use `opacity` or `background-color` for hover feedback, or accept that brightness is an instant change.
- `ease-in` is forbidden for UI animations. It feels slow off the line.
- Use `transform` for movement, not `top`/`left`/`margin`.
- Scale press feedback should be `0.97` (subtle), not `0.9`.

### Keyframes

Defined in `src/app/globals.css`:

- `animate-slide-up` — sections and cards entering.
- `animate-fade-in` — subtle content reveals.
- `animate-pulse-glow` — accent glows.
- `animate-spin` — loading spinner.
- `animate-ping` — status indicators.

## 7. Dithered Data Visualization

Dithered charts are the signature visual element. They are produced with the HTML5 Canvas API and a Bayer ordered-dither matrix.

### When to use

- Health score history (sparkline)
- Trend mini-charts
- Any time a small line/area chart needs to feel like part of DataBard, not a generic charting library

### When not to use

- Large, precise line charts with tooltips
- Anything where exact value reading is more important than shape
- Print/PDF exports where dithering may compress poorly

### Implementation

The canonical implementations are in `src/components/viz.tsx`: `Sparkline` for trend lines, `DitheredFill` for `HealthBar` and `CoverageBar` fills. The same canvas-dither pipeline can be extended for future chart components.

Key rules:
- Use `getContext("2d", { willReadFrequently: true })` for pixel reads.
- Scale the canvas to `devicePixelRatio` for crisp output.
- Resolve CSS variable colors to RGB before drawing.
- Apply a 4×4 Bayer matrix after drawing the source shape.
- Keep the dithered color at full opacity; transparency is achieved by removing pixels, not alpha blending.

### Future dither targets

| Component | Dither approach |
| --- | --- |
| `HealthBar` | Dithered fill mask for the bar, with a solid 1px leading edge |
| `CoverageBar` | Same as `HealthBar` but thinner |
| `MiniStat` sparkline | Reuse `Sparkline` inline |
| Hero landing chart | Larger dithered area chart with gradient threshold |

## 8. Iconography

- Emoji are used as affordance accents (📊, 🔥, 🔔, ⛓️).
- Emoji are not substitutes for labels. Always pair with text or an `aria-label`.
- For future growth, prefer an SVG icon set with a 1.5px stroke, rounded caps, and no fill.

## 9. Design Debt & Migration Notes

### Known issues to clean up

1. **Hardcoded colors outside tokens.** `src/lib/paper-canvas.ts`, `src/lib/notifications.ts` email HTML, `src/app/api/og/route.tsx`, and `src/app/api/badge/[schema]/route.ts` generated images still embed hardcoded hex/RGBA because they render outside the CSS-variable cascade. `src/components/EpisodePlayer.tsx` now resolves `var(--accent)` to HSL for its canvas waveform. These are intentional exceptions; do not introduce `style` attributes in main UI components.
2. **Inline styles alongside Tailwind.** Main app pages (`/history`, `/leaderboard`, `/protocol`, `/playlists`) have been cleaned. Only dynamic values (`width`, `height`, `left`, `animationDelay`, grid layout) remain in `src/components/viz.tsx`, `src/components/market/HashFingerprint.tsx`, `src/components/OnboardingTooltips.tsx`, `src/components/GenerationProgress.tsx`, `src/components/Skeleton.tsx`, and `src/components/market/WatchdogMonitor.tsx`.
3. **Missing warning token.** `healthColor` now uses `var(--warning)`; `--warning` is defined in `src/app/globals.css`.
4. **Transition `all` over the place.** `transition-all` has been removed from `src/`; remaining generic `transition` classes are intentional for elements that animate multiple properties (e.g., `hover:scale` + `hover:brightness-110`).
5. **`animate-fade-in` is defined in `globals.css` and used where appropriate.**
6. **Button press feedback is mostly standardized via `globals.css` `button:active { transform: scale(0.98); }`.** A few components use explicit `active:scale-[0.99]` or `active:scale-[0.97]` for larger CTAs; this is acceptable.

## 10. Examples

### A dithered source card

```tsx
<div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 hover:border-[var(--accent)]/50 transition-colors">
  <div className="flex items-center gap-2">
    <span className="text-xl">🕸️</span>
    <h3 className="text-lg font-bold">{name}</h3>
  </div>
  <div className="flex items-center gap-4 mt-3">
    <HealthBar score={score} />
    <TrendBadge trend={trend} />
    <Sparkline values={history} />
  </div>
</div>
```

### A primary button

```tsx
<button className="bg-[var(--accent)] text-[var(--bg)] rounded-xl px-6 py-3 font-medium transition-transform transition-colors duration-150 ease-out hover:brightness-110 active:scale-[0.97]">
  Connect your data
</button>
```

### A metadata label

```tsx
<span className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
  {label}
</span>
```

## 11. Decision Log

| Decision | Why |
| --- | --- |
| Dark-first | The product is an analytical tool; dark reduces eye strain and makes status colors pop. |
| Dithered charts | Distinctive, lightweight, dependency-free, and signals "machine-processed signal" rather than generic dashboard. |
| CSS variables in Tailwind | Keeps theming simple (enterprise vs. onchain vs. light/dark) and avoids leaking hardcoded colors. |
| System font | Performance, native feel, and avoids licensing/loading complexity. |
| No `transition-all` | Improves performance and makes intent explicit. |
