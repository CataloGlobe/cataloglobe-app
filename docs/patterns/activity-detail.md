# Pagina dettaglio sede

**Percorso**: `/business/:businessId/locations/:activityId` → `ActivityDetailPage`.

Struttura a **7 tab** via `?tab=` query param. L'ordine da sinistra a destra è la sequenza in cui affrontarle: prima si descrive il locale, poi si definiscono orari e sala, poi si accendono i canali.

- `profile` (default) — Profilo — `ActivityProfileTab`: immagini, identità (nome, indirizzo, slug), contatti, social, e **cosa offre il locale** (Pagamenti / Servizi / Tariffe, accordion `ConfigAccordionSection` single-open con blocco se un accordion è sporco, draft + `UnsavedChangesBar` per sezione, toggle `*_public` a save immediato).
- `hours` — Orari — `ActivityHoursTab`: orari di apertura + chiusure straordinarie con i 3 drawer. Gli orari sono caricati a livello pagina (`loadHours` in `ActivityDetailPage`) perché li legge anche Prenotazioni.
- `sala` — Sala — `TablesManagement` (CRUD tavoli, ex `tables`) dietro `PageGate tables.read`, più la card **Capienza della sala** (capienza in coperti + durata media tavolo, draft + `UnsavedChangesBar`, confronto con i posti mappati calcolato dai tavoli già in memoria). Scrive SOLO `reservation_capacity` + `reservation_duration_minutes`; rifiuta di togliere la capienza se la conferma prenotazioni è «auto» (CHECK `activities_auto_requires_capacity`). `TablesEmptyState` con rimandi a Ordinazioni / Prenotazioni se nessun canale è attivo.
- `availability` — Disponibilità — `ActivityAvailabilityTab` (visibilità prodotti per sede; **non** gli orari). Destinazione finale ancora da decidere, nome invariato.
- `ordering` — Ordinazioni — `ActivityOrderingTab`: riga prerequisiti («Sede pubblicata»), toggle `ordering_enabled` (gate `activity.manage` + feature `table_ordering`), Stampanti (`PrintersSection`, permessi `tables.*` propri), rimando a Ordini.
- `reservations` — Prenotazioni — `ActivityReservationsTab`: riga prerequisiti (orari, capienza, ragione sociale), toggle `enable_reservations` (gate `activity.manage` + feature `table_reservation`), promemoria, email avvisi (+ quick-pick team se `team.read`), email privacy, accordion «Regole di accettazione» (quando è pieno / conferma / ritmo degli arrivi — draft a 5 campi, mai capienza/durata). Il radio «Conferma automatica» è disabilitato senza capienza, con spiegazione e link a Sala. Rimando a Prenotazioni.
- `settings` — Impostazioni — `ActivitySettingsTab`: **la sede come oggetto** — Accesso pubblico (URL, QR + modale colori, menù PDF), Stato pubblicazione, Eliminazione.

Valori e label vivono in `TAB_VALUES` / `TAB_LABELS` (`ActivityDetailPage.tsx`): `Tabs.Tab`, picker compatto e guard `isTabValue` derivano da lì. Il bounded-scroll delle tab a tabella è cablato in `ActivityDetailPage.module.scss` su `data-active-tab="availability"` e `"sala"`.

**Dati a livello pagina** (`ActivityDetailPage`): la riga `activity` (capienza, durata, modalità conferma, stato), `hours` (+ `loadHours`, passato a Orari come `onHoursChanged`), `legalName` (una `getTenantFiscalProfile` per apertura sede: `get_user_tenants()` NON espone i campi fiscali, quindi `selectedTenant.legal_name` è sempre vuoto). Una tab scrive → `fetchData` / `loadHours` → le altre rileggono dalle prop, senza reload.

**Prerequisiti** (`src/components/ui/PrerequisitesRow/`): voci dal chiamante (`{label, ok, consequence, actionLabel, href|onAction}`), nessun fetch. Pannello ambra se manca qualcosa, riga sottile con spunta se tutto è a posto, `null` in `loading`. Voci che costerebbero una lettura in più (tavoli mappati, menù pubblicato) sono state lasciate fuori per scelta.

**SCSS**: card, header, `layout`/`row`, `skeletonCard`, `lockedFeatureCaption` condivisi in `tabs/ActivityTabCards.module.scss` (importato da Impostazioni, Orari, Ordinazioni, Prenotazioni, e da Profilo per il solo `cardBodyFlat`). Le classi proprie di una tab restano nel suo modulo; Profilo ha le sue card (padding diversi, non unificate di proposito).

**Feature gating**: Ordinazioni e Prenotazioni restano visibili anche senza `table_ordering` / `table_reservation`: il contenuto mostra il toggle disabilitato + caption «Disponibile con il piano Pro». Niente `PageGate feature` sulle tab (CTA solo owner/admin → un manager vedrebbe una tab vuota).

**Legacy redirects** (`LEGACY_TAB_MAP` in `ActivityDetailPage.tsx`):
`info → profile`, `media → profile`, `hours-services → settings`, `access-control → settings`, `tables → sala`. Vecchi link esterni continuano a funzionare; valori sconosciuti cadono su `profile`.

**Tab Impostazioni** — card:
- **Accesso pubblico**: URL pubblico, QR code (modale customizzazione via bottone "Personalizza" + click su thumbnail), menù PDF (drawer export).
- **Stato pubblicazione**: bottoni dinamici — "Sospendi pubblicazione" se active, "Modifica motivo" + "Riprendi pubblicazione" se inactive. La modale `SuspendActivityDialog` supporta `mode: "suspend" | "edit-reason"` con `initialReason` per pre-fill. Gate `activity.manage`.
- **Eliminazione**: `ConfirmDialog` + `deleteActivityAtomic`.

**Header pagina**: nessun badge nella banda — lo stato sede (Pubblicata/Sospesa) vive nella lista Sedi e nella card Stato pubblicazione.
