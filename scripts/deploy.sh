#!/bin/bash
# DataBard — production deploy script for Hetzner VPS
# Usage: ./scripts/deploy.sh
# Run from your local machine. Requires: ssh snel-bot configured.

set -e

REMOTE="snel-bot"
DEPLOY_DIR="/opt/databard"
REPO="https://github.com/thisyearnofear/databard.git"
APP_NAME="databard"
PORT=3000

echo "🎙️  Deploying DataBard to production..."

ssh "$REMOTE" bash <<EOF
set -e

# ── Clone or pull ──────────────────────────────────────────────
if [ -d "$DEPLOY_DIR/.git" ]; then
  echo "→ Pulling latest..."
  cd "$DEPLOY_DIR"
  git pull origin main
else
  echo "→ Cloning repo..."
  git clone "$REPO" "$DEPLOY_DIR"
  cd "$DEPLOY_DIR"
fi

cd "$DEPLOY_DIR"

# ── Env file ───────────────────────────────────────────────────
if [ ! -f .env ]; then
  echo ""
  echo "⚠️  No .env file found. Creating from .env.example..."
  cp .env.example .env
  echo "   Edit /opt/databard/.env and re-run this script."
  exit 1
fi

# ── Install & build ────────────────────────────────────────────
echo "→ Installing dependencies..."
npm ci --production=false

echo "→ Building..."
npm run build

echo "→ Cleaning runtime footprint..."
npm run cleanup:deploy

# ── Cache dir ──────────────────────────────────────────────────
mkdir -p "$DEPLOY_DIR/.databard/cache"

# ── PM2 ────────────────────────────────────────────────────────
if pm2 describe "$APP_NAME" > /dev/null 2>&1; then
  echo "→ Reloading pm2 process..."
  pm2 startOrReload "$DEPLOY_DIR/ecosystem.config.cjs" --only "$APP_NAME" --update-env
else
  echo "→ Starting pm2 process..."
  pm2 start "$DEPLOY_DIR/ecosystem.config.cjs"
fi
pm2 save

echo ""
echo "✓ Deploy complete. App running on port $PORT."
echo "  Logs: pm2 logs $APP_NAME"
EOF
