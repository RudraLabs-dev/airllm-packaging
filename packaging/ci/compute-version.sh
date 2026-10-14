#!/usr/bin/env bash
# Work out every version string the build needs, from the checked-out AirLLM source.
#   compute-version.sh <src-dir>
#   env REF, SHA, IS_TAG (from resolve-ref.sh), PKG_RELEASE (default 1)
#
# Prints GITHUB_OUTPUT lines:
#   setup_version    version= in air_llm/setup.py                    4.0.0       | 4.1.0rc1
#   pkg_version      .deb/.rpm Version (pre-releases sort first via ~) 4.0.0      | 4.1.0~rc1
#   tag_version      git-safe form for the release tag                 4.0.0      | 4.1.0rc1
#   numeric_version  Windows VersionInfo (4 numbers)                   4.0.0.1
#   release_tag      GitHub Release tag in this repo                   v4.0.0-1
#   prerelease       true for pre-releases and branch/commit snapshots
#
# Snapshots (REF is a branch or commit) get "+gitYYYYMMDD.<sha7>": newer than the release they
# follow, older than the next one — e.g. 4.0.0+git20261014.ff35db2.
set -euo pipefail
src="${1:?usage: compute-version.sh <src-dir>}"
release="${PKG_RELEASE:-1}"
[[ "$release" =~ ^[1-9][0-9]*$ ]] || { echo "error: PKG_RELEASE must be a positive integer" >&2; exit 1; }

setup_py="$src/air_llm/setup.py"
setup_version="$(sed -nE "s/^[[:space:]]*version[[:space:]]*=[[:space:]]*['\"]([^'\"]+)['\"].*/\1/p" "$setup_py" | head -n 1)"
[[ -n "$setup_version" ]] || { echo "error: no version= found in $setup_py" >&2; exit 1; }

if [[ "${IS_TAG:-false}" == true && "${REF#v}" != "$setup_version" ]]; then
  echo "::warning::tag ${REF} does not match setup.py version ${setup_version}; packaging as ${setup_version}" >&2
fi

prerelease=false
pkg_version="$setup_version"
if [[ "$setup_version" =~ ^([0-9]+(\.[0-9]+)*)\.?(a|b|rc|dev)\.?([0-9]*)$ ]]; then
  pkg_version="${BASH_REMATCH[1]}~${BASH_REMATCH[3]}${BASH_REMATCH[4]}"
  prerelease=true
fi
tag_version="$setup_version"

if [[ "${IS_TAG:-false}" != true ]]; then
  short="${SHA:0:7}"
  date="$(git -C "$src" log -1 --format=%cd --date=format:%Y%m%d 2>/dev/null || date -u +%Y%m%d)"
  pkg_version="${pkg_version}+git${date}.${short}"
  tag_version="${tag_version}+git${date}.${short}"
  prerelease=true
fi

IFS=. read -r -a nums <<< "$(grep -oE '^[0-9]+(\.[0-9]+)*' <<< "$setup_version")"
numeric_version="${nums[0]:-0}.${nums[1]:-0}.${nums[2]:-0}.${release}"

cat <<EOF
setup_version=$setup_version
pkg_version=$pkg_version
tag_version=$tag_version
pkg_release=$release
numeric_version=$numeric_version
release_tag=v${tag_version}-${release}
prerelease=$prerelease
EOF
