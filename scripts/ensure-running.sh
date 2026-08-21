#!/bin/bash
# Bring DataBard back if it is missing from PM2 or not answering on 42100.
#
# Shared-PM2 footgun this exists to close: another app's `pm2 save` can persist
# a dump without databard. A later daemon resurrect then never starts us.
# startOrReload only touches apps in THIS ecosystem; then we save so we are
# in the dump again.
#
# Cron: */2 * * * * /opt/databard/current/scripts/ensure-running.sh
# Installed by scripts/deploy.sh. Safe to run by hand.

set -u

ECOSYSTEM="/opt/databard/current/ecosystem.config.cjs"
PM2="${PM2_BIN:-/usr/local/bin/pm2}"
LOG="${ENSURE_LOG:-/opt/databard/logs/ensure.log}"
HEALTH_URL="http://127.0.0.1:42100/api/insights"
mkdir -p "$(dirname "$LOG")"

ts() { date "+%Y-%m-%d %H:%M:%S"; }

health_code() {
  curl -s -o /dev/null -w "%{http_code}" --max-time 8 "$HEALTH_URL" 2>/dev/null || echo "000"
}

in_pm2() {
  "$PM2" describe databard >/dev/null 2>&1
}

CODE="$(health_code)"
if [ "$CODE" = "200" ]; then
  exit 0
fi

echo "$(ts) UNHEALTHY databard (HTTP $CODE, in_pm2=$(in_pm2 && echo yes || echo no)) — startOrReload" >> "$LOG"

if [ ! -f "$ECOSYSTEM" ]; then
  echo "$(ts) FATAL: missing $ECOSYSTEM" >> "$LOG"
  exit 1
fi

cd /opt/databard/current
"$PM2" startOrReload "$ECOSYSTEM" --only databard --update-env >> "$LOG" 2>&1
"$PM2" startOrReload "$ECOSYSTEM" --only coral-bridge --update-env >> "$LOG" 2>&1 || true
"$PM2" save >> "$LOG" 2>&1

sleep 4
CODE="$(health_code)"
if [ "$CODE" != "200" ]; then
  echo "$(ts) STILL UNHEALTHY after reload (HTTP $CODE)" >> "$LOG"
  exit 1
fi
echo "$(ts) recovered (HTTP 200)" >> "$LOG"
