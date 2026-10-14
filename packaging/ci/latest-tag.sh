#!/usr/bin/env bash
# Print the highest X.Y.Z (optionally v-prefixed) release tag of a GitHub repository.
# Uses `git ls-remote`, so it needs no token and is not subject to API rate limits.
#   latest-tag.sh lyogavin/airllm   ->  v4.0.0
set -euo pipefail
repo="${1:?usage: latest-tag.sh owner/repo}"
tag="$(git ls-remote --tags --refs "https://github.com/$repo.git" \
        | sed 's#.*refs/tags/##' \
        | grep -E '^v?[0-9]+\.[0-9]+\.[0-9]+$' \
        | awk '{ v = $0; sub(/^v/, "", v); print v "\t" $0 }' \
        | sort -V -k1,1 | tail -n 1 | cut -f2)"   # sort on the number, so "v4.0.0" > "3.9.0"
[[ -n "$tag" ]] || { echo "error: no X.Y.Z release tags in $repo" >&2; exit 1; }
echo "$tag"
