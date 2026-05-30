#!/bin/bash
# DataBard — local build, rsync deploy
# Builds on your local machine, sends only the standalone artifact to the server.
# Server is space-constrained, so we keep the build local and rsync minimal artefacts.
#
# Usage: ./scripts/deploy.sh [--dry-run] [--rollback]
# Requires: npm, ssh <host> configured

set -e

REMOTE="${DEPLOY_HOST:-snel-bot}"
APP_PORT=42100
DEPLOY_DIR="/opt/databard"
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DRY_RUN=false
ROLLBACK=false

for arg in "$@"; do
  case "$arg" in
    --dry-run)  DRY_RUN=true ;;
    --rollback) ROLLBACK=true ;;
  esac
done

cd "$LOCAL_DIR"

# ── Rollback mode ───────────────────────────────────────────────
if $ROLLBACK; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo " ↩️  Rolling back $REMOTE to previous release"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  ssh "$REMOTE" bash <<'ROLLBACK_EOF'
    set -e
    DEPLOY_DIR="/opt/databard"
    CURRENT=$(readlink "$DEPLOY_DIR/current" 2>/dev/null || echo "")

    if [ -z "$CURRENT" ]; then
      echo "❌ No current symlink found at $DEPLOY_DIR/current"
      exit 1
    fi

    CURRENT_TS=$(basename "$CURRENT")
    echo "   Current release: $CURRENT_TS"

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

    cd "$DEPLOY_DIR/current"
    /usr/local/bin/pm2 startOrReload ecosystem.config.cjs --update-env
    /usr/local/bin/pm2 save

    sleep 2
    echo ""
    echo "   Health check..."
    curl -s -o /dev/null -w "   HTTP %{http_code}" http://127.0.0.1:42100/ || echo " (not responding yet — check pm2 logs)"
    echo ""
    echo "   ✓ Rollback complete — now serving $PREV_TS"
ROLLBACK_EOF

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo " ↩️  Rollback done"
  echo "   Status: ssh $REMOTE 'pm2 status'"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 0
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " 🎙️  Deploying DataBard to $REMOTE:$APP_PORT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. Local build ──────────────────────────────────────────────
echo ""
echo "→ Building locally..."
NEXT_DISABLE_ESLINT=1 npm run build

echo ""
echo "→ Preparing standalone output..."
node scripts/prepare-standalone.mjs

# ── 2. Package the release (minimal footprint for space-constrained server) ──
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RELEASE_DIR="$DEPLOY_DIR/releases/$TIMESTAMP"

echo ""
echo "→ Packaging release $TIMESTAMP..."

# Collect exactly what the server needs
TARFILE="/tmp/databard-$TIMESTAMP.tar.gz"
tar czf "$TARFILE" \
  -C "$LOCAL_DIR" \
  .next/standalone/.next \
  .next/standalone/server.js \
  .next/standalone/package.json \
  .next/standalone/node_modules \
  .next/standalone/public \
  ecosystem.config.cjs \
  scripts/coral-bridge.mjs \
  package.json \
  2>/dev/null

SIZE=$(du -h "$TARFILE" | cut -f1)
echo "   Release tarball: $SIZE"

# ── 3. Sync to server ───────────────────────────────────────────
if $DRY_RUN; then
  echo ""
  echo "→ DRY RUN — skipping rsync. Tarball at $TARFILE"
  exit 0
fi

echo ""
echo "→ Sending tarball to $REMOTE..."
scp "$TARFILE" "$REMOTE:/tmp/databard-$TIMESTAMP.tar.gz"

rm "$TARFILE"

# ── 4. Server-side unpack, symlink, restart ─────────────────────
echo ""
echo "→ Unpacking and restarting on server..."
ssh "$REMOTE" bash <<EOF
  set -e

  DEPLOY_DIR="$DEPLOY_DIR"
  TIMESTAMP="$TIMESTAMP"
  RELEASE_DIR="$DEPLOY_DIR/releases/\$TIMESTAMP"

  # Create release dir and unpack
  mkdir -p "\$RELEASE_DIR"
  tar xzf "/tmp/databard-\$TIMESTAMP.tar.gz" -C "\$RELEASE_DIR"
  rm "/tmp/databard-\$TIMESTAMP.tar.gz"

  # Move standalone contents to release root (flatten the .next/standalone path)
  if [ -d "\$RELEASE_DIR/.next/standalone" ]; then
    for item in "\$RELEASE_DIR/.next/standalone"/*; do
      mv "\$item" "\$RELEASE_DIR/" 2>/dev/null || true
    done
    # Merge .next subdirs
    if [ -d "\$RELEASE_DIR/.next/standalone/.next" ]; then
      mkdir -p "\$RELEASE_DIR/.next"
      cp -r "\$RELEASE_DIR/.next/standalone/.next/"* "\$RELEASE_DIR/.next/" 2>/dev/null || true
    fi
    rm -rf "\$RELEASE_DIR/.next/standalone"
  fi

  # Ensure logs dir exists (shared across releases)
  mkdir -p "$DEPLOY_DIR/logs"

  # Data directory for mint-stats, coral-graduation, leads — persists across deploys.
  # The app reads DATABARD_DATA_DIR (set in ecosystem.config.cjs).
  mkdir -p "$DEPLOY_DIR/data"

  # Update current symlink
  ln -sfn "\$RELEASE_DIR" "$DEPLOY_DIR/current"

  # Restart via PM2
  echo "   Reloading PM2..."
  cd "$DEPLOY_DIR/current"
  /usr/local/bin/pm2 startOrReload ecosystem.config.cjs --update-env
  /usr/local/bin/pm2 save

  # Cleanup old releases (keep last 5)
  echo "   Cleaning up old releases..."
  ls -dt "$DEPLOY_DIR/releases/"* 2>/dev/null | tail -n +6 | xargs rm -rf || true

  # Health check
  sleep 3
  echo ""
  echo "   Health check..."
  curl -s -o /dev/null -w "   HTTP %{http_code}" http://127.0.0.1:$APP_PORT/ || echo " (not responding yet — check pm2 logs)"
  echo ""
EOF

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " ✓ Deploy complete"
echo "   App:    http://$REMOTE:$APP_PORT"
echo "   Logs:   ssh $REMOTE 'pm2 logs databard'"
echo "   Status: ssh $REMOTE 'pm2 status'"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
