#!/bin/sh
# Runs after install and after upgrade, for both dpkg and rpm.
set -e

mkdir -p /var/lib/airllm

if [ -d /var/lib/airllm/cuda-site ]; then
    variant="$(cat /var/lib/airllm/cuda-site/.airllm-variant 2>/dev/null || true)"
    echo "airllm: a CUDA PyTorch overlay ${variant:+($variant) }is active. If this upgrade changed"
    echo "        the bundled torch version, refresh it with: sudo airllm-enable-cuda $variant"
else
    echo "airllm: installed with CPU-only PyTorch. For NVIDIA GPUs run: sudo airllm-enable-cuda"
fi

exit 0
