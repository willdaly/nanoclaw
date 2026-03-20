#!/usr/bin/env bash
# deploy.sh — Deploy nanoclaw to Linode
# Usage: ./deploy.sh [user@host]
set -euo pipefail

HOST="${1:-root@172.105.158.89}"
REPO="https://github.com/willdaly/nanoclaw.git"
APP_DIR="/opt/nanoclaw"
SERVICE="nanoclaw"

echo "==> Deploying to $HOST"

ssh "$HOST" bash <<ENDSSH
set -euo pipefail

# ── Install deps if needed ───────────────────────────────────────────
if ! command -v node &>/dev/null || [ "\$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  echo "Installing Node 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

if ! command -v docker &>/dev/null; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

if ! command -v git &>/dev/null || ! command -v sqlite3 &>/dev/null; then
  apt-get install -y -q git sqlite3
fi

echo "Node: \$(node --version)  Docker: \$(docker --version | head -c30)"

# ── Clone or update repo ─────────────────────────────────────────────
if [ -d "$APP_DIR/.git" ]; then
  echo "Pulling latest..."
  cd "$APP_DIR"
  git fetch origin
  git reset --hard origin/main
elif [ -d "$APP_DIR" ]; then
  # Directory exists but no git repo — init inside it (preserves .env)
  echo "Initialising git in existing directory..."
  cd "$APP_DIR"
  git init
  git remote add origin "$REPO"
  git fetch origin
  git reset --hard origin/main
else
  echo "Cloning repo..."
  git clone "$REPO" "$APP_DIR"
  cd "$APP_DIR"
fi

# ── Write .env if it doesn't exist ──────────────────────────────────
if [ ! -f "$APP_DIR/.env" ]; then
  echo "ERROR: $APP_DIR/.env not found."
  echo "Please create it (see .env.example) and re-run deploy.sh"
  exit 1
fi

# ── Warn if only OAuth token is configured (won't work on remote servers) ──
if ! grep -q "ANTHROPIC_API_KEY" "$APP_DIR/.env" && grep -q "CLAUDE_CODE_OAUTH_TOKEN" "$APP_DIR/.env"; then
  echo ""
  echo "⚠️  WARNING: Only CLAUDE_CODE_OAUTH_TOKEN is set in .env."
  echo "   OAuth tokens are session-bound to the issuing machine and will"
  echo "   cause silent API failures on remote servers."
  echo "   Add ANTHROPIC_API_KEY to .env for reliable server deployment."
  echo "   Get one at: https://console.anthropic.com"
  echo ""
fi

# ── Install npm deps and build ───────────────────────────────────────
cd "$APP_DIR"
npm ci --omit=dev 2>/dev/null || npm install
npm run build

# ── Build agent container image ─────────────────────────────────────
echo "Building agent container image (this takes ~2 min on first run)..."
cd "$APP_DIR/container" && bash build.sh
cd "$APP_DIR"

# ── Open firewall ports ───────────────────────────────────────────────
if command -v ufw &>/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow 3000/tcp >/dev/null
  # Allow Docker containers to reach the credential proxy on the host
  ufw allow from 172.17.0.0/16 to any port 3001 proto tcp >/dev/null
  echo "Firewall: port 3000 open, Docker→proxy (3001) allowed"
fi

# ── Fix data directory permissions (Docker runs as node user, not root) ──
chmod -R 777 "$APP_DIR/data" "$APP_DIR/groups" 2>/dev/null || true

# ── Clear stale sessions (safe on re-deploy; agents start fresh) ─────
if [ -f "$APP_DIR/store/messages.db" ]; then
  sqlite3 "$APP_DIR/store/messages.db" 'DELETE FROM sessions' 2>/dev/null || true
  echo "Stale sessions cleared"
fi

# ── Install systemd service ──────────────────────────────────────────
cp "$APP_DIR/nanoclaw.service" /etc/systemd/system/nanoclaw.service
systemctl daemon-reload
systemctl enable nanoclaw
systemctl restart nanoclaw

echo ""
echo "✓ Deployed. Checking status..."
sleep 3
systemctl status nanoclaw --no-pager -l | tail -20

echo ""
echo "Web UI:       http://172.105.158.89:3000"
echo "Agent facts:  http://172.105.158.89:3000/.well-known/agent.json"
ENDSSH
