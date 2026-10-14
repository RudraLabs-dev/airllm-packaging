#!/bin/sh
# Runs after install and after upgrade, for both dpkg and rpm.
set -e

mkdir -p /var/lib/airllm

if [ -d /run/systemd/system ] && command -v systemctl >/dev/null 2>&1; then
    systemctl daemon-reload >/dev/null 2>&1 || true
    # Upgrades restart the service only if the admin had it running.
    systemctl try-restart airllm.service >/dev/null 2>&1 || true
fi
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database -q /usr/share/applications >/dev/null 2>&1 || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -q -t /usr/share/icons/hicolor >/dev/null 2>&1 || true
fi

if [ -d /var/lib/airllm/cuda-site ]; then
    variant="$(cat /var/lib/airllm/cuda-site/.airllm-variant 2>/dev/null || true)"
    echo "airllm: a CUDA PyTorch overlay ${variant:+($variant) }is active. If this upgrade changed"
    echo "        the bundled torch version, refresh it with: sudo airllm-enable-cuda $variant"
else
    echo "airllm: installed with CPU-only PyTorch. For NVIDIA GPUs run: sudo airllm-enable-cuda"
fi
echo "airllm: open \"AirLLM\" from your app menu, or run: airllm app   (server: sudo systemctl enable --now airllm)"

exit 0
