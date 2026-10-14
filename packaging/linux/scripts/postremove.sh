#!/bin/sh
# Runs after the package files are gone.
#   dpkg passes: remove | purge | upgrade | failed-upgrade | abort-install | ...
#   rpm  passes: 0 (erase) | 1+ (upgrade, the old package's scriptlet)
set -e

case "${1:-}" in
    remove|purge|0)
        # Leftovers the package manager does not track (e.g. .pyc written at runtime) and the
        # optional CUDA overlay, which only makes sense together with the package.
        rm -rf /opt/airllm /var/lib/airllm
        if [ -d /run/systemd/system ] && command -v systemctl >/dev/null 2>&1; then
            systemctl daemon-reload >/dev/null 2>&1 || true
        fi
        ;;
esac

if [ "${1:-}" = purge ]; then
    # Data of the system service (models, settings, chats). Kept on plain remove and on rpm
    # erase so a reinstall finds it again; personal ~/.airllm folders are never touched.
    rm -rf /var/lib/airllm-server /var/lib/private/airllm-server
fi

exit 0
