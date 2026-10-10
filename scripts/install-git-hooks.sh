#!/usr/bin/env bash
# Attiva gli hook versionati in scripts/git-hooks (oggi: pre-push con tsc
# sull'albero committato). Opt-in, una volta per clone. Per toglierli:
# git config --unset core.hooksPath
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
git -C "$ROOT" config core.hooksPath scripts/git-hooks
echo "Hook attivi da scripts/git-hooks (core.hooksPath)."
