#!/usr/bin/env bash
# Cosa porta un rilascio staging → main: migration nuove ed edge function da
# distribuire. Solo lettura (git), nessun accesso a Supabase.
#
# Uso (dalla root del repo o di un worktree):
#   bash scripts/release-diff.sh                 # origin/main..origin/staging
#   bash scripts/release-diff.sh <base> <head>   # due ref qualsiasi
#
# Edge da distribuire = cartelle di `supabase/functions/<nome>` cambiate, più
# quelle che importano (anche indirettamente) un file di `_shared` cambiato.
# Le migration in `_in-attesa/` non contano: non si applicano.
set -euo pipefail

BASE="${1:-origin/main}"
HEAD="${2:-origin/staging}"

if [[ $# -eq 0 ]]; then
  git fetch -q origin main staging
fi

echo "Rilascio ${BASE} → ${HEAD} ($(git rev-parse --short "$HEAD"))"
echo "Commit nuovi (senza merge): $(git rev-list --count --no-merges "${BASE}..${HEAD}")"
echo "PR unite: $(git log --merges --format=%s "${BASE}..${HEAD}" | grep -oE '#[0-9]+' | sort -t'#' -k2 -n -u | tr '\n' ' ')"
echo

echo "== Migration nuove =="
git diff --name-only --diff-filter=A "$BASE" "$HEAD" -- supabase/migrations \
  | grep -v '/_in-attesa/' | xargs -n1 basename 2>/dev/null | sort || true
echo

CHANGED=$(git diff --name-only "$BASE" "$HEAD" -- supabase/functions)

# File di _shared cambiati, poi chiusura: chi in _shared importa un file già nella lista.
SHARED=$(echo "$CHANGED" | grep '^supabase/functions/_shared/' | grep -v '\.test\.ts$' | xargs -n1 basename 2>/dev/null | sort -u || true)
while :; do
  NEXT="$SHARED"
  for f in $SHARED; do
    stem="${f%.ts}"
    more=$(git grep -l -E "from ['\"]\\./${stem}(\\.ts)?['\"]" "$HEAD" -- supabase/functions/_shared \
      | sed "s|^${HEAD}:||" | grep -v '\.test\.ts$' | xargs -n1 basename 2>/dev/null || true)
    NEXT=$(printf '%s\n%s\n' "$NEXT" "$more" | sed '/^$/d' | sort -u)
  done
  [[ "$NEXT" == "$SHARED" ]] && break
  SHARED="$NEXT"
done

DIRECT=$(echo "$CHANGED" | grep -v '^supabase/functions/_shared/' | awk -F/ 'NF>3 {print $3}' | sort -u)
VIA_SHARED=""
for f in $SHARED; do
  stem="${f%.ts}"
  users=$(git grep -l -E "from ['\"]\\.\\./_shared/${stem}(\\.ts)?['\"]" "$HEAD" -- 'supabase/functions/*/index.ts' 'supabase/functions/*/*.ts' \
    | sed "s|^${HEAD}:||" | grep -v '/_shared/' | awk -F/ '{print $3}' || true)
  VIA_SHARED=$(printf '%s\n%s\n' "$VIA_SHARED" "$users" | sed '/^$/d' | sort -u)
done

# Solo cartelle che esistono in HEAD (una funzione tolta non si distribuisce).
ALL=$(printf '%s\n%s\n' "$DIRECT" "$VIA_SHARED" | sed '/^$/d' | sort -u \
  | while read -r fn; do git cat-file -e "${HEAD}:supabase/functions/${fn}/index.ts" 2>/dev/null && echo "$fn"; done)

echo "== _shared cambiati (con chi li importa) =="
echo "${SHARED:-(nessuno)}"
echo
echo "== Edge da distribuire ($(echo "$ALL" | sed '/^$/d' | wc -l | tr -d ' ')) =="
echo "${ALL:-(nessuna)}"
echo
echo "Array pronto per il runbook:"
echo "FUNZIONI=($(echo "$ALL" | tr '\n' ' '))"
