# MONID HACKATHON — VIDEO SCRIPT v2: "The Data Garden"

> **Status — historical draft, Sep 17, 2026.** The word-for-word script and
> platform captions below are archived copy: they contain unverified competitor
> claims and the $0.006 data-fetch framing that must not be published as-is (see
> `MONID_HACKATHON.md`, "Historical competitor claims"). The approved-for-work
> narration lives in `scripts/video/kindness-tts.mjs` (`CLIPS`). No silent
> master, final MP4, or audio manifest exists in this checkout — all render,
> review, and publication steps below are **pending**, not done.

**Format:** Remotion-rendered 16:9 master, ~85s, caption-safe (burned-in subs)
**Aesthetic:** Cottagecore field-guide / paper-cutout meadow. Warm greens, butter
yellow, terracotta, grain overlay. Terminal windows sit ON paper cards inside the
garden — real JSON, never mocked.
**Tone:** "Kill them with kindness." Gratitude to Dune, optionality for the user.
**Thumbnail frame:** 0:03 — elegant serif *"We Kill (Them With Kindness)"* with a
butterfly landing on the word "Kill."

Timing per scene = Remotion sequence numbers in `video/src/DataGarden.tsx`.
Real data wired as props from the live API response: score **95**, rows **43**,
cost **$0.006**, runIds from the verified runs.

---

## Scene-by-scene + word-for-word VO

### S1 — THE FOUNDATION (0:00–0:12) · gratitude, not grievance
**Visual:** Pristine meadow, morning light. A large sunflower labelled
"DUNE" — tall, established, roots visible in cross-section. Text overlay:
**"Thank you, Dune."** Then smaller: "free tier → view-only · Sep 10 (per public
reports). Fair enough — seats cost money."
**VO (warm, unhurried):**
> "Dune is the backbone of this industry. Every analyst alive cut their teeth
> there — and their free tier just went view-only. Honestly? Fair. Seats cost
> money."

### S2 — THE SEED (0:12–0:24) · enter Monid
**Visual:** A seed drifts down on the breeze (butterfly escorts it) and lands in
the soil beside the sunflower. The seed is labelled `monid`. Signpost in the
meadow reads: **"1,900+ metered endpoints · one key."** Smaller card:
`surf /dex/token/price — $0.006/call · stable · verified ✓`
**VO:**
> "Monid is the OpenRouter for agent tools — one key, nineteen hundred metered
> endpoints, each with a price per call. We picked a flower off the shelf: live
> DEX price bars. Six-tenths of a cent."

### S3 — THE BLOOM (0:24–0:42) · one call, the whole product
**Visual:** Paper card with the REAL curl (static text, crisp, on the grain
texture). A vine pulls in the response: **95/100 · healthy · 43 rows** rendered
as a flower opening — one petal per passing test. Deer lifts its head calmly.
Dashboard card fades in behind with recommended actions ("Assign owners to 1
table").
**VO:**
> "One call. DataBard runs the endpoint, scores the data's health, and writes
> the recommendations. No login. No seat. The garden tends itself."

### S4 — THE RECEIPT (0:42–1:00) · the emotional peak
**Visual:** The JSON `monidCost` object unfurls like a fern from the soil; roots
visibly connect it to the Dune sunflower's roots. Big numeral **$0.006** grows
as a bloom. Divider card: **"≈58,000 runs for one month of the seat."** Squirrel
freezes mid-nibble, looks at camera.
**VO:**
> "And this isn't an estimate — the run result carries its own measured cost.
> Six-tenths of a cent, on live data, with a receipt. Not a replacement for
> Dune. An option their pricing left behind."

### S5 — THE SONG (1:00–1:15) · the synthesis
**Visual:** Two songbirds on a branch (Alex & Morgan), tiny music notes; the
waveform + transcript snippet of the real briefing audio. Small x402 badge:
**"USDT · settles only after success."**
**VO:**
> "It doesn't just score the garden — it sings about it. Two analysts, one
> audio briefing, delivered to any agent over x402. Payment settles only if the
> analysis succeeds."

### S6 — THE CLOSE (1:15–1:25)
**Visual:** Wide shot of the meadow; the monid flower and the Dune sunflower
side by side, roots intertwined. End card serif: **"We Kill (Them With
Kindness)."** Sub: **"Any Monid endpoint · a health score · a narration · the
exact cents it cost."** Judge-verification curl URL + QR. Single warm acoustic
motif ends.
**VO:**
> "Thank you for the foundation, Dune. We'll keep watching the data — per call,
> with a receipt. We killed them with kindness."

---

## Judge-verifiability (baked into S3/S6)
Real curl shown on screen:
`POST https://databard.persidian.com/api/mcp/health-check` with
`{"source":"monid","schemaFqn":"monid.surf.ohlcv","monid":{"provider":"surf","endpoint":"/dex/token/price","queryParams":{...}}}`
→ score 95, 43 rows, `monidCost` receipt. Any judge can run it before the video
ends.

## Production status (as of Sep 9, 2026)

### V3 — branded master plan (historical render reported; regeneration pending)
**Approach:** Dropped the cottagecore garden. Rebuild in DataBard's product
tokens (dark `#0a0a0f`, Space Grotesk, accent `#7c5bf5`, success `#5bf58c`,
Bayer dither health bar, Alex purple / Morgan green). Same kindness thesis;
visual language matches `/protocol` and the score card.

| Artifact | Detail |
|---|---|
| `video/out/databard-kindness-silent.mp4` | **85s · 1920×1080 · silent · approve this** |
| `video/out/review/*.png` | One still per beat |
| Garden V1/V2 | Archived drafts only — do not ship |

**Scene map (85s):** Hook 8s → Seat 12s → Reach 12s → One call 16s → Receipt 16s → Briefing 12s → Close 9s.

**Next after approval (regeneration prerequisites — none of these artifacts are
present in this checkout):** restore or re-render `video/out/databard-kindness-silent.mp4`
(85s, 1920×1080), then run
`node scripts/video/kindness-tts.mjs --check --mux` (offline validation of
master, timing, and cache). Use `--generate --mux --reuse` only when paid TTS
is approved. Cache entries are invalidated by text, voice, model, settings or
output-format changes and checked against audio hashes. A first run without
cached audio is expected to fail the offline check; it is
not a requirement to pass it before explicitly approving generation.
`ELEVENLABS_API_KEY` is required for new audio. Requires `ffmpeg`/`ffprobe` on PATH.

Offline helper tests run in `npm run test:unit`. For the isolated, synthetic
end-to-end test (FFmpeg required), run
`DATABARD_TEST_MEDIA=1 node --test tests/kindness-audio.unit.mjs`. It copies the
scripts to a temporary workspace, mocks all TTS calls, checks output streams
and duration, and removes its fixtures. No real narration or final cut is
validated by this test.

### Earlier drafts (superseded)
- V1 SVG garden: `video/out/databard-monid.mp4` (88s)
- V2 AI-background attempt: plates in `video/public/s*_hd.jpg`; never correctly in the cut; abandoned for brand integrity

### Runtime notes
```bash
cd video
npx remotion render src/index.ts DataGarden out/frames-kindness \
  --sequence --image-format png \
  --browser-executable node_modules/.remotion/.chromium/mac_arm-1002410/chrome-mac/Chromium.app/Contents/MacOS/Chromium
ffmpeg -y -framerate 30 -i out/frames-kindness/element-%04d.png \
  -c:v libx264 -pix_fmt yuv420p -crf 18 out/databard-kindness-silent.mp4
```

---

## Platform captions — UNREVIEWED DRAFT (unverified claims above; rewrite before posting)

**X / Twitter**
> Thank you, Dune. We killed them with kindness.
>
> Your free tier goes view-only — fair, seats cost money. So we built the
> monitoring that doesn't need a seat: any Monid endpoint → health score,
> narration, and the measured cost. This run: $0.006. Receipt included. 🌻
>
> Verifiable with one curl 👇 #monid [register URL]

**LinkedIn**
> We entered Monid's "We Kill" hackathon — and chose to kill with kindness.
>
> Dune built the foundation of on-chain analytics. Their free tier going
> view-only is fair pricing, not a villain origin story. But it does leave a
> gap: continuous data-health monitoring used to require a seat.
>
> DataBard closes that gap with optionality: point it at any of Monid's 1,900+
> metered endpoints and get a health score, prioritised actions, and a narrated
> audio briefing — with the measured per-run cost carried through as a receipt
> (this one: $0.006). Built on the foundation Dune established. [register URL]

**Instagram / TikTok / YouTube Shorts** (9:16 crop, hook in first 2s)
> POV: the hackathon said "kill a SaaS" so we sent flowers. 🌻 Dune built the
> garden; we're just tending it per call. Score: 95/100. Cost: $0.006. Receipt:
> attached. #monid #data [register URL in bio]

**YouTube (long-form title)**
> We Kill (Them With Kindness) — DataBard × Monid, the $0.006 data analyst

## Asset inventory

### Generated backgrounds (Runware FLUX.1 [schnell])
| File | Scene | Dimensions |
|---|---|---|
| `s1_dawn_meadow_hd.jpg` | S1 — Foundation | 1920×1088 |
| `s2_seed_drift_hd.jpg` | S2 — The Seed | 1920×1088 |
| `s3_bloom_close_hd.jpg` | S3 — The Bloom | 1920×1088 |
| `s4_receipt_scene_hd.jpg` | S4 — The Receipt | 1920×1088 |
| `s5_songbirds_hd.jpg` | S5 — The Song | 1920×1088 |
| `s6_wide_close_hd.jpg` | S6 — The Close | 1920×1088 |

All stored in `video/public/` for Remotion `staticFile()` resolution.

### Rendered output
| File | Duration | Size |
|---|---|---|
| `video/out/databard-monid.mp4` | 88s | 3.4MB (V1, SVG-only) |
| `video/out/databard-monid-v2.mp4` | 88s | 6.6MB (V2, AI backgrounds) |
| `video/out/frames/` | 2640 PNGs | ~1920×1088 each |
