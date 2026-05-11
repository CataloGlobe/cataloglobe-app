# Roadmap — Aree in sviluppo / da completare

Snapshot al 06/05/2026. Aggiornare quando un'area viene completata o abbandonata.

## Feature parziali / stub

- **Hub tab "eventi"** — implementato. TODO: estendere per mostrare anche eventi futuri (oggi solo correnti via scheduling resolver).
- **Traduzioni** — `LanguageSelector` UI presente, logica traduzioni non implementata (solo IT attivo).
- **Analytics** — pagina stub (`Analytics.tsx`).
- **Reviews** — rebuilt (aprile 2026), integrazione con Google Review URL presente.
- **Sottocategorie** — catalogo supporta L1/L2/L3, gestione UI da verificare.
- **Seat enforcement** — logica Stripe seats introdotta (`20260413100000`, `20260413110000`).

## Da implementare quando serve

- **Real-time sync regole** — la lista regole non ha Supabase Realtime. Modifiche di altri utenti del team non visibili senza refresh pagina. Da implementare se il caso d'uso multi-utente lo richiede.
- **Filtri avanzati Programmazione** — search attuale è solo testuale. Filtri per sede, periodo, stato (attiva/bozza/scaduta) da valutare se la lista diventa troppo lunga.
- **Fasce orarie multiple per regola** — analisi di impatto completata (aprile 2026). Opzione scelta: colonna JSONB `time_ranges` su `schedules`. 16 file da modificare, complessità media. Non implementata per rapporto costo-beneficio: il workaround (duplicare la regola con orari diversi) è sufficiente. Da implementare quando il feedback clienti lo richiede. Rischi principali: sincronizzazione atomica (migration + 2 copie resolver + deploy edge function), retrocompatibilità regole esistenti (migration SQL converte `time_from`/`time_to` → `time_ranges`).

## Refactor candidati

- **`CONTENT_MAX_WIDTH` in token condiviso** — il valore max content width desktop (1280px) vive in 2 file SCSS + 1 costante TS in `PublicCollectionHeader.tsx` senza single source of truth. Causa documentata di edit incompleti. Da estrarre in `--pub-frame-max-desktop` letto sia da SCSS che via `getComputedStyle()` da TS.
- **Consolidare tabelle audit `audit_logs` + `audit_events`** — schema diverso, scope sovrapposto (vedi `docs/database-reference.md`). Candidate per merge in singola tabella. Bassa priorità.

## Operativo

- **Toggle "Prevent use of leaked passwords"** — Supabase Dashboard → Authentication → Attack Protection. Bloccato su piano Free: feature disponibile solo da Pro plan in su. Quando passerai a Pro, attivalo su staging E prod (toggle + Save changes, niente migration). Risolve 1 warning Security Advisor `auth_leaked_password_protection`. Razionale: Supabase verifica le password contro DB HaveIBeenPwned al signup/password change, rifiuta password compromesse note. Zero rischio abilitare, zero impatto runtime.

## Completati di recente

- **Test Fase 2 GDPR — `purgeTenantData` end-to-end (11/05/2026)** — Path completo verificato runtime con tenant realistico (cover sede + gallery image + scheduling rule layout + analytics events). Scoperti e fixati 2 bug bloccanti in `supabase/functions/_shared/tenant-purge.ts`: FK ordering (`schedule_layout` eliminato dopo `catalogs`/`styles` → `23503` su tutti i tenant con regole Programmazione) e storage ricorsione (`purgeActivityFolder` non scendeva nei subpath `gallery/`, throw su `remove()` errore bloccava cleanup altri bucket → file orfani indefinitamente). Nessun residuo DB/storage post-purge, audit log con contatori corretti incluso `storageFilesRemoved`. Task Notion `[Privacy] Diritto cancellazione` chiudibile come "Fatto" con confidenza piena. Dettagli pattern in `CLAUDE.md` → sezione Edge Functions.
