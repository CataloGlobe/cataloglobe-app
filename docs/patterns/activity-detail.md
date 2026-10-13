# La sede: contesto, voci, Scheda

Rifatto col lotto navigazione B-b (03/10/2026, §50.23) e con la Navigazione v2 (§51). Sostituisce la pagina «a 7 tab» (`?tab=`), che non esiste più.

## Contesto di sede

Si conta sulle sedi **che chi guarda può leggere** (§51.2). La sidebar è una sola in ogni contesto (`TenantSidebar`, voci da `useNavGroups`): con **una** sede le voci di sede portano a quella sede anche da una pagina d'azienda e `/locations` porta alla Scheda (al posto di Sedi c'è «Il locale»); con **più** sedi le sezioni sono le stesse fuori e dentro una sede, e la sede si sceglie in alto a destra nella pagina (`SediInAlto` in `PageTitleBar`, D152), con «Sospesa» accanto al nome. Non c'è più una sidebar della sede né «← Tutte le sedi».

Voci, ordine e sezioni stanno **solo** in `NAV_MODELS` (`src/utils/navModel.ts`), letti dalla sidebar, da `SediInAlto` e dall'atterraggio. Le pagine che vivono sotto una sede (`SEDE_ENTRIES`):

| Sezione in sidebar | Voce | Rotta | Lettura | Piano |
|---|---|---|---|---|
| Sedi («Il locale» con una sede) | Scheda | `anagrafica` (+ `orari`, `ordini-prenotazioni`, `pubblicazione`) | `activity.read` | — |
| Servizio | Cosa vedono i clienti | `cosa-vedono` | `activity.read` | — |
| Calendario | Programmazione della sede | `programmazione` | `scheduling.read` | — |
| Servizio | In servizio | `servizio` | `tables.read` **o** `seatings.read` | — (un modo è sempre aperto) |
| Servizio (dentro «In servizio») | Prenotazioni | `prenotazioni` | `reservations.read` | `table_reservation` |
| Servizio (dentro «In servizio») | Comande | `comande` | `orders.read` | `table_ordering` |
| Servizio | Storico | `storico` | `orders.read` | `table_ordering` |
| Clienti e numeri | Andamento | `analitiche` | `analytics.read` | — |
| Clienti e numeri | Recensioni | `recensioni` | `reviews.read` | — |

Il piede è il menù dell'account (`SidebarAccount`: Impostazioni · Team · Abbonamento · Lingue · Assistenza, filtrati per permessi), uguale in tutti i contesti. I permessi si chiedono **su questa sede** (`canDoOnActivity`). Una voce senza piano resta visibile col lucchetto; una senza permesso sparisce.

**Atterraggio** (`SedeHomeRedirect`, `sedeLandingSegment`, §51.6): chi gestisce la sede (owner, admin, `activity.manage` sulla sede) entra dalla Scheda; staff e viewer dalla prima voce di Servizio usabile (`OPERATIVE_ENTRIES`: In servizio · Sala · Prenotazioni · Comande · Storico; permesso + piano, per In servizio almeno un modo usabile, `NavEntry.usable`). Nessuna voce usabile: la Scheda, che dice il perché.

**Cambio sede** da «Sede» in alto a destra (`switchSedePath`): resta sulla stessa pagina se nella sede nuova si può usare, altrimenti si atterra come entrando.

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

Una rotta sola sotto il parent `ActivityDetailPage` (§31): **`anagrafica`** (`ActivitySchedaRoute`, Officina 3, C+++ «Scorrono insieme»). È un cruscotto di tessere, una per parte (`SchedaPart`: il locale, quando siete aperti, come vi contattano, dove vi trovano, la vostra pagina e il QR, pagamenti e servizi, al conto, prenotazioni online, ordini dal tavolo; titoli in `scheda/schedaCopy.ts`), con accanto il telefono «Come la vede il cliente» che scorre insieme. Una parte si apre a fuoco con `?parte=<parte>`; niente tab in testata.

- Il parent legge una volta la sede, gli orari (`loadHours`) e la ragione sociale (`getTenantFiscalProfile`: `get_user_tenants()` non espone i campi fiscali) e li passa alla rotta con `Outlet` (`useActivityDetail`).
- **Draft unico** (`useActivityDraft`): tutte le parti scrivono nella stessa bozza, un solo Salva nella testata (`HeaderSaveAction`), guardia all'uscita `useUnsavedChangesGuard`. Le parti registrano le loro validazioni con `registerValidator`.
- La tessera si apre col clic ovunque; per tastiera e lettore di schermo il pulsante è il titolo («Titolo: apri»), e interruttori e «Riprova» restano controlli a sé.
- **La vostra pagina e il QR**: indirizzo pubblico, QR, menù in PDF, sospensione (`SuspendActivityDialog`) ed eliminazione.

## Fuori dal parent

`servizio`, `comande`, `storico`, `prenotazioni`, `cosa-vedono`, `analitiche` e `recensioni` sono rotte della sede ma non figlie della Scheda: niente tab della Scheda in testata, ognuna legge da sé. Analitiche e Recensioni sono le pagine d'azienda montate sulla rotta di sede (sede dal path, §51.10).

## Indirizzi vecchi

- `?tab=` sull'indice della sede → `legacyTabTarget` (`navLanding.ts`, che tiene solo questo): `profile`/`info`/`media` → Anagrafica, `hours` → Orari, `ordering`/`reservations` → Ordini e prenotazioni (`#ordini`/`#prenotazioni`), `settings`/`hours-services`/`access-control` → la parte «La vostra pagina e il QR», `sala`/`tables` → `servizio?modo=sala`, `service` → `servizio?modo=elenco`, `availability` → Cosa vedono. Sconosciuto → Anagrafica.
- Rotte: `sala` → `servizio?modo=sala`; `come-lavorate` → la Scheda; `orari`, `pubblicazione`, `ordini-al-tavolo`, `prenotazioni-online`, `ordini-prenotazioni` e `canali` → la Scheda con la loro parte (`SchedaRedirect`, `?parte=`); `disponibilita` → `cosa-vedono`.
- `comande?tab=tavoli` → `servizio?modo=mappa`; `comande?tab=storico` → `storico`; `prenotazioni?tab=service` → `servizio?modo=elenco`.
