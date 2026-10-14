#!/usr/bin/env bash
# Resolve what to build, before checking the source out.
#   env SOURCE_REPO   owner/repo to build from           (default: UPSTREAM_REPO from versions.env)
#   env REQUESTED_REF tag, branch or commit SHA          (default: latest release tag)
# Prints GITHUB_OUTPUT lines: source_repo, ref, sha, is_tag
set -euo pipefail
# shellcheck source=../lib/common.sh
source "$(dirname "$0")/../lib/common.sh"
load_versions

repo="${SOURCE_REPO:-$UPSTREAM_REPO}"
ref="${REQUESTED_REF:-}"
url="https://github.com/$repo.git"
[[ "$repo" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || die "bad repository name: $repo"

if [[ -z "$ref" ]]; then
  ref="$("$(dirname "$0")/latest-tag.sh" "$repo")"
  log "No ref requested; latest release tag of $repo is $ref"
fi

is_tag=false
if sha="$(git ls-remote --exit-code "$url" "refs/tags/$ref^{}" 2>/dev/null | awk '{print $1}')" && [[ -n "$sha" ]]; then
  is_tag=true                                  # annotated tag, peeled to its commit
elif sha="$(git ls-remote --exit-code "$url" "refs/tags/$ref" 2>/dev/null | awk '{print $1}')" && [[ -n "$sha" ]]; then
  is_tag=true                                  # lightweight tag
elif sha="$(git ls-remote --exit-code "$url" "refs/heads/$ref" 2>/dev/null | awk '{print $1}')" && [[ -n "$sha" ]]; then
  :                                            # branch head
elif [[ "$ref" =~ ^[0-9a-f]{7,40}$ ]]; then
  sha="$ref"                                   # commit SHA; actions/checkout validates it
else
  die "'$ref' is not a tag, branch or commit SHA in $repo"
fi

log "Building $repo @ $ref ($sha), tag=$is_tag"
printf 'source_repo=%s\nref=%s\nsha=%s\nis_tag=%s\n' "$repo" "$ref" "$sha" "$is_tag"
