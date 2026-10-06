---
description: Review di una PR in un worktree isolato (regole CLAUDE.md, tsc, lint, vitest, build, security review) con esito pubblicato su GitHub e merge solo dopo l'ok esplicito di Lorenzo
argument-hint: <numero PR>
---

# Review PR #$ARGUMENTS

Numero PR: `$ARGUMENTS`. Se vuoto o non numerico: fermati e chiedilo.
Nel resto del comando `N` = `$ARGUMENTS`, `ROOT` = cartella principale del repo (`git rev-parse --show-toplevel` lanciato PRIMA del passo 1), `WT` = `$ROOT/../review-pr-N` (path assoluto).

## Vincoli assoluti

- Tutto il lavoro sul codice della PR avviene in `WT`. MAI `gh pr checkout`, `git checkout`, `git switch`, `git stash` o `git reset` nella cartella principale: lì ci sono modifiche WIP di altre sessioni.
- NON fare push, NON fare commit, NON modificare file della PR.
- NON fare merge, tranne al passo 7: solo con esito «✅ Pronta per merge» e dopo l'ok esplicito di Lorenzo su quella PR, dato DOPO il report finale. Un ok generico («procedi», «vai avanti») o dato prima della review non vale.
- NON applicare migration: niente `supabase db push`, `supabase link`, `supabase functions deploy`, niente `apply_migration`/`execute_sql` via MCP.
- MAI `/security-review` diretto dalla cartella principale: la security review la fa un subagente sul worktree (passo 4).
- Il passo 6 (pulizia) va eseguito SEMPRE, anche se un passo precedente fallisce.

## 1. Worktree

```bash
git -C "$ROOT" fetch origin staging
gh pr view N --json number,title,state,baseRefName,headRefName,author,isDraft
```

- PR inesistente o `state != OPEN` → fermati e dillo.
- `baseRefName != staging` → segnalalo all'utente; il diff resta calcolato contro `origin/staging`, come richiesto.
- Se `WT` esiste già → fermati e chiedi (potrebbe essere una review in corso). Non cancellarlo da solo.

```bash
git -C "$ROOT" worktree add --detach "$WT" origin/staging
cd "$WT" && gh pr checkout N --detach
```

`--detach` evita di creare branch locali e il conflitto «already checked out» se il branch della PR è aperto altrove. Da qui in poi ogni comando gira con cwd `WT` (verificare con `pwd` prima dei passi 2–5).

Dipendenze e ambiente:

```bash
cd "$WT" && npm ci
[ -f "$ROOT/.env.local" ] && cp "$ROOT/.env.local" "$WT/.env.local"
```

`.env.local` è gitignored, sparisce con il worktree. Non leggerne né stamparne il contenuto.

## 2. Diff e regole

Diff su merge-base (tre punti), così i commit arrivati su staging dopo l'apertura della PR non contano:

```bash
git diff --stat origin/staging...HEAD
git diff --name-status origin/staging...HEAD
git diff origin/staging...HEAD
```

Se il diff è grande, leggerlo per file con `git diff origin/staging...HEAD -- <path>`.

### 2a. Migration esistenti (bloccante)

```bash
git diff --name-status --diff-filter=MDRT origin/staging...HEAD -- supabase/migrations/
```

Qualunque riga = migration esistente modificata, cancellata o rinominata → severità **critica**. Le sole `A` (aggiunte) sono ammesse. Per ogni migration nuova controllare anche:
- timestamp non in collisione con una migration già su `origin/staging` (`git ls-tree --name-only origin/staging supabase/migrations/`);
- `CREATE OR REPLACE` di funzione esistente: chiedersi se parte dal live (`pg_get_functiondef`); se ricopia una migration precedente, segnalarlo (incidenti `20260413120000`, `20260920140000`);
- `CREATE FUNCTION` + `REVOKE`/`GRANT` nello stesso file (`42601` in `db push`);
- `SET search_path TO ''`, `REVOKE ... FROM PUBLIC` (+ `anon, authenticated` per le SECURITY DEFINER non pubbliche), `DROP POLICY IF EXISTS`, RLS + 4 policy sulle tabelle nuove con `tenant_id`, `IN (SELECT get_my_tenant_ids())` e mai `= ANY(...)`.

### 2b. Sezione PROIBITO di `CLAUDE.md`

Rileggere `CLAUDE.md` del worktree (versione della PR) e verificare ogni voce di `## PROIBITO` sulle righe aggiunte del diff. In particolare, con grep mirati sulle sole righe `+`:
- `any` in TypeScript, `v2_` nelle query dei service, `service_role` nel frontend, `tenant_id` da `auth.user.id`, `v2_activity_schedules`;
- `supabase.` / `.from(` / `.rpc(` / `functions.invoke` dentro componenti o pagine (fuori da `src/services/`);
- CSS inline (`style={{`), testi UI in inglese, «Attiva»/«Inattiva» per lo stato sede, `owner_user_id` in UI;
- `SystemDrawer width=`, conferme irreversibili su `ModalLayout`, import di `SectionCard`/`Sidebar`, `#hex`/`font-size`/`transition` non tokenizzati nei `.module.scss` di pagina;
- `useRef<...setTimeout>` per debounce di save, chiave `localStorage` che spegne un avviso;
- route pubbliche slug-based in `App.tsx`/`entry-client.tsx`; nuova route a segmento singolo senza `vercel.json` + `RESERVED_SEGMENTS` + `is_reserved_slug()`;
- chiamate DB/edge senza timeout nella pagina pubblica;
- file duplicati ⚠️ SYNC modificati da un solo lato (`scheduleResolver.ts`, `priceSummary.ts`, `company.ts`/`company-config.ts`, `fiscalValidators.ts`, `leadValidation.ts`, regola orari prenotazioni nei 3 file, `serviceDay.ts`): se un lato è nel diff e l'altro no → **alta**.

### 2c. Pattern

- **Service layer**: firme `list*/get*/create*/update*/delete*` con `tenantId`, `list*` → `T[]` mai `null`, `get*` lancia se non trova, gestione `error.code` (`PGRST116`/`23503`/`23505`) poi `throw`.
- **Drawer**: CRUD in `SystemDrawer` → `DrawerLayout` → form separato con `formId`; submit nel footer collegato via `form=`, mai dentro il `<form>`; post-success reload → chiudi → toast; `size="sm|md|lg"`.
- **Page**: `usePageHeader` prima di ogni early return; `loadData` in `useCallback`; toast nei `catch`; bulk delete via `ConfirmDialog` + `useBulkDelete`; guard abbonamento via `useEnsureActive`.
- **Permessi**: dentro `/business/:businessId/*` gating con `usePermissions()` + helper di `src/lib/permissions.ts`; nel workspace solo `src/utils/workspaceRole.ts`; niente `userRole` da `TenantContext`, niente API legacy; pre-check prima delle RPC (`canChangeRoleOf`, `canRemoveMember`, `canInviteRole`); pagina bloccata = `EmptyState` + `Lock`; RLS activity-scoped via `has_permission(...)`.
- **Resolver**: se il diff tocca `scheduleResolver.ts`, `schedulingNow.ts`, `resolveActivityCatalogs.ts` o `ruleAppearance.ts`, i rispettivi contract test devono essere nel diff con casi nuovi.

Ogni problema trovato va annotato con `file:riga` (riga nel file della PR, non nel diff), severità e una riga di motivazione.

## 3. Controlli automatici

Dal worktree, uno alla volta, salvando esito e le righe di errore rilevanti (output lungo: filtrarlo, non incollarlo intero):

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
npm run ds:budget:check
```

Ogni comando che fallisce → problema **alta** con il primo errore (`file:riga` e messaggio esatto). Se un fallimento esiste identico anche su `origin/staging` (verificabile solo leggendo il messaggio, non rifacendo checkout nella cartella principale), annotarlo come «preesistente» e non farne motivo di request-changes.

## 4. Security review (condizionale)

Se `git diff --name-only origin/staging...HEAD` contiene almeno uno di:
- `supabase/migrations/`
- `supabase/functions/`
- policy RLS / `has_permission` / `get_my_tenant_ids` nel diff
- auth: `src/context/AuthProvider*`, `src/services/supabase/auth*`, OTP, `src/lib/permissions.ts`, `src/context/PermissionsContext.tsx`, `src/utils/workspaceRole.ts`
- billing: `src/services/supabase/billing.ts`, `stripe-*`, `_shared/stripe-helpers.ts`, `subscriptionStatusSync.ts`, `fiscalValidators.ts`

allora la security review la esegue un **subagente** (Agent tool, `general-purpose`), mai `/security-review` diretto: lanciato dalla sessione legge `git status`/`git diff` della cartella principale (branch e WIP sbagliati) e vede un diff vuoto.

Prompt del subagente, con almeno:
- cwd di lavoro = `WT` (path assoluto); ogni comando git con `git -C "$WT"`; diff = `git -C "$WT" diff origin/staging...HEAD`; sola lettura, nessun file modificato, cartella principale mai toccata;
- obiettivo e categorie della skill `security-review` (authz/privilege escalation, injection, esposizione dati/PII, auth/JWT, segreti), con le sue esclusioni (DoS, rate limiting, hardening generico, race teoriche, audit log, documentazione) e precedenti (UUID non indovinabili, env fidate, client-side non è un confine di fiducia);
- contesto CataloGlobe da verificare nel worktree: RLS e helper (`get_my_tenant_ids`, `has_permission`, `is_platform_admin`), grant di default Supabase su funzioni nuove, `service_role` bypassa RLS, pg_cron gira come `postgres`;
- filtro falsi positivi: confidenza 1–10 per finding, scartare sotto 8; output markdown `file:riga`, severità, scenario di exploit, fix; in coda le note sotto soglia rilevanti (es. GDPR/conservazione dati).

I finding sopra soglia confluiscono nell'elenco con la loro severità; le note sotto soglia si valutano e, se reali, entrano come problemi di correttezza. Altrimenti scrivere «Security review: non necessaria (nessun file sensibile nel diff)».

## 5. Esito su GitHub

Severità: **critica** (perdita dati, falla di sicurezza, migration esistente modificata, cross-tenant), **alta** (build/tsc/test rotti, violazione PROIBITO, SYNC disallineato), **media** (pattern non rispettato), **bassa** (stile, naming, suggerimento).

Decisione (MAI `--approve`: l'approvazione la dà Lorenzo):
- almeno una **critica** o **alta** non preesistente → `--request-changes`;
- altrimenti → `--comment`, con prima riga del corpo esattamente `✅ Pronta per merge`.

Scrivere il corpo in un file nello scratchpad (mai inline nel comando, per non rompere il quoting), in italiano:

```markdown
✅ Pronta per merge          ← solo con --comment; con --request-changes la prima riga è «❌ Modifiche richieste»

## Review automatica — PR #N

### Controlli
| Controllo | Esito |
|---|---|
| tsc --noEmit | ✅ / ❌ |
| lint | … |
| vitest | … |
| build | … |
| ds:budget:check | … |
| Migration esistenti intatte | … |
| Security review | eseguita / non necessaria |

### Problemi
| Severità | File:riga | Problema |
|---|---|---|
| critica | `path/file.ts:42` | … |

(oppure «Nessun problema trovato.»)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Problemi ordinati per severità decrescente. Poi:

```bash
gh pr review N --request-changes --body-file <file>
# oppure
gh pr review N --comment --body-file <file>
```

Se GitHub rifiuta `--request-changes` (es. «Can not request changes on your own pull request»): ripiegare su `gh pr review N --comment --body-file <file>`, con l'esito «❌ Modifiche richieste» in prima riga, e dirlo all'utente.

## 6. Pulizia (sempre)

```bash
cd "$ROOT"
git worktree remove --force "$WT"
git worktree prune
git worktree list
```

`--force` serve per `node_modules`, `dist` e `.env.local` non tracciati. Verificare che `WT` non compaia più in `git worktree list` e che `git -C "$ROOT" status --short` sia identico a quello di partenza.

## Report finale all'utente

In chat, in italiano semplice, in quest'ordine:

1. **Cosa fa la PR**: in 3-6 righe, cosa cambia per chi usa l'app (o per il team), senza gergo; poi i file principali toccati e se ci sono migration o edge nuove.
2. **Cosa ho controllato**: esito pubblicato (request-changes o comment «✅ Pronta per merge») con link alla PR, controlli passati e falliti, se la security review è stata eseguita.
3. **Problemi**: conteggio per severità e i punti che richiedono il giudizio di Lorenzo, con `file:riga`.
4. **Dopo il merge**: i passi operativi in ordine (migration con nome completo e se serve `--include-all`, segreti solo per nome, deploy di edge, cron, interruttori), presi dalla PR e dalla sua descrizione.
5. Conferma rimozione worktree e head rivisto (`headRefOid`, 8 caratteri).

Se l'esito è «✅ Pronta per merge», chiudi chiedendo: «Unisco la #N?». Poi fermati e aspetta la risposta.

## 7. Merge (solo dopo l'ok)

Solo se l'esito è «✅ Pronta per merge» e Lorenzo, DOPO aver letto il report, risponde sì a «Unisco la #N?». Senza quell'ok esplicito non si unisce, mai.

```bash
H=<headRefOid completo rivisto al passo 1>
CUR=$(gh pr view N --json headRefOid -q .headRefOid)
[ "$CUR" = "$H" ] && gh pr merge N --merge --match-head-commit "$H"
gh pr view N --json state,mergeCommit
```

- Se l'head è cambiato dopo la review: NON unire. Rivedi solo i commit nuovi (`git diff $H $CUR`), riporta l'esito e richiedi l'ok.
- Metodo: merge commit (`--merge`), come le altre PR del repo. Mai `--admin`, mai `--delete-branch` sui branch di altri.
- Dopo il merge: riporta il merge commit e ripeti i passi «Dopo il merge». Migration, segreti, deploy e cron restano a Lorenzo: questo comando non li esegue.
