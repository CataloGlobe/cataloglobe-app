# La sede: contesto, voci, Scheda

Rifatto col lotto navigazione B-b (03/10/2026, §50.23). Sostituisce la pagina «a 7 tab» (`?tab=`), che non esiste più.

## Contesto di sede

Entrando in una sede (`/business/:businessId/locations/:activityId/…`) la sidebar diventa quella della sede (`SedeSidebar`, §46.1): intestazione con «← Tutte le sedi» (o «← Azienda» con una sede sola leggibile), nome e stato della sede, poi le voci.

Voci, ordine e gruppi stanno **solo** in `SEDE_NAV_ENTRIES` (`src/utils/navLanding.ts`), letti dalla sidebar e dall'atterraggio. Sei voci (§19.5):

| Gruppo | Voce | Rotta | Lettura | Piano |
|---|---|---|---|---|
| Ospiti | Servizio | `servizio` | `tables.read` **o** `seatings.read` | — (un modo è sempre aperto) |
| Ospiti | Prenotazioni | `prenotazioni` | `reservations.read` | `table_reservation` |
| Ordini | Comande | `comande` | `orders.read` | `table_ordering` |
| Ordini | Storico | `storico` | `orders.read` | `table_ordering` |
| — | Cosa vedono i clienti | `cosa-vedono` | `activity.read` | — |
| — | Scheda | `anagrafica` (+ `orari`, `ordini-prenotazioni`, `pubblicazione`) | `activity.read` | — |

I permessi si chiedono **su questa sede** (`canDoOnActivity`). Una voce senza piano resta visibile col lucchetto; una senza permesso sparisce.

**Atterraggio** (`SedeHomeRedirect`, indice della sede): la prima voce usabile nell'ordine della sidebar (permesso + piano; per Servizio almeno un modo usabile, `SedeNavEntry.usable`). Nessuna voce usabile: la Scheda, che dice il perché.

## Servizio

`src/pages/Dashboard/Servizio/`. Fuori dal parent della Scheda: legge la sede da sé. Tre modi in `?modo=`, decisi da `src/utils/servizioModes.ts` (puro, provato in `src/tests/navigation/servizioModes.test.ts`):

| Modo | Componente | Permessi sulla sede | Piano |
|---|---|---|---|
| `elenco` (predefinito) | `ServizioElenco` — In sala adesso · In arrivo · Concluse, «Senza prenotazione», drawer della tavolata | `reservations.read` + `seatings.read`; gesti `seatings.manage` | `table_reservation` |
| `mappa` | `TablesLiveView` + pannello del conto (`TableDetailDrawer`) | `tables.read` + `orders.read`; Conferma e Storna `orders.manage` | `table_ordering` |
| `gestisci` | `TablesManagement` (o `TablesEmptyState` senza ordini né prenotazioni) | `tables.read`; scritture `tables.manage` | — |

Un modo col lucchetto si vede spento e non si apre; un `?modo=` non usabile passa al primo usabile. Col piano Pro si atterra sull'Elenco, col base su Gestisci la sala. Un modo solo montato alla volta: cambiando modo i suoi canali realtime si chiudono.

L'Elenco apre le prenotazioni nello **stesso** dettaglio di Prenotazioni: dati, realtime, gesti differiti e drawer della prenotazione stanno nel banco condiviso `useReservationDesk` (`src/pages/Dashboard/Reservations/hooks/`) + `ReservationDrawers`. La banda «Oggi» è `ReservationsTodayStrip`, usata da tutte e due.

## Scheda

Quattro rotte figlie del parent `ActivityDetailPage` (§31): **Anagrafica** · **Orari** · **Ordini e prenotazioni** · **Pubblicazione**, tab in testata (`ACTIVITY_PAGES` in `ActivityDetailContext.ts`).

- Il parent legge una volta la sede, gli orari (`loadHours`) e la ragione sociale (`getTenantFiscalProfile`: `get_user_tenants()` non espone i campi fiscali) e li passa alle rotte con `Outlet` (`useActivityDetail`).
- **Draft unico** (`useActivityDraft`): le quattro pagine scrivono nella stessa bozza, un solo Salva nella `UnsavedChangesBar` del parent, guardia all'uscita `useUnsavedChangesGuard`. Le rotte registrano le loro validazioni con `registerValidator`.
- **Ordini e prenotazioni** contiene anche **capienza e durata media** della sala (lotto B-a: card «Capienza della sala», ancora `#capienza`, `activity.manage`), con le loro validazioni (capienza > 0, durata 15–600, conferma automatica solo con capienza).
- **Pubblicazione**: indirizzo pubblico, QR, menù in PDF, sospensione (`SuspendActivityDialog`) ed eliminazione.

## Fuori dal parent

`servizio`, `comande`, `storico`, `prenotazioni` e `cosa-vedono` sono rotte della sede ma non figlie della Scheda: niente tab della Scheda in testata, ognuna legge da sé.

## Indirizzi vecchi

- `?tab=` sull'indice della sede → `legacyTabTarget` (`navLanding.ts`): `profile`/`info`/`media` → Anagrafica, `hours` → Orari, `ordering`/`reservations` → Ordini e prenotazioni (`#ordini`/`#prenotazioni`), `settings`/`hours-services`/`access-control` → Pubblicazione, `sala`/`tables` → `servizio?modo=gestisci`, `service` → `servizio?modo=elenco`, `availability` → Cosa vedono. Sconosciuto → Anagrafica.
- Rotte: `sala` → `servizio?modo=gestisci`; `canali` → `ordini-prenotazioni`; `disponibilita` → `cosa-vedono`.
- `comande?tab=tavoli` → `servizio?modo=mappa`; `comande?tab=storico` → `storico`; `prenotazioni?tab=service` → `servizio?modo=elenco`.
