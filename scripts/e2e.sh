#!/usr/bin/env bash
# E2E contro Supabase di staging: unico ingresso consentito per `playwright test`.
#
# Uso (dalla root del repo o di un worktree):
#   bash scripts/e2e.sh e2e/menu.spec.ts [e2e/team.spec.ts:42 ...] [altre opzioni playwright]
#
# Regole (il 30/09–01/10 suite complete ripetute da più sessioni hanno
# esaurito il Disk IO di staging):
# - una sola run alla volta su tutta la macchina: lock condiviso tra worktree
#   in ~/.cache/cataloglobe-e2e.lock (mkdir atomico + PID; un lock col PID
#   morto è scaduto e si riprende);
# - almeno un file .spec.ts come argomento: niente suite completa;
# - niente --repeat-each; --workers/-j maggiore di 1 rifiutato, sempre
#   --workers=1.
#
# E2E_GUARD_DRY_RUN=1 stampa il comando invece di lanciarlo (lock compreso):
# serve a provare lo script senza toccare staging.
set -euo pipefail

LOCK_DIR="${HOME}/.cache/cataloglobe-e2e.lock"
PID_FILE="${LOCK_DIR}/pid"

die() {
  echo "e2e.sh: $*" >&2
  exit 2
}

# ── Argomenti ────────────────────────────────────────────────────────────────
PW_ARGS=()
SPEC_COUNT=0
expect_workers_value=0

for arg in "$@"; do
  if [[ $expect_workers_value -eq 1 ]]; then
    [[ "$arg" == "1" ]] || die "--workers/-j maggiore di 1 non ammesso contro staging (ricevuto: $arg)"
    expect_workers_value=0
    continue
  fi
  case "$arg" in
    --repeat-each|--repeat-each=*)
      die "--repeat-each non ammesso contro staging"
      ;;
    --workers|-j)
      expect_workers_value=1
      ;;
    --workers=*|-j=*)
      [[ "${arg#*=}" == "1" ]] || die "--workers/-j maggiore di 1 non ammesso contro staging (ricevuto: ${arg#*=})"
      ;;
    -*)
      PW_ARGS+=("$arg")
      ;;
    *.spec.ts|*.spec.ts:[0-9]*)
      PW_ARGS+=("$arg")
      SPEC_COUNT=$((SPEC_COUNT + 1))
      ;;
    *)
      # Valore di un'opzione precedente (es. `-g "titolo"`) o filtro libero.
      PW_ARGS+=("$arg")
      ;;
  esac
done
[[ $expect_workers_value -eq 0 ]] || die "--workers/-j senza valore"
[[ $SPEC_COUNT -gt 0 ]] || die "serve almeno un file .spec.ts (es. e2e/menu.spec.ts): la suite completa contro staging non si lancia"

# ── Lock ─────────────────────────────────────────────────────────────────────
mkdir -p "$(dirname "$LOCK_DIR")"

acquire_lock() {
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    echo "$$" > "$PID_FILE"
    return 0
  fi
  local holder
  holder="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -z "$holder" ]]; then
    # Un altro processo può aver appena fatto mkdir senza aver ancora scritto
    # il PID: si aspetta un attimo prima di dichiarare il lock scaduto.
    sleep 1
    holder="$(cat "$PID_FILE" 2>/dev/null || true)"
  fi
  if [[ -n "$holder" ]] && kill -0 "$holder" 2>/dev/null; then
    echo "Run e2e già in corso da un'altra sessione (PID $holder)" >&2
    exit 1
  fi
  # PID assente o morto: lock scaduto. Lo si toglie e si riprova una volta;
  # se nel frattempo l'ha preso un altro processo, mkdir fallisce di nuovo.
  rm -rf "$LOCK_DIR"
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    echo "$$" > "$PID_FILE"
    return 0
  fi
  holder="$(cat "$PID_FILE" 2>/dev/null || echo "?")"
  echo "Run e2e già in corso da un'altra sessione (PID $holder)" >&2
  exit 1
}

release_lock() {
  # Solo se il lock è nostro: mai togliere quello di un altro processo.
  if [[ "$(cat "$PID_FILE" 2>/dev/null || true)" == "$$" ]]; then
    rm -rf "$LOCK_DIR"
  fi
}

acquire_lock
trap release_lock EXIT
trap 'release_lock; exit 130' INT
trap 'release_lock; exit 143' TERM

# ── Run ──────────────────────────────────────────────────────────────────────
CMD=(npx playwright test "${PW_ARGS[@]}" --workers=1)
echo "e2e.sh (PID $$): ${CMD[*]}"
if [[ "${E2E_GUARD_DRY_RUN:-0}" == "1" ]]; then
  exit 0
fi
"${CMD[@]}"
