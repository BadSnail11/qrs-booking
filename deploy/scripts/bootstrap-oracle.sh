#!/usr/bin/env bash
# Install Docker + Compose on an Oracle Cloud Always Free VM (Ubuntu 22.04/24.04).
# Run once as a sudo-capable user:
#   curl -fsSL ... | bash
#   OR: bash deploy/scripts/bootstrap-oracle.sh

set -euo pipefail

if [[ "${EUID}" -eq 0 ]]; then
  SUDO=""
else
  SUDO="sudo"
fi

echo "==> Detecting OS"
if [[ -f /etc/os-release ]]; then
  # shellcheck disable=SC1091
  . /etc/os-release
else
  echo "Cannot detect OS (/etc/os-release missing). Use Ubuntu 22.04/24.04." >&2
  exit 1
fi

if [[ "${ID}" != "ubuntu" ]]; then
  echo "This script targets Ubuntu. Detected: ${PRETTY_NAME:-$ID}" >&2
  echo "On Oracle Linux, install Docker manually, then re-run deploy.sh." >&2
  exit 1
fi

echo "==> Installing Docker Engine + Compose plugin"
$SUDO apt-get update -y
$SUDO apt-get install -y ca-certificates curl gnupg git ufw

$SUDO install -m 0755 -d /etc/apt/keyrings
if [[ ! -f /etc/apt/keyrings/docker.asc ]]; then
  $SUDO curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  $SUDO chmod a+r /etc/apt/keyrings/docker.asc
fi

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  ${VERSION_CODENAME} stable" | $SUDO tee /etc/apt/sources.list.d/docker.list >/dev/null

$SUDO apt-get update -y
$SUDO apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "==> Enabling Docker"
$SUDO systemctl enable --now docker

if [[ -n "${SUDO}" ]]; then
  $SUDO usermod -aG docker "${USER}"
  echo "Added ${USER} to docker group. Log out/in (or run: newgrp docker) before deploy."
fi

echo "==> Opening host firewall for HTTP/HTTPS"
$SUDO ufw allow OpenSSH
$SUDO ufw allow 80/tcp
$SUDO ufw allow 443/tcp
$SUDO ufw allow 443/udp
# Non-interactive enable if inactive
if ! $SUDO ufw status | grep -q "Status: active"; then
  echo "y" | $SUDO ufw enable || true
fi

echo
echo "Bootstrap done."
echo "Next:"
echo "  1) In OCI Console → VCN → Security List / NSG: allow ingress TCP 22, 80, 443 (and UDP 443)."
echo "  2) Point DOMAIN A/AAAA records to this VM public IP."
echo "  3) Clone the repo, copy deploy/.env.prod.example → deploy/.env.prod, fill secrets."
echo "  4) Run: bash deploy/scripts/deploy.sh"
echo
docker --version
docker compose version
