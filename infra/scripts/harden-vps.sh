#!/usr/bin/env bash
#
# One-time VPS hardening + prerequisite install for the Examination System.
# Target: Ubuntu/Debian. Run as root ON THE VPS (review it first!):
#
#   bash infra/scripts/harden-vps.sh
#
# It is idempotent — safe to re-run. It does NOT deploy the app (see infra/DEPLOYMENT.md);
# it prepares the host: firewall, fail2ban, automatic security updates, Docker, nginx, certbot,
# and swap. The SSH port is opened in the firewall BEFORE the firewall is enabled, so you will
# not be locked out.
set -euo pipefail

SSH_PORT="${SSH_PORT:-36179}"   # your custom SSH port
export DEBIAN_FRONTEND=noninteractive

log() { echo -e "\n\033[1;34m▶ $*\033[0m"; }

[ "$(id -u)" -eq 0 ] || { echo "Run as root."; exit 1; }

log "Updating packages"
apt-get update -y && apt-get upgrade -y

log "Installing base tools (nginx, certbot, fail2ban, ufw, unattended-upgrades)"
apt-get install -y ca-certificates curl gnupg ufw fail2ban unattended-upgrades \
  nginx certbot python3-certbot-nginx

log "Installing Docker Engine + Compose plugin (official repo)"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

log "Firewall (ufw): allow SSH:${SSH_PORT}, HTTP:80, HTTPS:443; deny everything else inbound"
ufw allow "${SSH_PORT}/tcp"      # opened BEFORE enabling — no lock-out
ufw allow 80/tcp
ufw allow 443/tcp
ufw default deny incoming
ufw default allow outgoing
ufw --force enable
ufw status verbose

log "fail2ban: protect SSH from brute force"
cat >/etc/fail2ban/jail.d/exam-ssh.local <<EOF
[sshd]
enabled  = true
port     = ${SSH_PORT}
maxretry = 5
bantime  = 1h
findtime = 10m
EOF
systemctl enable --now fail2ban
systemctl restart fail2ban

log "Automatic security updates"
dpkg-reconfigure -f noninteractive unattended-upgrades || true
cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

log "Swap (2G) — keeps a small VPS from OOM-killing containers under load"
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

log "DONE. Host is hardened. Next: follow infra/DEPLOYMENT.md to deploy the app."
echo "   • Docker:   $(docker --version)"
echo "   • Firewall: SSH ${SSH_PORT}, 80, 443 open; all other inbound denied."
echo "   • Reminder: rotate the root password and switch SSH to key-only (DEPLOYMENT.md § 1)."
