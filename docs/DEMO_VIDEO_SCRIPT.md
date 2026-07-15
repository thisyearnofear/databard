# Demo Video Narration Script (60-90 seconds)
## For recorded demo playback during pitch

**Target: 75 seconds of narration over screen recording**

---

## Scene 1: Landing page (8 seconds)

**Visual:** Open `https://databard.persidian.com/?persona=onchain` — Onchain persona hero page

**Narration:**
> "DataBard connects to any data catalog and turns data health into a two-minute audio briefing — anchored on Solana, so every report is publicly verifiable."

---

## Scene 2: Dashboard (20 seconds)

**Visual:** Click "Try the demo" → lands on `/protocol` dashboard. Hover the fleet health chart, spotlight Uniswap series. Scroll to "What changed this week" trend narrative.

**Narration:**
> "Here's this week's briefing. Six protocols tracked, health scores computed from real schema metadata. Uniswap Analytics dropped 11 points — new test failures in the whale-trades pipeline, cascading to 8 downstream tables. The trend narrative tells you what changed and what to fix first."

---

## Scene 3: Audio briefing (15 seconds)

**Visual:** Click "▶ Listen to this analysis" → audio plays. Show the waveform animating. Let 15 seconds of audio play (the harshest finding moment).

**Narration:**
> "Two AI hosts walk you through the findings in two minutes. The synthesis is the moat — you can't read 47 rows of test results aloud. You have to distill."

---

## Scene 4: On-chain attestation (20 seconds)

**Visual:** Navigate to episode page → click "Mint attestation" (wallet pre-connected, devnet) → show the transaction confirming → navigate to `/verify` → paste the hash → green "Verified" check → show Explorer link

**Narration:**
> "One click attests the report on Solana. The SHA-256 is written via Memo program — costs about five ten-thousandths of a cent. Anyone can verify the hash against the report with one RPC call. No trust in our servers required."

---

## Scene 5: Leaderboard (12 seconds)

**Visual:** Navigate to `/leaderboard` — 6 protocols with badges, health scores, "Claim your protocol" buttons

**Narration:**
> "This is the public registry. Protocols want to be on it because verified health is marketing — and their marketing is our distribution channel."

---

## Total: ~75 seconds

---

## Recording Notes

- **Browser:** Clean profile, dark theme, 125% zoom for projector visibility
- **Audio:** Play 15s of the actual briefing audio during Scene 3 — pick the harshest finding moment
- **Wallet:** Pre-connect Phantom (devnet), pre-fund with 0.05+ devnet SOL
- **Seed data:** Run `POST /api/demo/seed` before recording to ensure all 6 protocols are populated
- **Timing:** Keep cuts tight — no dead air between scenes
- **Voiceover:** ElevenLabs TTS, professional voice, confident pace
- **Background music:** Subtle, low volume, builds slightly during the attestation moment
