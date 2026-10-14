#!/bin/sh
# Runs before the package files are removed.
#   dpkg passes: remove | upgrade | deconfigure | failed-upgrade
#   rpm  passes: 0 (erase) | 1+ (upgrade)
set -e

case "${1:-}" in
    remove|deconfigure|0)
        if [ -d /run/systemd/system ] && command -v systemctl >/dev/null 2>&1; then
            systemctl disable --now airllm.service >/dev/null 2>&1 || true
        fi
        # Personal servers started from the app run as the user; ask them to stop cleanly.
        pkill -f "airllm_studio (serve|app)" >/dev/null 2>&1 || true
        ;;
esac

exit 0
