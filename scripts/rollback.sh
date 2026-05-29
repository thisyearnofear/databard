#!/bin/bash
# Rollback to the previous release (the one before the current symlink target).
# Usage: ./scripts/rollback.sh

set -e

REMOTE="${DEPLOY_HOST:-snel-bot}"
DEPLOY_DIR="/opt/databard"

echo "→ Rolling back $REMOTE:$DEPLOY_DIR to previous release..."

ssh "$REMOTE" bash <<'EOF'
  set -e

  DEPLOY_DIR="/opt/databard"
  CURRENT=$(readlink "$DEPLOY_DIR/current" 2>/dev/null || echo "")

  if [ -z "$CURRENT" ]; then
    echo "❌ No current symlink found at $DEPLOY_DIR/current"
    exit 1
  fi

  CURRENT_TS=$(basename "$CURRENT")
  echo "   Current release: $CURRENT_TS"

  # Find the previous release (sorted by name descending, skip the current)
  PREV=$(ls -dtr "$DEPLOY_DIR/releases"/*/ 2>/dev/null \
    | sort -r \
    | grep -v "$CURRENT_TS" \
    | head -1 \
    | sed 's|/$||')

  if [ -z "$PREV" ]; then
    echo "❌ No previous release found to roll back to"
    exit 1
  fi

  PREV_TS=$(basename "$PREV")
  echo "   Rolling back to: $PREV_TS"

  ln -sfn "$PREV" "$DEPLOY_DIR/current"

  # Restart with the old release
  cd "$DEPLOY_DIR/current"
  /usr/local/bin/pm2 startOrReload ecosystem.config.cjs --update-env
  /usr/local/bin/pm2 save

  echo "   ✓ Rollback complete — now serving $PREV_TS"
  /usr/local/bin/pm2 status
EOF
