#!/usr/bin/env bash
# One-time droplet setup (Ubuntu 22.04/24.04). Run as root:
#   scp deploy/bootstrap-droplet.sh root@mern.esiegman.dev:
#   ssh root@mern.esiegman.dev 'bash bootstrap-droplet.sh "ssh-ed25519 AAAA... github-actions-deploy"'
# The argument is the PUBLIC half of the key GitHub Actions will deploy with.
set -euo pipefail

DEPLOY_PUBKEY="${1:?usage: bootstrap-droplet.sh '<deploy public key>'}"
APP_DIR=/opt/mern

echo "==> Installing Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

echo "==> Adding swap (Atlas Local runs mongod + mongot; small droplets need headroom)"
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Creating deploy user"
if ! id deploy >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" deploy
fi
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
grep -qxF "$DEPLOY_PUBKEY" /home/deploy/.ssh/authorized_keys 2>/dev/null \
  || echo "$DEPLOY_PUBKEY" >> /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

echo "==> Firewall"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "==> App directory and secrets"
install -d -m 750 -o deploy -g deploy "$APP_DIR"
if [ ! -f "$APP_DIR/.env" ]; then
  # Hex passwords stay URL-safe inside the mongodb:// connection strings.
  cat > "$APP_DIR/.env" <<EOF
SITE_ADDRESS=mern.esiegman.dev
MONGO_ROOT_USER=root
MONGO_ROOT_PASSWORD=$(openssl rand -hex 24)
MONGO_APP_DB=app
MONGO_APP_USER=app
MONGO_APP_PASSWORD=$(openssl rand -hex 24)
EOF
  chown deploy:deploy "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  echo "    Generated $APP_DIR/.env with random passwords"
else
  echo "    $APP_DIR/.env already exists, leaving it alone"
fi

echo "==> Done. Add the GitHub secrets from the README, then push to main."
