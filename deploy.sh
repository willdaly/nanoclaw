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
if ! command -v node &>/dev/null || [[ "\$(node -e 'process.exit(+process.version.slice(1).split(\".\")[0]<20)')" ]]; then
  echo "Installing Node 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

if ! command -v docker &>/dev/null; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

if ! command -v git &>/dev/null; then
  apt-get install -y git
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

# ── Install npm deps and build ───────────────────────────────────────
cd "$APP_DIR"
npm ci --omit=dev 2>/dev/null || npm install
npm run build

# ── Pull latest agent container image ───────────────────────────────
docker pull ghcr.io/qwibitai/nanoclaw:latest 2>/dev/null || true

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
