#!/usr/bin/env bash
# Pack a payload built by build-payload.sh into .deb and .rpm with nfpm.
#
# Usage: build-packages.sh --version 4.0.0 [--release 1] [--payload /opt/airllm] [--arch x86_64|aarch64] [--out dist]
set -euo pipefail
# shellcheck source=../lib/common.sh
source "$(dirname "$0")/../lib/common.sh"
load_versions

payload=/opt/airllm
version=""
release=1
arch="$(uname -m)"
out=dist
while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) version="$2"; shift 2 ;;
    --release) release="$2"; shift 2 ;;
    --payload) payload="$2"; shift 2 ;;
    --arch)    arch="$2"; shift 2 ;;
    --out)     out="$2"; shift 2 ;;
    -h|--help) sed -n '2,4p' "$0"; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done
[[ -n "$version" ]] || die "--version is required"
[[ -x "$payload/python/bin/python3" ]] || die "$payload does not look like a built payload"
case "$arch" in
  x86_64)  nfpm_arch=amd64; nfpm_asset_arch=x86_64 ;;
  aarch64) nfpm_arch=arm64; nfpm_asset_arch=arm64 ;;
  *) die "unsupported arch: $arch" ;;
esac
mkdir -p "$out"
out="$(cd "$out" && pwd)"

# Use the pinned nfpm (checksum-verified) unless the right version is already on PATH.
nfpm_bin="$(command -v nfpm || true)"
if [[ -z "$nfpm_bin" ]] || ! "$nfpm_bin" --version 2>/dev/null | grep -q "GitVersion:[[:space:]]*v\?${NFPM_VERSION}$"; then
  tooldir="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/nfpm-$NFPM_VERSION"
  nfpm_bin="$tooldir/nfpm"
  if [[ ! -x "$nfpm_bin" ]]; then
    mkdir -p "$tooldir"
    tarball="nfpm_${NFPM_VERSION}_Linux_${nfpm_asset_arch}.tar.gz"
    base="https://github.com/goreleaser/nfpm/releases/download/v${NFPM_VERSION}"
    log "Fetching nfpm $NFPM_VERSION"
    fetch "$base/checksums.txt" "$tooldir/checksums.txt"
    fetch "$base/$tarball" "$tooldir/$tarball"
    expected="$(awk -v a="$tarball" '$2 == a { print $1 }' "$tooldir/checksums.txt")"
    [[ -n "$expected" && "$(sha256_of "$tooldir/$tarball")" == "$expected" ]] || die "nfpm checksum mismatch"
    tar -xzf "$tooldir/$tarball" -C "$tooldir" nfpm
  fi
fi

export PKG_VERSION="$version" PKG_RELEASE="$release" NFPM_ARCH="$nfpm_arch"
PAYLOAD_DIR="$(cd "$payload" && pwd)"; export PAYLOAD_DIR
STUDIO_WEB="$(cd "$PACKAGING_DIR/../studio/src/airllm_studio/web" && pwd)"; export STUDIO_WEB

# nfpm only expands env vars in a few fields, so render the whole config up front.
# Fails loudly on any ${VAR} that is not set.
config="$(mktemp --suffix=.yaml)"
trap 'rm -f "$config"' EXIT
perl -pe 's/\$\{(\w+)\}/defined $ENV{$1} ? $ENV{$1} : die "nfpm.yaml: \$$1 is not set\n"/ge' \
  "$PACKAGING_DIR/linux/nfpm.yaml" > "$config"

for packager in deb rpm; do
  log "nfpm: building $packager ($PKG_NAME $version-$release, $nfpm_arch)"
  "$nfpm_bin" package --config "$config" --packager "$packager" --target "$out/"
done
ls -lh "$out"
