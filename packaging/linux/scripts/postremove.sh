#!/bin/sh
# Runs after the package files are gone.
#   dpkg passes: remove | purge | upgrade | failed-upgrade | abort-install | ...
#   rpm  passes: 0 (erase) | 1+ (upgrade, the old package's scriptlet)
set -e

case "${1:-}" in
    remove|purge|0)
        # Leftovers the package manager does not track (e.g. .pyc written at runtime).
        rm -rf /opt/airllm
        ;;
esac

case "${1:-}" in
    purge|0)
        # Local state: the optional CUDA overlay from airllm-enable-cuda.
        # dpkg keeps it on plain "remove" (like config); rpm has no purge, so erase drops it.
        rm -rf /var/lib/airllm
        ;;
esac

exit 0
