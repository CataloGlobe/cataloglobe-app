# Pagina dettaglio sede

**Percorso**: `/business/:businessId/locations/:activityId` → `ActivityDetailPage`.

Struttura a **3 tab** via `?tab=` query param:

- `profile` (default) — `ActivityProfileTab`
- `availability` — `ActivityAvailabilityTab`
- `settings` — `ActivitySettingsTab`

**Legacy redirects** (`LEGACY_TAB_MAP` in `ActivityDetailPage.tsx`):
`info → profile`, `media → profile`, `hours-services → settings`, `access-control → settings`. Vecchi link esterni continuano a funzionare.

**Header pagina**: titolo + `StatusBadge` inline ("Pubblicata"/"Sospesa") — visibile su tutte le tab.

**Tab Impostazioni** — card chiave:
- **Accesso pubblico**: URL pubblico, QR code (modale customizzazione via bottone "Personalizza" + click su thumbnail), Catalogo PDF (drawer export).
- **Configurazione sede**: accordion single-open con 3 sezioni — Pagamenti / Servizi / Tariffe. Pattern draft + `UnsavedChangesBar` (vedi `docs/patterns/draft-unsaved-bar.md`). Sezioni interne (`PaymentMethodsSection`, `ServicesSection`, `FeesSection`) sono **controlled**.
- **Stato pubblicazione**: bottoni dinamici — "Sospendi pubblicazione" se active, "Modifica motivo" + "Riprendi pubblicazione" se inactive. La modale `SuspendActivityDialog` supporta `mode: "suspend" | "edit-reason"` con `initialReason` per pre-fill.
