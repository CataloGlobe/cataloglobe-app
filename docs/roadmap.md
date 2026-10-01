# Roadmap — Aree in sviluppo / da completare

Snapshot al 06/05/2026. Aggiornare quando un'area viene completata o abbandonata.

## Feature parziali / stub

- **Hub tab "eventi"** — implementato. TODO: estendere per mostrare anche eventi futuri (oggi solo correnti via scheduling resolver).
- **Analytics** — pagina stub (`Analytics.tsx`).
- **Reviews** — rebuilt (aprile 2026), integrazione con Google Review URL presente.
- **Sottocategorie** — catalogo supporta L1/L2/L3, gestione UI da verificare.
- **Seat enforcement** — logica Stripe seats introdotta (`20260413100000`, `20260413110000`).

## Da implementare quando serve

- **Real-time sync regole** — la lista regole non ha Supabase Realtime. Modifiche di altri utenti del team non visibili senza refresh pagina. Da implementare se il caso d'uso multi-utente lo richiede.
- **Filtri avanzati Programmazione** — search attuale è solo testuale. Filtri per sede, periodo, stato (attiva/bozza/scaduta) da valutare se la lista diventa troppo lunga.
- **Fasce orarie multiple per regola** — analisi di impatto completata (aprile 2026). Opzione scelta: colonna JSONB `time_ranges` su `schedules`. 16 file da modificare, complessità media. Non implementata per rapporto costo-beneficio: il workaround (duplicare la regola con orari diversi) è sufficiente. Da implementare quando il feedback clienti lo richiede. Rischi principali: sincronizzazione atomica (migration + 2 copie resolver + deploy edge function), retrocompatibilità regole esistenti (migration SQL converte `time_from`/`time_to` → `time_ranges`).

## Refactor candidati

- **Consolidare tabelle audit `audit_logs` + `audit_events`** — schema diverso, scope sovrapposto (vedi `docs/database-reference.md`). Candidate per merge in singola tabella. Bassa priorità.

## Operativo

- **Toggle "Prevent use of leaked passwords"** — Supabase Dashboard → Authentication → Attack Protection. Bloccato su piano Free: feature disponibile solo da Pro plan in su. Quando passerai a Pro, attivalo su staging E prod (toggle + Save changes, niente migration). Risolve 1 warning Security Advisor `auth_leaked_password_protection`. Razionale: Supabase verifica le password contro DB HaveIBeenPwned al signup/password change, rifiuta password compromesse note. Zero rischio abilitare, zero impatto runtime.

## Completati di recente

- **Traduzioni** — sistema completo end-to-end: service layer (`translations.ts`, `translationJobs.ts`, `translationStatus.ts`, `tenantLanguages.ts`), `TranslationsTab` UI (CatalogEngine + ProductPage), provider DeepL + router + tick processor Edge (`supabase/functions/_shared/translation/`), pg_cron a 30s, override manuale non sovrascritto, pagina `/languages`. Lato pubblico: `effectiveLanguage`/`availableLanguages`, `LanguageFallbackBanner`, `StaleDataBanner`. Residuo reale: solo IT attivo come lingua live per i tenant (EN/FR/DE da abilitare), e permission dedicato `translations.read` ancora mancante — gated su `catalogs.read` come proxy (vedi CLAUDE.md → Aree in sviluppo).
- **Test Fase 2 GDPR — `purgeTenantData` end-to-end (11/05/2026)** — Path completo verificato runtime con tenant realistico (cover sede + gallery image + scheduling rule layout + analytics events). Scoperti e fixati 2 bug bloccanti in `supabase/functions/_shared/tenant-purge.ts`: FK ordering (`schedule_layout` eliminato dopo `catalogs`/`styles` → `23503` su tutti i tenant con regole Programmazione) e storage ricorsione (`purgeActivityFolder` non scendeva nei subpath `gallery/`, throw su `remove()` errore bloccava cleanup altri bucket → file orfani indefinitamente). Nessun residuo DB/storage post-purge, audit log con contatori corretti incluso `storageFilesRemoved`. Task Notion `[Privacy] Diritto cancellazione` chiudibile come "Fatto" con confidenza piena. Dettagli pattern in `CLAUDE.md` → sezione Edge Functions.

## Aree in sviluppo / da completare (da CLAUDE.md)

Tech-debt e refactor differiti. Non bloccanti per il task corrente; da valutare durante refactor mirati o cicli di consolidamento.

 **`leave_tenant` RPC rewrite** — vecchia firma `(p_tenant_id)`, no manager scope, no allineamento a `remove_tenant_member` v2. Low priority.
- **Realtime sync su `tenant_memberships`** — cambio ruolo runtime richiede refresh manuale (`usePermissions().refresh()`). Eventuale switch a Supabase Realtime channel per propagation automatica.
- **Sidebar loading-optimistic** — oggi `permissions===null` mostra tutte le voci (transitorio). Visivo flash su utenti scoped. Alternativa: skeleton durante load.
- **Permission `translations.read` dedicato** — mancante. Sidebar voce "Lingue" usa `catalogs.read` proxy. Creare permission dedicato se gating più fine.
- **Bulk cancel pending invites senza ConfirmDialog** — asimmetria vs bulk remove members (che ora ha confirm intermedio). Aggiungere ConfirmDialog per coerenza UX.
- **Storico admin — ripristino ordini annullati (caso A)** — Step 5b ha consegnato lo Storico (delivered + cancelled del giorno operativo) con azione "Ripristina" SOLO sui delivered (`restore-order`). Gli ordini `cancelled` restano terminali per design (no UI restore). Caso A futuro: recupero annullati richiederebbe una nuova edge function `restore-cancelled-order` (transition `cancelled → submitted` o `cancelled → acknowledged` con reset di `cancelled_at`/`cancelled_by`/`cancellation_reason` via `clear_fields`), source policy da concordare (es. solo entro N minuti dalla cancellazione).
- **Coda di moderazione Recensioni** (§34.9/1) — lotto a sé subito dopo il checkpoint 11: Pubblica · Tieni nascosta, `StatusBadge` in riga, badge in sidebar (`NavItem.count`), riepilogo sulle pubblicate, Elimina solo sulle nascoste, `updateReviewStatus(id, tenantId, status)` che lancia a 0 righe.
- **RLS delete `translations` e scritture `translation_jobs` aperte a ogni membro**: serve RPC di accodamento con permesso dell'entità sorgente + `enqueueWithSilentError` da rivedere (PR a parte, dopo la moderazione).
