# Production Operations — env checklist & schedule runner

Production = `snel-bot` → `/opt/databard` (PM2 `databard`, port 42100), fronted by
`databard.persidian.com`. Deploys via `./scripts/deploy.sh` (local build → rsync →
PM2 reload → health gate on `/api/insights`).

## Environment checklist

Server env lives in `/opt/databard/.env` (symlinked into each release).
`NEXT_PUBLIC_*` vars are **build-time** — set them locally where `npm run build`
runs (deploys build locally), not on the server.

### Set in production ✓
| Key | Purpose |
|---|---|
| `ELEVENLABS_API_KEY` | TTS synthesis |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` | Script generation |
| `CRON_SECRET` | Auth for the schedule runner (added with the runner) |
| `STRIPE_SECRET_KEY` / `STRIPE_PRICE_ID` / `STRIPE_WEBHOOK_SECRET` | Pro checkout + subscription lifecycle (test mode) |
| `RESEND_API_KEY` / `EMAIL_FROM` | Digest email delivery via Resend HTTP API |
| `SMTP_URL` | Fallback (port 465 currently blocked on host) |

### Missing — features dormant until set
| Key(s) | Feature blocked | Where to get it |
|---|---|---|
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` | Pro checkout returns 503; "Start Pro trial" errors | Stripe dashboard (test mode is fine pre-launch). Also register webhook: `https://databard.persidian.com/api/webhook` → events: `checkout.session.completed`, `customer.subscription.deleted` |
| `RESEND_API_KEY` (+ optional `EMAIL_FROM`, `SMTP_URL`) | Digest emails are logged and dropped | Resend HTTP API is preferred (port 465 SMTP is blocked on this host). Set `RESEND_API_KEY` and `EMAIL_FROM`; `SMTP_URL` is a fallback if port 465 is ever unblocked. |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | Page-view/referrer analytics dark (custom events still work via `/api/events`) | Create the site in Plausible; set in **local** build env; redeploy |
| `PALM_USD_RECIPIENT` | Solana checkout returns 503 (Pro + commissioned editions); previously it silently paid the null address — the guard now refuses to build transactions | Your treasury wallet pubkey (mainnet). Also set `NEXT_PUBLIC_SOLANA_NETWORK=mainnet-beta`, `NEXT_PUBLIC_SOLANA_RPC_URL`, and confirm `NEXT_PUBLIC_PALM_USD_MINT` / `NEXT_PUBLIC_USDC_MINT` are the mainnet mints |
| `NEXT_PUBLIC_USDC_MINT` | USDC payment method falls back to the canonical mainnet mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | Optional override |
| `EDITION_PRICE_PUSD` | Commissioned `/earn/[slug]` editions price at the $25 default (PUSD/USDC = 25 tokens; SOL = live Jupiter quote) | Optional override (whole-dollar number) |

Checkout accepts `method: "pusd" | "usdc" | "sol"` on `POST /api/checkout/palmusd` (and `/verify`). SPL methods build an idempotent treasury-ATA create + token transfer; `sol` locks a Jupiter SOL/USD quote server-side for 10 min (CoinGecko fallback) and the client echoes `quoteId` back to `/verify`, which binds it to wallet + purpose + intent. PUSD has no DEX liquidity — SOL/USDC are the practical rails.
| `DATABARD_API_SECRET` | ⚠️ Do **not** set in prod as-is: it guards `/api/synthesize` and `/api/regenerate`, which the browser calls — setting it breaks the UI generation flow. Locking those routes down properly needs a session-based guard first. | — |

## Portable attestation routes (pending deployment)

`/api/attestation/solana/{prepare,anchor,verify}` use runtime-only
`SOLANA_ATTESTATION_RPC_URL` (defaults to devnet). Set it in the server's
persistent env for a private RPC; never expose private RPC credentials through
`NEXT_PUBLIC_*`. Legacy Solana routes retain their existing configuration.
No server signing key is needed or accepted: clients sign and pay their own fees.
An open signing endpoint cannot authenticate caller-provided unsigned receipts
as DataBard output. See [API contract and trust limits](ATTESTATION_API.md).

After deployment, validate demo receipt preparation and tiered verification;
perform a consented devnet wallet transaction separately to prove live inclusion.
HTTP 202 from anchor is submission/unknown, not confirmation. The deterministic
signature survives RPC errors; retry identical bytes rather than auto-re-signing.
Deploy now runs `npm run test:unit` before building; failures abort deployment.

## Scheduled digests (the runner)

Schedules are created via `/api/schedules` (Pro accounts) with a `nextRunAt`.
**`POST /api/schedules/run`** finds due schedules and executes each via
`/api/regenerate` (which handles pipeline, share storage, RSS, webhook, email),
then stamps `lastRunAt`/advances `nextRunAt`. Failures stay due and retry next
hour; max 5 runs per invocation (each one is a real TTS spend).

- Auth: `x-cron-secret` header must match `CRON_SECRET` (503 if unset — fails closed).
- Verify without executing: `POST /api/schedules/run?dryRun=1`

Cron entry on the server (deploy user's crontab):

```cron
0 * * * * CRON_SECRET=$(grep '^CRON_SECRET=' /opt/databard/.env | cut -d= -f2- | tr -d '\042\047') && curl -s -X POST -H "x-cron-secret: $CRON_SECRET" http://127.0.0.1:42100/api/schedules/run >> /opt/databard/logs/cron-schedules.log 2>&1
```

Note: `. /opt/databard/.env` is NOT used — the file contains unquoted values
(`EMAIL_FROM=DataBard <...>`) that break `source`. Extract CRON_SECRET with
grep/cut instead.

Hourly is correct: schedules specify a UTC hour, and the runner only executes
ones whose `nextRunAt` has passed.

**`POST /api/probe/marketplace/refresh`** re-runs the marketplace health
index — a liveness check plus a synthesized valid request per OKX.AI listing
(input contract from MCP tools/list, the 402 challenge, or validation-error
fields; side-effecting endpoints are never called). `?verify=1` runs the paid
verification pass: ≤$0.05 fees, ≥72h between re-checks per service, capped by
`INDEX_DAILY_VERIFY_BUDGET_USD` (default $1, hard max $3) tracked in
`data/marketplace-index/spend.json`. Same `x-cron-secret` auth; `?dryRun=1`
verifies without persisting. With `attest=1` changed scores publish to the
ProbeVerdictRegistry contract on X Layer (`PROBE_REGISTRY_ADDRESS`).

Cron entry (installed by `scripts/deploy.sh`, idempotent):

```cron
17 */6 * * * CRON_SECRET=$(grep '^CRON_SECRET=' /opt/databard/.env | cut -d= -f2- | tr -d '\042\047') && curl -s -m 280 -X POST -H "x-cron-secret: $CRON_SECRET" "http://127.0.0.1:42100/api/probe/marketplace/refresh?attest=1&verify=1" >> /opt/databard/logs/cron-marketplace-index.log 2>&1
```

## Deploy

```bash
./scripts/deploy.sh              # local build → scp tarball → PM2 reload → health gate
./scripts/deploy.sh --dry-run    # build + package only
./scripts/deploy.sh --rollback   # previous release symlink + PM2 reload
```

Build happens on your laptop (`npm run build` inside the script). The server receives
only the standalone artifact — **no `npm install` on `snel-bot`**. Pushing `main`
does not ship; CI typechecks/lints only.

After a successful deploy, `/opt/databard/current/COMMIT` matches the git SHA and
`curl -s -o /dev/null -w '%{http_code}\n' https://databard.persidian.com/api/insights`
should print `200`.

## Stay-alive (shared PM2)

All apps on `snel-bot` share the `deploy` user's PM2. `pm2 save` snapshots
whoever is in the list; a daemon resurrect then starts only that dump. DataBard
dropped out of the dump on 2026-08-08 and nginx 502'd until the process was
started again.

`scripts/ensure-running.sh` runs every 2 minutes (installed by `deploy.sh`).
If `http://127.0.0.1:42100/api/insights` is not 200, it `startOrReload`s only
this ecosystem, then `pm2 save`s so we are back in the dump. It does not
delete or restart other apps. Log: `/opt/databard/logs/ensure.log`.

Do not `pm2 delete all`. Other deploys should `pm2 restart <their-app>` or
`pm2 startOrReload` their own ecosystem — never a dump that omits DataBard
while 42100 is down.

## Rollback

`./scripts/deploy.sh --rollback` — flips the `current` symlink to the previous
release and reloads PM2. Data (`/opt/databard/data`) persists across releases.

## A2A daemon (OKX agent messaging) — currently Mac-only, migrate post-listing

What it is: the `okx-a2a` XMTP daemon carries agent-to-agent task
conversations, including the Agent-conversation channel OKX uses for listing
resubmission. It is **not** in the HTTPS review path — the marketplace review
hits `databard.persidian.com` (this PM2 app) directly, so a dead daemon cannot
cause a paid-endpoint timeout, but it can silence conversation-based flows.
Rule: nothing production-facing depends on the laptop lid, so this daemon
belongs on `snel-bot` under the same supervision as everything else.

### Current home (Mac, verified Sep 25 2026)
- CLI 0.2.16, daemon running, `doctor` 8/8 pass, 3 agent identities active.
- Task home `~/.okx-agent-task` (~28MB: `xmtp/` identity DBs, `sqlite/`,
  `logs/`, `run/` pid/lock). `OKX_AGENT_TASK_HOME` selects it; launchd
  (`~/Library/LaunchAgents/com.okx.a2a.plist`, KeepAlive) runs `okx-a2a run`.
- AI dispatch: codex CLI with **key-based** auth (`~/.codex/auth.json` holds
  `auth_mode` + `OPENAI_API_KEY`) — no browser OAuth to replicate on the box.

### VPS prerequisites (verified Sep 25 2026)
- Node v22.22.1 (daemon needs ≥22.14) ✓; `~/.local/bin` pattern works
  (monid precedent: `npm i -g <pkg> --prefix ~/.local`) ✓; no task home yet ✓.
- Disk 89% (4.1G free) — fine for ~28MB of daemon state, but watch it.
- `okx-a2a` and codex are **not** installed on the box yet.

### Migration (low-stakes window AFTER the listing is live — never mid-review)
1. Install on the box as `deploy`: `npm i -g @okxweb3/a2a-node --prefix ~/.local`
   (+ codex CLI the same way). Ensure `~/.local/bin` is on PATH.
2. **Stop the Mac daemon first** (`okx-a2a daemon stop` + unload the plist).
   Never run two live daemons for the same agent — the CLI warns this is unsafe.
3. Fresh login on the box: `okx-a2a daemon start` then `okx-a2a doctor --fix`
   (SSH is interactive enough for CLI login flows). Prefer fresh login over
   copying `~/.okx-agent-task` — keep the Mac state dir as rollback. Same
   wallet auth → same on-chain communication address; verify with
   `onchainos agent service-list --agent-id 9878` (address must be unchanged).
4. Codex provider: mirror `~/.codex/auth.json` + `config.toml` with a
   server-appropriate key (new secret in deploy-user scope, same trust level
   as `PROBE_PAYER_PK`). Verify the provider shows bound in `okx-a2a status`.
5. Supervise with PM2 (foreground `run`, not background `daemon start`):
   app `okx-a2a` → `~/.local/bin/okx-a2a run`, env
   `OKX_AGENT_TASK_HOME=/home/deploy/.okx-agent-task`, `autorestart: true`.
   Add a 5-min cron watchdog (`okx-a2a status` must report running, else
   `pm2 restart okx-a2a`), same pattern as `ensure-running.sh`, then `pm2 save`.
6. Verify: `status` running, `doctor` clean (non-interactive), 3 agent
   identities, one test A2A message round-trips, communication address unchanged.
7. Rollback: stop the VPS daemon, re-enable the Mac plist, `daemon start`
   locally, confirm `status` + identities.
