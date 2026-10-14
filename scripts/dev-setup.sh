#!/usr/bin/env bash
# Set up a working copy for contributing to AirLLM through the RudraLabs-dev fork.
#   scripts/dev-setup.sh [directory]          (default: ./airllm)
#
# Result:
#   origin   -> RudraLabs-dev/airllm   (push your branches here)
#   upstream -> lyogavin/airllm        (pull requests go here)
#   local main tracks upstream/main, so new branches always start from the real upstream.
set -euo pipefail
dir="${1:-airllm}"
fork=RudraLabs-dev/airllm
upstream=lyogavin/airllm

git clone "https://github.com/$fork.git" "$dir"
cd "$dir"
git remote add upstream "https://github.com/$upstream.git"
git fetch upstream --tags
git branch --set-upstream-to=upstream/main main
git config remote.pushDefault origin   # never push to upstream by accident

cat <<EOF

Ready in $dir.  Typical flow:
  git switch main && git pull                      # sync with upstream/main
  git switch -c fix/<short-topic>
  ... edit, commit (small, focused; sign off if upstream asks) ...
  git push -u origin fix/<short-topic>
  gh pr create --repo $upstream --head ${fork%%/*}:fix/<short-topic>
EOF
