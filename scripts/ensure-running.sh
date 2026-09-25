#!/bin/bash
# Bring DataBard back if it is missing from PM2 or not answering on 42100.
# Coral Bridge is checked INDEPENDENTLY on 42101 and only reloaded when IT is
# unhealthy — a sick databard must not bounce a healthy bridge (and vice versa).
# (Coral answers 404 on GET / when alive; only "no HTTP response" counts as down.)
#
# Shared-PM2 footgun this exists to close: another app's `pm2 save` can persist
# a dump without databard. A later daemon resurrect then never starts us.
# startOrReload only touches the app being recovered; then we save so we are
# in the dump again.
#
# Cron: */2 * * * * /opt/databard/current/scripts/ensure-running.sh
# Installed by scripts/deploy.sh. Safe to run by hand.

set -u

ECOSYSTEM="/opt/databard/current/ecosystem.config.cjs"
PM2="${PM2_BIN:-/usr/local/bin/pm2}"
LOG="${ENSURE_LOG:-/opt/databard/logs/ensure.log}"
DATABARD_HEALTH_URL="http://127.0.0.1:42100/api/insights"
CORAL_HEALTH_URL="http://127.0.0.1:42101/"
mkdir -p "$(dirname "$LOG")"

ts() { date "+%Y-%m-%d %H:%M:%S"; }

health_code() {
  curl -s -o /dev/null -w "%{http_code}" --max-time 8 "$1" 2>/dev/null || echo "000"
}

reload_app() {
  if [ ! -f "$ECOSYSTEM" ]; then
    echo "$(ts) FATAL: missing $ECOSYSTEM" >> "$LOG"
    return 1
  fi
  cd /opt/databard/current
  "$PM2" startOrReload "$ECOSYSTEM" --only "$1" --update-env >> "$LOG" 2>&1
  "$PM2" save >> "$LOG" 2>&1
}

FAILED=0

# ── databard (expects HTTP 200) ──
CODE="$(health_code "$DATABARD_HEALTH_URL")"
if [ "$CODE" != "200" ]; then
  echo "$(ts) UNHEALTHY databard (HTTP $CODE) — startOrReload" >> "$LOG"
  if reload_app databard; then
    sleep 4
    CODE="$(health_code "$DATABARD_HEALTH_URL")"
    if [ "$CODE" != "200" ]; then
      echo "$(ts) databard STILL UNHEALTHY after reload (HTTP $CODE)" >> "$LOG"
      FAILED=1
    else
      echo "$(ts) databard recovered (HTTP 200)" >> "$LOG"
    fi
  else
    FAILED=1
  fi
fi

# ── coral-bridge (any HTTP response = alive; only 000 = down) ──
CORAL_CODE="$(health_code "$CORAL_HEALTH_URL")"
if [ "$CORAL_CODE" = "000" ]; then
  echo "$(ts) UNHEALTHY coral-bridge (no HTTP response) — startOrReload" >> "$LOG"
  if reload_app coral-bridge; then
    sleep 4
    CORAL_CODE="$(health_code "$CORAL_HEALTH_URL")"
    if [ "$CORAL_CODE" = "000" ]; then
      echo "$(ts) coral-bridge STILL UNHEALTHY after reload" >> "$LOG"
      FAILED=1
    else
      echo "$(ts) coral-bridge recovered (HTTP $CORAL_CODE)" >> "$LOG"
    fi
  else
    FAILED=1
  fi
fi

exit "$FAILED"
