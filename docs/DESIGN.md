# DESIGN.md — the surface contract

What "consistent" means for DataBard surfaces. Two halves: mechanical rules
(enforced by `npm run check:surfaces`, wired into `test:unit`) and judgment
rules (enforced by review). Surfaces may differ in register — the landing is
editorial, the dashboard is terminal — but the invariants below hold on all of
them.

## Enforced by `scripts/check-surface-rules.mjs`

1. **No pictographic emoji in UI.** Use `PixelIcon` from
   `src/components/dither-kit/icon.tsx` (8×8 bitmaps, crisp SVG). If the right
   glyph doesn't exist, add one to the set rather than shipping an emoji.
   Typographic marks are fine: `✓ ✗ → · —` etc.
   Exempt: `src/app/api/**` and `src/lib/**` — server-rendered output (OG PNGs,
   SVG badges, email/webhook text, RSS) where PixelIcon can't run.
2. **No hardcoded hex colors in UI.** Use the CSS vars (`var(--bg)`,
   `var(--surface)`, `var(--accent)`, `var(--danger)`, `var(--warning)`,
   `var(--success)`, `var(--text-muted)`…) from `globals.css`. Exempt paths are
   the same as above plus files that legitimately own raw color
   (`score-tone.ts`, `dither-kit` internals). One-off escape hatch:
   `// surface-rules: allow` on the line.
3. **`target="_blank"` requires `rel="noopener noreferrer"`.** Applies
   everywhere, no exemptions.

## Judgment rules (not scriptable — check in review)

- **Score color comes from `scoreTextClass` / `score-tone.ts`.** Never invent
  a second score→color mapping; the OG image and the UI must agree.
- **Every meaningful action is tracked.** New CTAs fire a whitelisted `track()`
  event (`src/lib/events.ts`); meta stays ≤5 string keys. If a door isn't
  measured, it doesn't ship.
- **Honest labels.** Sample/demo data is marked, stale editions say so, Probe
  "not reached" ≠ "accused". Markers travel with the artifact, not just the
  page chrome.
- **CTA hierarchy:** one accent-primary action per view; secondary actions are
  bordered/ghost. If two buttons feel equal, one is wrong.
- **Touch + keyboard:** `min-h-11` on tap targets, visible `focus-visible`
  states, semantic buttons (`<button>` not clickable `<div>`), menus keep
  `role="menu"`/`menuitem` + Escape handling.
- **Motion vocabulary:** `enter-up` / `animate-slide-up` / `animate-fade-in`.
  Don't introduce new easing or stagger schemes.
- **Type:** `font-display` (Space Grotesk) for headings, score numerals, and
  nothing else; `font-mono` for kickers/labels; body stays system-ui.

## Adding a new surface

1. Reuse primitives before writing new ones: `PixelIcon`, `CopyButton`,
   `ScoreCardView`, `ReportLink`, `IntegrationCTA`, `dither-kit` charts.
2. Add a render assertion to `tests/report-surfaces.unit.tsx` (the convention:
   `renderToStaticMarkup` + content/ARIA checks) and cover the golden path in
   Playwright if it's a money surface.
3. `npm run check:surfaces && npm run test:e2e` before merge.
4. New PixelIcon glyphs go in `icon.tsx` — 8×8 bitmap strings, `1` = filled.

## The litmus test

A new surface is consistent if a reviewer can answer "which rule does this
violate?" — not "does this feel off?". If the rules don't cover a case, add
the rule here first, then build the surface.
