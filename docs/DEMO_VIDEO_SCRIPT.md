# Demo Video Narration Script (60-90 seconds)
## For recorded demo playback during pitch

**Target: ~75 seconds of narration over screen recording**

---

## Scene 1: Opening (10 seconds)

**Visual:** Dark background, DataBard logo, animated stats counting up (61%, 2.3%, 12%)

**Narration:**
> "DataBard turns data health into something people actually consume — a two-minute audio briefing. Sixty-one percent of dashboards are never opened. Only two point three percent drive decisions. We built a report that travels."

---

## Scene 2: Dashboard (14 seconds)

**Visual:** Dashboard screenshot with zoom/pan. Fleet health chart, 6 protocols tracked. Highlight the Uniswap Analytics decline.

**Narration:**
> "Here's this week's briefing. Six protocols tracked, health scores computed from real schema metadata. Uniswap Analytics dropped eleven points — new test failures in the whale-trades pipeline, cascading to eight downstream tables."

---

## Scene 3: What Changed (15 seconds)

**Visual:** "What changed this week" trend narrative. Highlight the narrative text.

**Narration:**
> "The trend narrative tells you what changed and what to fix first. Tools say 'anomaly in table X' — nobody acts on that. People act on 'dropped eleven points, two new failures after Friday's deploy, here's the owner.' Narratives get acted on. Dashboards get skimmed."

---

## Scene 4: Audio Briefing (11 seconds)

**Visual:** Audio player with waveform animating. Play 10s of the actual briefing audio.

**Narration:**
> "Two AI hosts walk you through the findings in two minutes. The synthesis is the moat — you can't read forty-seven rows of test results aloud. You have to distill."

---

## Scene 5: On-Chain Attestation (16 seconds)

**Visual:** /verify page showing the green "Verified" check. SHA-256 hash, Solana Explorer link.

**Narration:**
> "For teams that need public trust, every report can be attested on Solana. The SHA-256 is written via Memo program — costs about five ten-thousandths of a cent. Anyone can verify the hash against the report with one RPC call. It's optional — most teams keep reports internal. But for protocols making public health claims, verifiable is worth more than claimed."

---

## Scene 6: Leaderboard (9 seconds)

**Visual:** Leaderboard page — 6 protocols with badges, health scores, "Claim your protocol" buttons

**Narration:**
> "This is the public registry. Protocols that want to be on it — their verified health is marketing. Their marketing is our distribution."

---

## Total: ~75 seconds

---

## Recording Notes

- **Browser:** Clean profile, dark theme, 125% zoom for projector visibility
- **Audio:** Play 10s of the actual briefing audio during Scene 4 — pick the harshest finding moment
- **Wallet:** Pre-connect Phantom (devnet), pre-fund with 0.05+ devnet SOL (only if showing live mint)
- **Seed data:** Run `POST /api/demo/seed` before recording to ensure all 6 protocols are populated
- **Timing:** Keep cuts tight — no dead air between scenes
- **Voiceover:** ElevenLabs TTS, professional voice, confident pace
- **Background music:** Subtle, low volume, builds slightly during the attestation moment
- **Captions:** Word-by-word kinetic captions synced to voiceover (TikTok/Reels style)
