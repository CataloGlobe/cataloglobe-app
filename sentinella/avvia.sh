#!/usr/bin/env bash
# Sentinella, giro in sola lettura (passo 2 del piano): lanciato a mano da Alex.
#
# Uso, dalla radice del repo o di un worktree:
#   bash sentinella/avvia.sh
#
# Apre una sessione INTERATTIVA di Claude Code con il giro già chiesto.
# Mai da cron o launchd: l'avvio automatico richiede una chiave API.
#
# SENTINELLA_DRY_RUN=1 stampa il comando invece di lanciarlo (il lock si controlla, non si prende).
# Variabili facoltative (le dà Lorenzo, mai nel repo):
#   SENTINELLA_STAGING_ADVISORS_TOKEN  token di sola lettura per gli avvisi
#   SENTINELLA_STAGING_PROJECT_REF     riferimento del progetto di staging
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
DIR="$ROOT/sentinella"
STATE_DIR="${HOME}/.cache/sentinella"
RAPPORTI="${SENTINELLA_RAPPORTI:-${HOME}/sentinella-rapporti}"
LOCK_DIR="${HOME}/.cache/cataloglobe-e2e.lock"
PID_FILE="${LOCK_DIR}/pid"
OGGI="$(date +%Y-%m-%d)"

die() {
  echo "sentinella: $*" >&2
  exit 2
}

command -v claude >/dev/null || die "claude non trovato"
command -v node >/dev/null || die "node non trovato"
mkdir -p "$STATE_DIR" "$RAPPORTI"

# ── Interruttore ─────────────────────────────────────────────────────────────
[[ -e "$STATE_DIR/STOP" ]] && die "interruttore acceso ($STATE_DIR/STOP): giro non avviato"

# ── Lock in comune con scripts/e2e.sh: mai insieme a una run e2e ─────────────
mkdir -p "$(dirname "$LOCK_DIR")"
acquire_lock() {
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    echo "$$" > "$PID_FILE"
    return 0
  fi
  local holder
  holder="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -z "$holder" ]]; then
    sleep 1
    holder="$(cat "$PID_FILE" 2>/dev/null || true)"
  fi
  if [[ -n "$holder" ]] && kill -0 "$holder" 2>/dev/null; then
    die "run e2e o giro già in corso (PID $holder)"
  fi
  rm -rf "$LOCK_DIR"
  mkdir "$LOCK_DIR" 2>/dev/null || die "lock preso da un altro processo"
  echo "$$" > "$PID_FILE"
}
release_lock() {
  if [[ "$(cat "$PID_FILE" 2>/dev/null || true)" == "$$" ]]; then
    rm -rf "$LOCK_DIR"
  fi
}
if [[ "${SENTINELLA_DRY_RUN:-}" == "1" ]]; then
  # A vuoto il lock si guarda soltanto: nessuno da rilasciare dopo.
  holder="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "$holder" ]] && kill -0 "$holder" 2>/dev/null; then
    die "run e2e o giro già in corso (PID $holder)"
  fi
else
  acquire_lock
  trap release_lock EXIT
  # Interrotto (Ctrl-C, terminale chiuso): rilascia ed esce.
  trap 'release_lock; exit 130' INT TERM HUP
fi

# ── Da quando guardare ───────────────────────────────────────────────────────
git -C "$ROOT" fetch -q origin staging
HEAD_SHA="$(git -C "$ROOT" rev-parse origin/staging)"
DA=""
if [[ -f "$STATE_DIR/ultimo-giro" ]]; then
  DA="$(cat "$STATE_DIR/ultimo-giro")"
  git -C "$ROOT" cat-file -e "$DA^{commit}" 2>/dev/null || DA=""
fi
if [[ -z "$DA" ]]; then
  # Primo giro, o commit dell'ultimo giro sparito: le ultime 24 ore.
  DA="$(git -C "$ROOT" rev-list -1 --first-parent --before='1 day ago' origin/staging)"
fi
if [[ -z "$DA" ]]; then
  # Storia più giovane di un giorno: dal primo commit.
  DA="$(git -C "$ROOT" rev-list --max-parents=0 origin/staging | tail -1)"
fi
INTERVALLO="${DA}..${HEAD_SHA}"
# Si contano le entrate in staging (merge delle PR e commit diretti), non i
# singoli commit dei rami: il giro legge una PR alla volta.
N_COMMIT="$(git -C "$ROOT" rev-list --count --first-parent "$INTERVALLO")"
if (( N_COMMIT == 0 )); then
  echo "Sentinella: niente di nuovo in staging dall'ultimo giro, nessun giro."
  exit 0
fi
MAX_ENTRATE=40
if (( N_COMMIT > MAX_ENTRATE )); then
  DA="$(git -C "$ROOT" rev-list --first-parent --skip="$MAX_ENTRATE" -1 origin/staging)"
  INTERVALLO="${DA}..${HEAD_SHA}"
  echo "Sentinella: $N_COMMIT entrate da leggere, tengo le ultime $MAX_ENTRATE"
  N_COMMIT="$MAX_ENTRATE"
fi

TOKEN_AVVISI="assente: il sottoagente avvisi salta"
if [[ -n "${SENTINELLA_STAGING_ADVISORS_TOKEN:-}" && -n "${SENTINELLA_STAGING_PROJECT_REF:-}" ]]; then
  TOKEN_AVVISI="presente nelle variabili d'ambiente (non stamparlo)"
fi

# ── Prompt e sottoagenti ─────────────────────────────────────────────────────
PROMPT="$(INTERVALLO="$INTERVALLO" RAPPORTI="$RAPPORTI" OGGI="$OGGI" TOKEN_AVVISI="$TOKEN_AVVISI" \
  node -e '
    const fs = require("fs");
    let t = fs.readFileSync(process.argv[1], "utf8");
    for (const k of ["INTERVALLO", "RAPPORTI", "OGGI", "TOKEN_AVVISI"]) {
      t = t.split("{{" + k + "}}").join(process.env[k]);
    }
    process.stdout.write(t);
  ' "$DIR/giro.md")"

AGENTI="$(node -e '
  const fs = require("fs");
  const path = require("path");
  const dir = process.argv[1];
  const out = {};
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort()) {
    const text = fs.readFileSync(path.join(dir, f), "utf8");
    const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!m) throw new Error("frontmatter mancante in " + f);
    const meta = {};
    for (const line of m[1].split("\n")) {
      const i = line.indexOf(":");
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    out[path.basename(f, ".md")] = {
      description: meta.description,
      model: meta.model,
      tools: meta.tools.split(",").map((s) => s.trim()),
      prompt: m[2].trim(),
    };
  }
  process.stdout.write(JSON.stringify(out));
' "$DIR/agenti")"

# Strumenti senza conferma: lettura del repo, git in lettura, curl verso
# staging, scrittura nella sola cartella dei rapporti. Tutto il resto chiede ad Alex.
ALLOWED=(
  "Read" "Grep" "Glob" "Agent"
  "Bash(git log:*)" "Bash(git show:*)" "Bash(git diff:*)" "Bash(git rev-list:*)"
  # Le sei richieste di sentinella-intestazioni, scritte intere: niente `:*`,
  # che lascerebbe aggiungere altri argomenti (un secondo host, -o, -d).
  "Bash(curl -sS -I -A 'CataloGlobe-Sentinella' http://staging.cataloglobe.com/)"
  "Bash(curl -sS -I -A 'CataloGlobe-Sentinella' https://staging.cataloglobe.com/)"
  "Bash(curl -sS -I -A 'CataloGlobe-Sentinella' https://staging.cataloglobe.com/login)"
  "Bash(curl -sS -I -A 'CataloGlobe-Sentinella' https://staging.cataloglobe.com/status)"
  "Bash(curl -sS -I -A 'CataloGlobe-Sentinella' https://staging.cataloglobe.com/.env)"
  "Bash(curl -sS -I -A 'CataloGlobe-Sentinella' https://staging.cataloglobe.com/.git/config)"
  "Bash(sleep:*)"
  # Percorso assoluto: nelle regole serve `//` davanti, un `/` solo vale
  # rispetto alla cartella del progetto.
  "Write(/${RAPPORTI}/**)" "Edit(/${RAPPORTI}/**)"
  # L'interruttore si può leggere anche a giro iniziato.
  "Read(~/.cache/sentinella/**)"
)
DISALLOWED=(
  "WebFetch" "WebSearch" "NotebookEdit"
  # git in lettura, ma `--output` scrive su un file qualsiasi.
  "Bash(git log*--output*)" "Bash(git show*--output*)" "Bash(git diff*--output*)"
  "Bash(git push:*)" "Bash(git commit:*)" "Bash(git checkout:*)" "Bash(git reset:*)"
  "Bash(npm:*)" "Bash(npx:*)" "Bash(supabase:*)" "Bash(gh pr create:*)" "Bash(gh pr merge:*)"
)

# Il prompt va subito dopo `claude`: le opzioni a più valori (--allowedTools,
# --disallowedTools) prenderebbero per sé un argomento messo dopo.
CMD=(
  claude
  "$PROMPT"
  --model sonnet
  --strict-mcp-config --mcp-config "$DIR/mcp-vuoto.json"
  --agents "$AGENTI"
  --add-dir "$RAPPORTI"
  --allowedTools "${ALLOWED[@]}"
  --disallowedTools "${DISALLOWED[@]}"
)

echo "Sentinella: $N_COMMIT entrate in staging da leggere ($INTERVALLO), rapporto in $RAPPORTI/$OGGI.md"

if [[ "${SENTINELLA_DRY_RUN:-}" == "1" ]]; then
  for arg in "${CMD[@]}"; do
    if [[ "$arg" == "$PROMPT" ]]; then
      echo "  <prompt di $(printf '%s\n' "$PROMPT" | wc -l | tr -d ' ') righe>"
    elif [[ "$arg" == "$AGENTI" ]]; then
      echo "  <agenti: $(node -e 'console.log(Object.keys(JSON.parse(process.argv[1])).join(", "))' "$AGENTI")>"
    else
      printf '  %q\n' "$arg"
    fi
  done
  exit 0
fi

cd "$ROOT"
"${CMD[@]}"

# Il prossimo giro parte da qui solo se questo ha scritto il rapporto: una
# sessione chiusa prima del rapporto rilegge le stesse entrate.
if [[ -f "$RAPPORTI/$OGGI.md" ]]; then
  echo "$HEAD_SHA" > "$STATE_DIR/ultimo-giro"
else
  echo "Sentinella: rapporto $RAPPORTI/$OGGI.md non trovato, il prossimo giro rilegge le stesse entrate."
fi
