#!/bin/bash
# DataBard — local build, rsync deploy
# Builds on your local machine, sends only the standalone artifact to the server.
# Usage: ./scripts/deploy.sh
# Requires: npm, ssh snel-bot configured

set -e

REMOTE="snel-bot"
APP_NAME="databard"
APP_PORT=5100
DEPLOY_DIR="/opt/databard"
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$LOCAL_DIR"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " 🎙️  Deploying DataBard to production"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. Local build ──────────────────────────────────────────────
echo ""
echo "→ Building locally..."
NEXT_DISABLE_ESLINT=1 npm run build 2>&1

echo ""
echo "→ Preparing standalone output..."
node scripts/prepare-standalone.mjs

echo ""
echo "→ Cleaning up deploy artifacts..."
node scripts/cleanup-deploy.mjs

# ── 2. Rsync to server ─────────────────────────────────────────
echo ""
echo "→ Creating new release folder..."
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RELEASE_DIR="$DEPLOY_DIR/releases/$TIMESTAMP"

ssh "$REMOTE" "mkdir -p $RELEASE_DIR/.next"

echo "→ Rsyncing standalone build to server..."
rsync -avz --delete \
  .next/standalone/ \
  "$REMOTE:$RELEASE_DIR/"

# Sync public and static (handled by prepare-standalone.mjs into .next/standalone/.next)
# Wait, prepare-standalone.mjs copies them into .next/standalone/.next/static etc.
# So they are already in .next/standalone/ which we rsync above.

echo "→ Syncing ecosystem and scripts..."
rsync -avz \
  ecosystem.config.cjs \
  package.json \
  "$REMOTE:$RELEASE_DIR/"

rsync -avz \
  scripts/coral-bridge.mjs \
  "$REMOTE:$RELEASE_DIR/scripts/"

# ── 3. Server switch & restart ──────────────────────────────────
echo ""
echo "→ Switching symlink and restarting..."
ssh "$REMOTE" bash <<EOF
  set -e

  DEPLOY_DIR="$DEPLOY_DIR"
  RELEASE_DIR="$RELEASE_DIR"
  APP_PORT=5100

  # Update symlink
  ln -sfn "\$RELEASE_DIR" "$DEPLOY_DIR/current"

  # Ensure logs dir exists in root (shared across releases)
  mkdir -p "$DEPLOY_DIR/logs"

  # Restart via PM2
  echo "   Starting via PM2..."
  cd "$DEPLOY_DIR/current"
  /usr/local/bin/pm2 startOrReload ecosystem.config.cjs --update-env
  /usr/local/bin/pm2 save

  # Cleanup old releases (keep last 5)
  ls -dt "$DEPLOY_DIR/releases/"* | tail -n +6 | xargs rm -rf || true
EOF

# ── 4. Local cleanup ───────────────────────────────────────────
echo ""
echo "→ Restoring local node_modules (for IDE)..."
npm install --silent 2>/dev/null &

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " ✓ Deploy complete"
echo "   Server: $REMOTE:$APP_PORT"
echo "   Logs:   $REMOTE logs - press ctrl+C to follow"
echo "   View:   pm2 logs $APP_NAME"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"