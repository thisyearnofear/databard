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

### Missing — features dormant until set
| Key(s) | Feature blocked | Where to get it |
|---|---|---|
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` | Pro checkout returns 503; "Start Pro trial" errors | Stripe dashboard (test mode is fine pre-launch). Also register webhook: `https://databard.persidian.com/api/webhook` → events: `checkout.session.completed`, `customer.subscription.deleted` |
| `SMTP_URL` **or** `EMAIL_WEBHOOK_URL` (+ optional `EMAIL_FROM`) | Digest emails are logged and dropped | Any SMTP relay (Resend/Postmark/SES) |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | Page-view/referrer analytics dark (custom events still work via `/api/events`) | Create the site in Plausible; set in **local** build env; redeploy |
| `PALM_USD_RECIPIENT` | PalmUSD checkout pays the null address | Your treasury wallet pubkey |
| `DATABARD_API_SECRET` | ⚠️ Do **not** set in prod as-is: it guards `/api/synthesize` and `/api/regenerate`, which the browser calls — setting it breaks the UI generation flow. Locking those routes down properly needs a session-based guard first. | — |

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
0 * * * * . /opt/databard/.env && curl -s -X POST -H "x-cron-secret: $CRON_SECRET" http://127.0.0.1:42100/api/schedules/run >> /opt/databard/logs/cron-schedules.log 2>&1
```

Hourly is correct: schedules specify a UTC hour, and the runner only executes
ones whose `nextRunAt` has passed.

## Rollback

`./scripts/deploy.sh --rollback` — flips the `current` symlink to the previous
release and reloads PM2. Data (`/opt/databard/data`) persists across releases.
