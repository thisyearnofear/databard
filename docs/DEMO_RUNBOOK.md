# Accelerator Demo Runbook (Solana)

The audience is a Solana accelerator: their first filter question is **"why does this
need Solana?"** The demo answers it directly — public protocols making public health
claims need trust-minimized attestation, and Solana's fees make per-report attestation
economically trivial. Enterprise is the TAM-expansion story, not something to hide.

## The 90-second talk track

> Protocol teams already produce health metrics nobody reads. DataBard turns them into
> a two-minute, decision-ready briefing — and anchors every report on Solana, so
> protocol health is publicly verifiable, not just claimed.
>
> Here's this week's briefing: Uniswap analytics health dropped 11 points because new
> test failures hit the whale-trades pipeline; here's what's downstream and what to fix
> first.
>
> One click attests the report on-chain — anyone can verify the hash against the
> report, without trusting our servers.
>
> Next: a public registry of protocol data-health, and a marketplace where data
> insights settle through on-chain escrow.
>
> The same engine sells into web2 data teams — that's the expansion market. Solana is
> the trust layer that makes the reports worth believing.

## The click path

1. Open **`/?persona=onchain`** — Onchain persona hero.
2. Click **Try the demo** → lands on **`/protocol`** (dashboard-first):
   - Fleet health chart — scrub it, hover a legend entry to spotlight a series.
   - "What changed this week" — Uniswap Analytics decline narrative.
   - Open the Uniswap card → critical tables, coverage, downstream risk.
3. Click **▶ Listen to this analysis** → play 20–30 s of the audio briefing. Audio is
   the format, not the pitch — come back to the dashboard.
4. **Attestation moment** (wallet pre-connected, devnet):
   - Mint the report from the episode page (Onchain persona + connected wallet shows
     the mint CTA), OR use a pre-minted record on a dashboard card.
   - Click **⛓ Verify** on the record → `/verify` recomputes the SHA-256 of the report
     and matches it against the on-chain memo. Show the green check, then the Explorer
     link.
5. **Escrow settlement moment** (live on devnet):
   - The Anchor escrow program is deployed at
     `ErwrNVN9DgGvPkHTm1KziXhHjWm6ehE2MUnsauYmfgdK` (devnet).
   - Full lifecycle verified: initialize (buyer deposits SOL) → commit_delivery
     (seller commits SHA-256 of deliverable) → release (buyer releases funds,
     escrow closes).
   - Explorer link for the verified transaction:
     `https://explorer.solana.com/address/ErwrNVN9DgGvPkHTm1KziXhHjWm6ehE2MUnsauYmfgdK?cluster=devnet`
   - Line: *"This isn't just a hash in a memo — insights settle through on-chain
     escrow. The seller commits what they delivered, the buyer releases funds
     only after that commitment, and the whole thing is one RPC call to verify."*
   - If asked to show it live: walk through the `/market` page which exercises
     the escrow flow, or show the Explorer link above.

## Preflight checklist (do this the morning of)

- [ ] `npm run build && npm start` (or the deployed URL) — no dev-mode jank.
- [ ] Hit `POST /api/demo/seed` once (the demo button does this too) and load
      `/protocol` — 6 sources, trends populated, no `0%` scores anywhere.
      Then load `/leaderboard` — 6 entries (Uniswap, Jupiter, Marinade, Raydium,
      Orca, E-commerce), badges inline, "Claim your protocol" on scanned entries.
- [ ] Phantom installed, set to **devnet**, wallet funded (≥ 0.05 devnet SOL —
      `solana airdrop 1 <pubkey> -u devnet` the day before; faucets rate-limit).
- [ ] Wallet pre-connected to the site; auto-connect is on.
- [ ] Do one real mint the day before so a fresh devnet tx exists; verify it on
      `/verify` and keep the tx signature in a note as backup.
- [ ] Onboarding tour dismissed in the demo browser profile (it no longer shows over
      the landing/demo, but clear state anyway: localStorage
      `databard:onboarding-complete`).
- [ ] Audio output tested — `/demo-episode-dune.mp3` plays.
- [ ] Explorer links resolve (devnet cluster param present).
- [ ] Dark theme, 125 % zoom for projectors.

## What NOT to do

- Don't lead with "AI podcast" — lead with the decision, then audio as the format.
- Don't run a live Coral/SQL query — the enterprise flow pins Coral back to
  OpenMetadata; it invites an integration discussion we don't need.
- Don't claim NFTs — attestation is a Memo-program hash commitment (say exactly that;
  it's a feature: no contract risk, verifiable with nothing but an RPC call).
- Don't claim the escrow marketplace is in production — it's live on **devnet**
  (program `ErwrNVN…`), verified end-to-end. Say "devnet" explicitly.
- Don't say "auditors verify" beyond what `/verify` shows — that page is the proof;
  let it speak.

## Delight beats (sprinkle, don't stack)

1. **Self-audit loop (the peak):** mint live → paste the tx into `/verify` → green
   "Verified". Line: *"Claim made, commitment published, self-audited — thirty seconds,
   nothing but an RPC call."* Upgrade: let the reviewer pick which record to verify.
2. **The dashboard as taste signal:** scrub the fleet chart, spotlight a series via the
   legend, point at the avatars — deterministic pixel identity per source, ~1.5 trillion
   possibilities. Line: *"identity from hashing — same trick as the attestations."*
3. **Audio at its cruelest moment:** scrub to the harshest finding, 20 seconds, back to
   the dashboard. The restraint says audio is a format, not the gimmick.
4. **Customer-insight pause (on the trend narrative):** *"Tools say 'anomaly in table X'
   — nobody acts on that. People act on 'dropped 11 points, two new failures after
   Friday's deploy, here's the owner.' Narratives get acted on; dashboards get skimmed."*
5. **Back pocket:** `/roast` — "when we want people to share it, we let the AI roast
   their data." Use if energy dips; exit on the laugh.
6. **The viral loop (GTM built into the product):** on the dashboard, expand
   "📛 Embeddable badge" → show the live SVG + copy the Markdown embed code.
   Line: *"Every dashboard has an embeddable badge. A protocol puts this in
   their README — every visitor sees DataBard."* Then click "Share moment" on
   the episode player → open the deep link → show the branded player with OG
   image + "Get this for your data" CTA. Line: *"Every shared episode is a
   mini-landing page. The product is its own distribution channel."*
7. **The leaderboard as registry:** load `/leaderboard` — 6 protocols, badges
   inline, "Claim your protocol" on scanned entries. Line: *"This is the public
   registry. Protocols want to be on it because verified health is marketing.
   Their marketing is our acquisition channel."*

**Founding insight, said out loud:** data reports don't fail on accuracy — they fail on
distribution to human attention. We didn't build a better report; we built a report that
travels.

## The distribution question (Thiel frame)

- **Integration with product:** our user's pain is "nobody consumes my report," so the
  product's success event — forwarding the Monday briefing to 5–20 stakeholders — IS the
  acquisition event. Shared episode pages carry a "Get this for your data" CTA; clips,
  badges, and on-chain records are three more self-distributing artifact shapes. A
  briefing nobody forwards has failed as a product: usage and distribution are the same
  act.
- **One channel:** the forwarded briefing in Slack/email. Instrumented end-to-end
  (`shared_episode_open` → `shared_episode_cta_click`; targets in GTM.md). Everything
  else is subordinate to that loop converting.
- **Dead zone (name it first):** $29–299/mo data tooling is exactly Thiel's dead zone —
  too cheap for a sales team, too niche for mass marketing. Product-led virality is the
  only coherent escape at this price, which is why the product is its own distribution
  vehicle.
- **Solana kicker:** the chain is a distribution surface. Attestations are public by
  construction; the leaderboard is a public registry of protocol health. Protocols WANT
  to publicize verified health — their marketing is our distribution, and the memos are
  composable. Cold start: this accelerator's ecosystem intros seed the registry flywheel.
- **CLV > CAC:** weekly-habit product at $29/mo, CAC → 0 on forwarded acquisition; the
  economics only require activation to convert, which the funnel measures.
- **Pre-empt the eye-roll:** this isn't invite-a-friend virality bolted on — the thing
  being shared IS the thing being sold. The report is the referral.

## Likely Q&A

- **"Why does this need a blockchain?"** Public protocols make public claims about
  their data. A hash commitment on Solana makes the report tamper-evident and
  independently checkable — trust in the analysis without trust in our servers.
- **"A memo tx is trivial."** Deliberately. Hash commitment is the right primitive —
  zero contract risk, ~$0.000005 per attestation, verify with one RPC call. The
  Anchor escrow program shows we go deeper where the use case demands it.
- **"Devnet?"** Yes — mainnet at launch is a config flip (`NEXT_PUBLIC_SOLANA_NETWORK`).
- **"What's on-chain exactly?"** Schema name, health score, episode id, SHA-256 of the
  report script, author wallet, timestamp — the report itself stays private; only the
  commitment is public.
