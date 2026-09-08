# DataBard × Monid — "The Data Garden" (Remotion)

The hackathon video composition. Full script/storyboard: `docs/MONID_VIDEO_SCRIPT.md`.

All on-screen numbers are **real** and flow in as props (score 95, 43 rows,
$0.006, verified runId) — see `src/Root.tsx` defaultProps. Update them from a
fresh `/api/mcp/health-check` response before rendering if you want a new take.

## Setup (isolated from the Next.js app)

```bash
cd video
npm install
npm run studio     # preview in the browser, tweak live
npm run render     # → out/databard-monid.mp4 (1920×1080, 88s)
```

This directory is excluded from the Next.js bundle guard (see
`scripts/check-bundle-size.mjs` — `video/` must never appear in
`.next/standalone/`).

## Scene map (frames @30fps)
| Scene | From | Content |
|---|---|---|
| S1 The Foundation | 0 | Thank you, Dune (sunflower + butterfly) |
| S2 The Seed | 360 | Monid discovery card, seed drifts down |
| S3 The Bloom | 720 | Real curl → 95/100 score flower, deer |
| S4 The Receipt | 1260 | monidCost JSON fern, $0.006 vs seat math |
| S5 The Song | 1800 | Alex & Morgan waveform, x402 badge |
| S6 The Close | 2250 | "We Kill (Them With Kindness)" end card |

## Voiceover
Record the VO from `docs/MONID_VIDEO_SCRIPT.md` (word-for-word) and add it via
`<Audio src={staticFile("vo.mp3")} />` per sequence, or lay it in your editor
after rendering. Keep captions burned in — most views are muted.
