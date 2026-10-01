# supabase/functions — dettaglio per epic

Regole generali in root `CLAUDE.md` (`## Edge Functions`, `## Epic Ordinazioni dal tavolo`, `## Epic Prenotazioni`). Catalogo e bug history: `docs/edge-functions.md`.

## Prenotazioni

**Edge Functions** (`supabase/functions/`): `submit-reservation` (pubblica, rate-limit doppio slug+IP, gate subscription/piano attivi, validazione orari, poi RPC atomica) · `respond-reservation` (admin: confirm/decline/cancel/mark_no_show/undo_no_show) · `update-reservation` (admin, solo dati) · `cancel-reservation-public` (link firmato email) · `confirm-reservation-attendance` (link "confermo che vengo" nel reminder) · `reservation-availability` (lettura, solo slot già proposti dal client — no conteggi/motivi commerciali) · `resolve-reservation-privacy` · `send-reservation-reminders` (cron, 3 passate 18/19/20 IT) · `purge-reservation-data` (cron retention 36 mesi, dry-run default, auth fail-closed).

**`_shared/reservation*.ts`**: `reservationEmailCopy.ts` (copy cliente 5 lingue, dizionario TS — chiave mancante = errore di compilazione, non stringa vuota runtime) · `reservationEmails.ts` (builder puri, no I/O) · `reservationIcs.ts` (generatore .ics puro, `now` iniettato) · `reservationUpdate.ts` (`decideMoveNotification` — mail di spostamento SOLO se cambia data/ora) · `reservationTransitions.ts` (state machine, condivisa da `respond-reservation` e cancellazione pubblica) · `reservationToken.ts` / `reservationAlertRecipients.ts` / `reservationRetention.ts` / `reservationCancellation.ts`.

## Ordinazioni

**`resolve-table` + `get-orders-for-session`**: post-migration `table_zones` (γ-lite), entrambe fanno JOIN `tables → table_zones` e mappano `zone_data.name → zone` (alias backward-compat) nel payload customer. Customer storage (`localStorage tableZone`) + `ResolveTableResult.table.zone` invariati. Refactor effettuato nella stessa migration di `table_zones` per evitare runtime errors (SELECT su colonna droppata).

**Admin order transitions** (5 endpoint, tutti wrapper di `_shared/adminOrderTransition.ts`):
- `acknowledge-order`: `submitted → acknowledged` (popola `acknowledged_at`)
- `mark-order-ready`: `acknowledged → ready` (popola `ready_at`) — Step 4a
- `deliver-order`: `acknowledged|ready → delivered` (popola `delivered_at`) — Step 4a estende il source set: ora accetta entrambi cosi i workflow che saltano lo step "ready" continuano a funzionare
- `cancel-order-admin`: `submitted|acknowledged → cancelled` (popola `cancelled_at`, `cancelled_by='admin'`, `cancellation_reason`)
- `restore-order`: `delivered → acknowledged` (azzera `delivered_at` + `ready_at` via `clear_fields`, nessun timestamp dedicato di ripristino) — Step 5a, usato dallo Storico per recuperare i "Servito" accidentali. NB: ordini `cancelled` NON sono ripristinabili (terminale per design).
Tutte: optimistic locking via `expected_version`, error mapping unificato (409 `OPTIMISTIC_LOCK_CONFLICT` vs wrong-state via `details.reason`), rate limit 30/min per `(user, order)` con namespace per `function_name`. Service mirror in `src/services/supabase/orders.ts`: `acknowledgeOrder`, `markOrderReady`, `deliverOrder`, `cancelOrderAdmin`, `restoreOrder` — tutte ritornano `throwMappedTransitionError(parseInvokeError(err))` sui 4xx/5xx.

**Helper `_shared/adminOrderTransition.ts` — estensione Step 5a**: `TransitionConfig.timestamp_field` ora `?: string | null` (opzionale: passare `null` quando la transition non ha colonna timestamp dedicata, come `restore-order`). Nuovo `TransitionConfig.clear_fields?: string[]` — colonne SET = NULL al success (es. `restore-order` clears `delivered_at` + `ready_at`). `updated_at` settato SEMPRE indipendentemente da `timestamp_field`. Backward-compat: i 4 wrapper esistenti passano una stringa → invariati.
