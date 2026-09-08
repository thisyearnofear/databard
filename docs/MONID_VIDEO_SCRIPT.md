# MONID HACKATHON — VIDEO SCRIPT v2: "The Data Garden"

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

## Production status
- `video/` — Remotion composition scaffolded; real numbers wired as props.
  Render with `cd video && npm run render` (see `video/README.md`).
- Fallback path (no render): static illustrated frames + Ken Burns + this script
  in any editor; all copy is final here.

---

## Platform captions (post with `#monid` + register URL within 24h)

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
