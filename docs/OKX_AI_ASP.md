# OKX.AI — DataBard as an Agent Service Provider (ASP)

Canonical reference for DataBard's presence on the OKX.AI marketplace: the on-chain
identity, the two A2MCP services, the Builder Code credential, deploy state, and
the remaining hackathon steps. Read this first when resuming OKX work.

See also: [`AGENTS.md`](../AGENTS.md) § "OKX.AI A2MCP ASP" for the operational
setup (env vars, self-check, code layout).

---

## Identity

| Field | Value |
|---|---|
| Agent ID | **#9878** |
| Name | DataBard |
| Role | ASP (Agent Service Provider) |
| Chain | X Layer (`eip155:196`, chainIndex 196) |
| Owner address | `0x5e32740122999bb98a50055d68593f94d2a0711e` (Agentic Wallet, `papaandthejimjams@gmail.com`) |
| Communication address | `0xb317D8c5f526dE3d987e5C28DCbbC793ec22a9f6` |
| Avatar | `https://static.okx.com/cdn/web3/wallet/marketplace/headimages/agent/avatar/19bd9c79-c096-4795-8e6e-19c58fd4e1e2.jpg` |
| Description | AI data analyst that monitors your data estate, scores schema health, and delivers narrated audio briefings with recommended next steps. |
| Category | Software Services |
| Create tx | `0xcb9d3fd178b0b90ee1a9553f4431359d2906afad50c68deafc261e5c65d4019d` |
| Approval status | `3` — AI quality review "suggested pass", submitted via `agent activate`. Pending OKX final review (~24h). Check: `onchainos agent get-agents --agent-ids 9878`. |

## Services (2 × A2MCP)

| # | Name | Type | Fee | Endpoint | serviceId |
|---|---|---|---|---|---|
| 1 | Data Health Check | API service | 0 USDT (free) | `https://databard.persidian.com/api/mcp/health-check` | `2b2e60d3-fa9b-4433-8bc0-d79c0d60624f` |
| 2 | Data Briefing | API service | 1 USDT / call | `https://databard.persidian.com/api/mcp/briefing` | `5aeed929-71a2-4293-b8b1-e2485fed94a4` |

Both services settle on the USDT0 contract `0x779ded0c9e1022225f8e0630b35a9b54be713736`
on X Layer. The paid endpoint issues a 402 with a base64 `PAYMENT-REQUIRED` header
carrying `amount: "1000000"` (1 USDT, 6 decimals), `scheme: "exact"` (EIP-3009),
`payTo: 0x55A5705453Ee82c742274154136Fce8149597058` (Builder Code payout address).

## Builder Code (separate from the ASP identity)

| Field | Value |
|---|---|
| Code | `iea0zhsx4mp4an14` |
| NFT contract | `0xd6c426f9c077358735622ae5a83468dc0510823b` ("Builder Codes" on X Layer) |
| Payout address | `0x55a5705453ee82c742274154136fce8149597058` |
| Mint tx | `0x7cde4769a44cd4c18a8da356ef33522e593c269990ce46e2d1885757cc6155f1` |
| Minted | 2026-07-28 02:02:58 UTC |

The Builder Code is OKX's builder-program credential (an NFT badge) — it is **not**
the ERC-8004 agent identity and does not list services. It's the participation
credential; the ASP identity (#9878 above) is what actually lists services on the
marketplace. The Builder Code payout address is reused as `PAY_TO_ADDRESS` for x402
settlement so funds flow to the same place OKX associates with the builder.

## Deploy state

- **Commit:** `92cba6a` ("Add A2MCP endpoints for OKX.AI ASP marketplace")
- **Release:** `20260728_021040` on `snel-bot` (PM2 reloaded, health check 200)
- **Live URL:** `https://databard.persidian.com`
- **Bundle:** 85.3MB (under 90MB warn threshold; x402 server SDK + viem traced in)
- **Env vars** (in `/opt/databard/.env` on the server, symlinked per release):
  - `PAY_TO_ADDRESS=0x55A5705453Ee82c742274154136Fce8149597058`
  - `OKX_API_KEY` / `OKX_SECRET_KEY` / `OKX_PASSPHRASE` — from the OKX Developer Portal
  - `BRIEFING_PRICE_USD=1.00` (NO `$` prefix — see env gotcha below)

### Env gotcha (do not reintroduce)
`BRIEFING_PRICE_USD=$1.00` in `.env` makes Next.js's env loader expand `$1` as a
var reference, resolving to `.00` → `parseFloat` → `0` → 402 challenge with
`amount: "0"` (free instead of $1). Always use `1.00` (no `$`). The SDK's
`parseMoneyToDecimal` handles both `"$1.00"` and `"1.00"` formats.

## Self-check (production — all green as of 2026-07-28)

```bash
# 1. Service discovery (expect 200)
curl -s -o /dev/null -w "%{http_code}\n" https://databard.persidian.com/api/mcp/tools

# 2. Health check, bad input (expect 400)
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://databard.persidian.com/api/mcp/health-check \
  -H 'content-type: application/json' -d '{}'

# 3. Briefing, no payment (expect 402 + PAYMENT-REQUIRED with amount=1000000)
curl -s -o /dev/null -w "%{http_code}\n" -D /tmp/h.txt -X POST https://databard.persidian.com/api/mcp/briefing \
  -H 'content-type: application/json' -d '{"source":"openmetadata","schemaFqn":"db.sales"}'
grep -i payment-required /tmp/h.txt | cut -d: -f2- | tr -d ' \r' | base64 -d | jq '.accepts[0].amount'
```

## Registration trail (chronological)

1. **2026-07-28 02:02:58 UTC** — Builder Code NFT minted (tx `0x7cde…55f1`).
2. **2026-07-28 ~02:10 UTC** — Code committed (`92cba6a`), env vars copied to `/opt/databard/.env`, `scripts/deploy.sh` ran (release `20260728_021040`), PM2 reloaded.
3. **2026-07-28 ~02:30 UTC** — Production self-check green (tools=200, health-check=400, briefing=402 amount=1000000).
4. **2026-07-28 ~03:10 UTC** — `onchainos preflight` (CLI 4.2.6 → 4.4.1), `onchainos wallet status` (logged in as `papaandthejimjams@gmail.com`), `agent pre-check --role asp` (canCreate=true, 2 existing ASPs: OnPoint #9874, Wowowify #6462).
5. **2026-07-28 ~03:11 UTC** — Avatar generated via fal.ai flux/schnell (key in macOS keychain), uploaded to OKX CDN via `agent upload`.
6. **2026-07-28 ~03:12 UTC** — `agent validate-listing` passed (`pass: true`, zero findings). `agent create --role asp` succeeded → **#9878**, tx `0xcb9d…019d`.
7. **2026-07-28 ~03:13 UTC** — `okx-a2a doctor --fix --json` → 8/8 checks pass, identity #9878 added to A2A runtime (activeClients=3).
8. **2026-07-28 ~03:14 UTC** — `agent activate --agent-id 9878 --preferred-language en-US` → submitApproval succeeded (approvalStatus: 2 → 3, "Listing under review", AI quality "suggested pass").

## Remaining steps (user actions)

1. **Wait for OKX final approval** — status flips from "under review" to "listed". Check:
   ```bash
   onchainos agent get-agents --agent-ids 9878
   # look for approvalDisplayStatus / statusLabel flipping to "listed"
   ```
2. **Record a 90s X demo post** with `#OKXAI` — see shot list below.
3. **Submit the [OKX.AI Genesis Hackathon Google form](https://forms.gle/mddEUagmDbyV37ws8)** (deadline was Jul 28 23:59 UTC; CoinLive reported an extension to Jul 28 — verify before submitting). The form asks for ASP details + a link to the X post.

## 90s X demo shot list

Target: 90 seconds, single take or 2 cuts. Hit the beats below.

### Beat 1 — The problem (0:00–0:15)
Screen: a messy schema diagram or the `/roast` landing page.
Voiceover: *"Your data warehouse has 400 tables, half undocumented, a quarter
stale. Nobody knows which ones matter. DataBard is the AI analyst that scores
all of it in one call."*

### Beat 2 — The free health check (0:15–0:35)
Screen: terminal. Run the actual curl against the live endpoint:
```bash
curl -s -X POST https://databard.persidian.com/api/mcp/health-check \
  -H 'content-type: application/json' \
  -d '{"source":"openmetadata","schemaFqn":"db.sales","openmetadata":{"url":"...","token":"..."}}' | jq .
```
Voiceover: *"Free health check — POST your schema FQN, get back a 0-100 score,
critical tables ranked, and the three fixes that move the needle most."*
Visual: scroll the JSON response, pause on `healthScore` and `recommendedActions`.

### Beat 3 — The paid briefing (0:35–1:05)
Screen: terminal. Show the 402 challenge first, then the settled response:
```bash
curl -i -X POST https://databard.persidian.com/api/mcp/briefing \
  -H 'content-type: application/json' \
  -d '{"source":"openmetadata","schemaFqn":"db.sales","openmetadata":{"url":"...","token":"..."}}'
# show the 402 + PAYMENT-REQUIRED header, then a paid call returning the script + audio URL
```
Voiceover: *"The full briefing is one dollar — an exact USDT transfer on X Layer,
settled on-chain only after the synthesis succeeds. You get the script, the MP3,
the health score, and the next steps. Failed synthesis never charges."*
Visual: show the `PAYMENT-REQUIRED` header decoded (amount: 1000000), then the
returned `audioUrl` — play 5 seconds of the MP3.

### Beat 4 — The marketplace listing (1:05–1:20)
Screen: the OKX.AI marketplace page for DataBard #9878 (or the `onchainos agent
get-agents --agent-ids 9878` output rendered as a card).
Voiceover: *"Listed as an Agent Service Provider on OKX.AI — any MCP-compatible
agent can call these endpoints and pay autonomously via the x402 protocol."*

### Beat 5 — The close (1:20–1:30)
Screen: DataBard landing page, fade to the avatar.
Voiceover: *"DataBard — your data, scored, narrated, and acted on. Free health
check, one-dollar briefing, live on OKX.AI. #OKXAI"*
Visual: the generated avatar, the URL `databard.persidian.com`, fade out.

### Recording notes
- Browser at 1280×720 or 1920×1080; hide bookmarks bar.
- Terminal font 14pt+, background `#0a0a0f` to match DataBard's dark theme.
- Use a real OpenMetadata instance or a mock that returns valid JSON — the
  health-check needs to return 200, not 500, for the demo.
- For the paid call, either pre-fund a wallet with 1 USDT0 on X Layer and let
  the agent pay autonomously, OR show the 402 challenge and cut to a pre-recorded
  settled response (the full paid flow needs an x402 client; a raw curl won't
  settle).

## Other ASPs under the same wallet

| # | Name | Note |
|---|---|---|
| 9874 | OnPoint | Pre-existing |
| 6462 | Wowowify | Pre-existing |
| 9878 | DataBard | This one |

One address can hold multiple ASP identities. To switch between them, use
`onchainos agent get-my-agents` and reference the right `--agent-id`.
