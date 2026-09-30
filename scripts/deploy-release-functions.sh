#!/usr/bin/env bash
# Deploy delle Edge Functions di una release, da origin/main.
#
# Uso (dalla root del repo, DOPO il merge su main):
#   bash scripts/deploy-release-functions.sh <PROJECT_REF>
#
# - worktree temporaneo pulito su origin/main: niente WIP del working tree;
# - controlla prima di tutto che ogni funzione esista e abbia
#   verify_jwt = false in supabase/config.toml;
# - chiede di scrivere «deploy» prima di partire;
# - deploya UNA funzione per volta, per nome, con --project-ref esplicito
#   (mai `supabase functions deploy` senza nome); si ferma al primo errore;
# - rimuove il worktree alla fine, anche in caso di errore.
# Nessun secret qui: i secret delle funzioni si impostano a parte.
set -euo pipefail

if [[ $# -ne 1 || -z "$1" ]]; then
  echo "Uso: bash scripts/deploy-release-functions.sh <PROJECT_REF>" >&2
  exit 2
fi
PROJECT_REF="$1"

FUNCTIONS=(
  delete-account
  stripe-change-subscription
  stripe-checkout
  stripe-portal
  update-billing-details
  stripe-checkout-confirm
  stripe-webhook
  delete-tenant
  restore-tenant
  purge-tenant-now
  purge-tenants
  purge-accounts
  recover-account
  resolve-public-catalog
  submit-order
  submit-order-admin
)

REPO="$(git rev-parse --show-toplevel)"
WT="$(mktemp -d -t cg-deploy-main)"
CURRENT=""

cleanup() {
  cd "$REPO"
  git worktree remove --force "$WT" 2>/dev/null || true
  rm -rf "$WT"
}
on_error() {
  if [[ -n "$CURRENT" ]]; then
    echo "❌ FALLITA: $CURRENT — le funzioni dopo questa NON sono state deployate." >&2
  else
    echo "❌ Errore prima dei deploy (fetch/worktree/controlli): nessuna funzione deployata." >&2
  fi
}
trap on_error ERR
trap cleanup EXIT

git -C "$REPO" fetch origin main
git -C "$REPO" worktree add --detach "$WT" origin/main
cd "$WT"

echo "HEAD del worktree: $(git rev-parse HEAD)  ($(git log -1 --format='%s'))"

for fn in "${FUNCTIONS[@]}"; do
  [[ -f "supabase/functions/$fn/index.ts" ]] || { echo "manca supabase/functions/$fn/index.ts (merge fatto?)" >&2; false; }
  jwt="$(awk -v s="[functions.$fn]" '$0==s{f=1;next} /^\[/{f=0} f && /verify_jwt/{print $3}' supabase/config.toml)"
  [[ "$jwt" == "false" ]] || { echo "$fn: verify_jwt in config.toml = '${jwt:-mancante}', atteso false" >&2; false; }
done
echo "Controlli ok: ${#FUNCTIONS[@]} funzioni, verify_jwt = false su tutte."

read -r -p "Deploy su $PROJECT_REF da $(git rev-parse --short HEAD)? Scrivi 'deploy' per procedere: " ok
if [[ "$ok" != "deploy" ]]; then
  trap - ERR
  echo "Annullato."
  exit 1
fi

i=0
for fn in "${FUNCTIONS[@]}"; do
  i=$((i + 1))
  CURRENT="$fn"
  echo "── [$i/${#FUNCTIONS[@]}] $fn"
  supabase functions deploy "$fn" --project-ref "$PROJECT_REF"
done
CURRENT=""

echo "✅ Deployate ${#FUNCTIONS[@]} funzioni su $PROJECT_REF da $(git rev-parse --short HEAD)."
