#!/bin/sh
# Install-test a package inside a clean distro container (run by CI via `docker run`).
#   test-install.sh <dir-with-packages> <expected-airllm-version> [hf-model-for-e2e]
# Installs the .deb or .rpm with the distro's own tool (so Depends/Requires are checked),
# runs the smoke test as root and as an unprivileged user, runs the AirLLM Studio end-to-end
# test (tiny offline model; plus a real Hugging Face model when one is given), then uninstalls
# and checks cleanup.
set -eu
pkgdir="$1"
expect="$2"
hf_model="${3:-}"
smoke=/packaging/tests/smoke_test.py

. /etc/os-release
echo "=== $PRETTY_NAME ($(uname -m))"

if command -v apt-get >/dev/null 2>&1; then
    kind=deb
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq "$pkgdir"/*.deb
elif command -v dnf >/dev/null 2>&1; then
    kind=rpm
    dnf install -y -q "$pkgdir"/*.rpm
elif command -v zypper >/dev/null 2>&1; then
    kind=rpm
    zypper --non-interactive install --allow-unsigned-rpm "$pkgdir"/*.rpm
else
    echo "no supported package manager" >&2; exit 1
fi

echo "=== smoke test (root)"
airllm-python "$smoke" --expect-version "$expect"
airllm-enable-cuda --status
cat /opt/airllm/share/airllm/BUILDINFO

echo "=== AirLLM Studio"
airllm --version
for f in /usr/share/applications/airllm.desktop /usr/lib/systemd/system/airllm.service \
         /usr/share/icons/hicolor/256x256/apps/airllm.png; do
    [ -f "$f" ] || { echo "FAIL: $f missing" >&2; exit 1; }
done
export AIRLLM_E2E_ANNOTATE=1      # failures become annotations on the CI job
airllm-python -I /packaging/tests/studio_e2e.py --airllm /usr/bin/airllm
if [ -n "$hf_model" ]; then
    echo "=== AirLLM Studio with $hf_model from Hugging Face"
    airllm-python -I /packaging/tests/studio_e2e.py --airllm /usr/bin/airllm --model "$hf_model"
fi

if command -v setpriv >/dev/null 2>&1; then
    echo "=== smoke test (unprivileged user)"
    HOME=/tmp setpriv --reuid=65534 --regid=65534 --clear-groups airllm-python "$smoke" --expect-version "$expect"
else
    echo "=== setpriv not available; skipping unprivileged run"
fi

echo "=== uninstall"
case "$kind" in
    deb) apt-get purge -y -qq airllm ;;
    rpm) if command -v dnf >/dev/null 2>&1; then dnf remove -y -q airllm; else zypper --non-interactive remove airllm; fi ;;
esac
for path in /opt/airllm /var/lib/airllm /usr/bin/airllm-python /usr/bin/airllm-enable-cuda /usr/bin/airllm \
            /usr/share/applications/airllm.desktop /usr/lib/systemd/system/airllm.service; do
    if [ -e "$path" ] || [ -L "$path" ]; then echo "FAIL: $path left behind after uninstall" >&2; exit 1; fi
done
echo "=== PASSED on $PRETTY_NAME"
