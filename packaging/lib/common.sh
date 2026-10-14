# shellcheck shell=bash
# Shared helpers for the Linux build scripts. Source it; do not execute it.

PACKAGING_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PACKAGING_DIR

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

# Load packaging/versions.env without evaluating it as shell (values may contain '<', spaces...).
# Variables already set in the environment win, so CI can override any pin.
load_versions() {
  local key value
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    [[ "$key" =~ ^[A-Z0-9_]+$ ]] || die "bad line in versions.env: $line"
    if [[ -z "${!key:-}" ]]; then
      export "$key=$value"
    fi
  done < "$PACKAGING_DIR/versions.env"
}

# sha256 of a file, portable across GNU coreutils and macOS.
sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  else shasum -a 256 "$1" | awk '{print $1}'; fi
}

# Download a URL to a path with retries.
fetch() {
  curl --fail --silent --show-error --location --retry 5 --retry-delay 3 --retry-all-errors \
       --output "$2" "$1"
}
