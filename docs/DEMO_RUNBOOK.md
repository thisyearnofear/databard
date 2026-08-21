# Accelerator Demo Runbook (Solana)

The audience is a Solana accelerator, but the product should not pretend every data
team needs a chain. The demo answers the blockchain question directly: the core
product is the briefing and dashboard; Solana is the optional trust layer for protocols
making public health claims. That framing works for both the accelerator's enterprise
and web3 arms.

## The 90-second talk track

> DataBard turns data health into something people actually consume: a two-minute,
> decision-ready briefing anchored by a dashboard with the evidence.
>
> Here's this week's briefing: Uniswap analytics health dropped 11 points because new
> test failures hit the whale-trades pipeline; here's what's downstream and what to fix
> first.
>
> For protocol teams that need public trust, one click attests the report on-chain.
> Anyone can verify the hash against the report without trusting our servers.
>
> Next: a public registry of protocol data-health, and a marketplace where data
> insights settle through on-chain escrow.
>
> The same engine serves internal data teams without crypto in the interface. Solana is
> a trust layer for the subset of teams that need public verifiability.

## The click path

1. Open **`/`** (Protocols is the default). Use **`/?workspace=teams`** only if demoing the enterprise surface.
2. Click **Try the demo** → seeds data → lands on **`/league?from=demo`**:
   - This week's table + headline finding (e.g. a declining protocol score).
   - **That's my protocol — claim a row** / **Listen to the briefing**.
3. From the league, open the briefing → play 20–30 s. Or continue to **`/protocol?workspace=protocols`**:
   - Fleet health chart — scrub it, hover a legend entry to spotlight a series.
   - "What changed this week" — narrative on the declining source.
4. Click **Share card** on the episode → show the score-card OG / shared page (no wallet).
5. **Attestation moment** (wallet pre-connected, devnet) — Protocols dashboard / episode mint CTA, then **`/verify`**.
6. **Escrow settlement moment** (live on **devnet**):
   - Program `ErwrNVN9DgGvPkHTm1KziXhHjWm6ehE2MUnsauYmfgdK`.
   - Line: *"Insights can settle through on-chain escrow — verify with one Explorer link."*
   - Live walkthrough: `/market` if asked.

## Preflight checklist (do this the morning of)

- [ ] `npm run build && npm start` (or the deployed URL) — no dev-mode jank.
- [ ] Hit `POST /api/demo/seed` once (the demo button does this too) and load
      `/league` — ranked table + headline finding. Then `/protocol?workspace=protocols`
      — 6 sources, trends populated, no `0%` scores anywhere. Then `/leaderboard`.
- [ ] Load `/protocol?workspace=teams` and confirm no wallet button, Market, Verify,
      or leaderboard nav in the header.
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
6. **The viral loop (GTM built into the product):** on the league, copy tweet.
   On the episode player, click **Share card** → open the shared score card
   (health + finding, Monday signup, no wallet). Line: *"Every shared finding
   is a mini-landing page. The product is its own distribution channel."*
7. **The leaderboard as registry:** load `/leaderboard` — claim flow. Line:
   *"This is the public registry. Protocols want to be on it because verified
   health is marketing. Their marketing is our acquisition channel."*

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
- **Dead zone (name it first):** $49–299/mo data tooling is exactly Thiel's dead zone —
  too cheap for a sales team, too niche for mass marketing. Product-led virality is the
  only coherent escape at this price, which is why the product is its own distribution
  vehicle.
- **Solana kicker:** the chain is a distribution surface for Protocols. Attestations are public by
  construction; the leaderboard is a public registry of protocol health. Protocols WANT
  to publicize verified health — their marketing is our distribution, and the memos are
  composable. Cold start: this accelerator's ecosystem intros seed the registry flywheel.
- **CLV > CAC:** weekly-habit product at $49/mo, CAC → 0 on forwarded acquisition; the
  economics only require activation to convert, which the funnel measures.
- **Pre-empt the eye-roll:** this isn't invite-a-friend virality bolted on — the thing
  being shared IS the thing being sold. The report is the referral.

## Likely Q&A

- **"Why does this need a blockchain?"** The Teams product does not. Public protocols
  make public claims about their data, and a hash commitment on Solana makes those
  claims tamper-evident and independently checkable.
- **"A memo tx is trivial."** Deliberately. Hash commitment is the right primitive —
  zero contract risk, ~$0.000005 per attestation, verify with one RPC call. The
  Anchor escrow program shows we go deeper where the use case demands it.
- **"Devnet?"** Attestation can move to mainnet via config. The escrow marketplace is
  experimental and should be described as devnet-only until customer demand is proven.
- **"What's on-chain exactly?"** Schema name, health score, episode id, SHA-256 of the
  report script, author wallet, timestamp — the report itself stays private; only the
  commitment is public.
