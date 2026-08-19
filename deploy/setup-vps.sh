#!/usr/bin/env bash
# One-time VPS setup. Run once as root:
#   chmod +x deploy/setup-vps.sh && ./deploy/setup-vps.sh
set -e

echo "== Checking swap =="
if swapon --show | grep -q .; then
    echo "Swap already enabled, skipping."
else
    echo "No swap found — creating a 2G swapfile..."
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    if ! grep -q '/swapfile' /etc/fstab; then
        echo '/swapfile none swap sw 0 0' >> /etc/fstab
    fi
    # Conservative swappiness — prefer RAM, only use swap as a safety
    # net against OOM kills, not as primary memory.
    sysctl vm.swappiness=10
    if ! grep -q 'vm.swappiness' /etc/sysctl.conf; then
        echo 'vm.swappiness=10' >> /etc/sysctl.conf
    fi
    echo "Swap enabled."
fi

echo
echo "== Creating log directory =="
mkdir -p "$(dirname "$0")/../logs"

echo
free -h
echo
echo "Done. Next steps:"
echo "  1. Edit config.js if you want different port/restart settings (no .env needed)"
echo "  2. npm install"
echo "  3a. PM2:      npm i -g pm2 && pm2 start ecosystem.config.js && pm2 save && pm2 startup"
echo "  3b. systemd:  sudo cp deploy/browser-automation.service /etc/systemd/system/ && sudo systemctl enable --now browser-automation"
