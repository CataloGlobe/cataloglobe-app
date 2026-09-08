# Pagina dettaglio sede

**Percorso**: `/business/:businessId/locations/:activityId` → `ActivityDetailPage`.

Struttura a **7 tab** via `?tab=` query param. L'ordine da sinistra a destra è la sequenza in cui affrontarle (FASE 6, riorganizzazione in corso):

- `profile` (default) — Profilo — `ActivityProfileTab`
- `hours` — Orari — **ponte**: monta `ActivitySettingsTab` intera finché orari + chiusure non vengono estratti
- `sala` — Sala — `TablesManagement` (CRUD tavoli, ex `tables`) dietro `PageGate tables.read`; `TablesEmptyState` con rimandi a Ordinazioni / Prenotazioni se nessun canale è attivo
- `availability` — Disponibilità — `ActivityAvailabilityTab` (visibilità prodotti per sede; **non** gli orari). Destinazione finale ancora da decidere, nome invariato
- `ordering` — Ordinazioni — **ponte**: monta `ActivitySettingsTab` intera
- `reservations` — Prenotazioni — **ponte**: monta `ActivitySettingsTab` intera
- `settings` — Impostazioni — `ActivitySettingsTab`

Valori e label vivono in `TAB_VALUES` / `TAB_LABELS` (`ActivityDetailPage.tsx`): `Tabs.Tab`, picker compatto e guard `isTabValue` derivano da lì. Il bounded-scroll delle tab a tabella è cablato in `ActivityDetailPage.module.scss` su `data-active-tab="availability"` e `"sala"`.

**Feature gating**: Ordinazioni e Prenotazioni restano visibili anche senza `table_ordering` / `table_reservation`: il contenuto mostra il toggle disabilitato + caption «Disponibile con il piano Pro». Niente `PageGate feature` sulle tab (CTA solo owner/admin → un manager vedrebbe una tab vuota).

**Legacy redirects** (`LEGACY_TAB_MAP` in `ActivityDetailPage.tsx`):
`info → profile`, `media → profile`, `hours-services → settings`, `access-control → settings`, `tables → sala`. Vecchi link esterni continuano a funzionare; valori sconosciuti cadono su `profile`.

**Header pagina**: titolo + `StatusBadge` inline ("Pubblicata"/"Sospesa") — visibile su tutte le tab.

**Tab Impostazioni** — card chiave:
- **Accesso pubblico**: URL pubblico, QR code (modale customizzazione via bottone "Personalizza" + click su thumbnail), Catalogo PDF (drawer export).
- **Configurazione sede**: accordion single-open con 3 sezioni — Pagamenti / Servizi / Tariffe. Pattern draft + `UnsavedChangesBar` (vedi `docs/patterns/draft-unsaved-bar.md`). Sezioni interne (`PaymentMethodsSection`, `ServicesSection`, `FeesSection`) sono **controlled**.
- **Stato pubblicazione**: bottoni dinamici — "Sospendi pubblicazione" se active, "Modifica motivo" + "Riprendi pubblicazione" se inactive. La modale `SuspendActivityDialog` supporta `mode: "suspend" | "edit-reason"` con `initialReason` per pre-fill.
