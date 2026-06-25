# FASE 1 — Audit read-only: sistema Lingue / Traduzioni

> Quadro fattuale del comportamento **attuale**. Nessuna proposta di modifica.
> Ambiente schema: staging `lxeawrpjfphgdspueiag`. Data: 2026-06-23.

## Correzioni alla documentazione interna (da subito)

- Cron **NON** ogni 2 minuti → è **ogni 30 secondi** (`20260505140000_translation_cron_30s.sql`; il `*/2` iniziale è stato sovrascritto).
- Lingue seed: confermato IT base + EN/ES/FR/DE (più altre disponibili via `supported_languages.is_available`).
- Retry: confermato max 3 (`MAX_ATTEMPTS=3`), batch 50.
- "Preservazione modifiche manuali": confermata, doppio meccanismo (flag + WHERE clause).

---

## 1. Modello dati

4 tabelle i18n. Nessun'altra tabella correlata. Tutte RLS-enabled (nessuna FORCE).

### `supported_languages` — whitelist piattaforma (NON tenant-scoped)
- PK `code` (text). No `tenant_id`.
- Cols: `name_en`, `name_native`, `name_it` (aggiunta dopo, `20260504120930`), `flag_emoji`, `provider_preference` (default `'deepl'`), `is_available` (default `true`), `sort_order`, `created_at`.
- CHECK `provider_preference IN ('deepl','google','manual','system','mock')`.
- RLS: 1 sola policy `supported_languages_read_all` — SELECT `{anon,authenticated}` USING `true`. Nessuna policy write (solo service_role/admin).
- Migration: `20260503180000_translations_foundation.sql`.

### `tenant_languages` — lingua attiva per tenant (1 riga = 1 lingua abilitata)
- PK `id` uuid. `tenant_id` NN, `language_code` NN, **`is_active` bool default true** (unica colonna di stato), `created_at`.
- UNIQUE `(tenant_id, language_code)`. FK `tenant_id→tenants ON DELETE CASCADE`; FK `language_code→supported_languages` (NO ACTION).
- Indici: pkey, unique, partial `tenant_languages_active_idx (tenant_id) WHERE is_active=true`.
- RLS (`{authenticated}`): SELECT `tenant_id IN get_my_tenant_ids()`; INSERT/UPDATE/DELETE aggiungono `AND has_permission('translations.write')` (UPDATE con WITH CHECK speculare). → **tenant-scoped + RLS confermato**.
- Migration: `20260503180000` (create) + `20260610140000_translations_write_backend.sql` (policy `translations.write`).

### `translations` — stringhe tradotte (chiave POLIMORFICA)
- PK `id` uuid. `tenant_id` uuid **NULLABLE** (NULL per entità di sistema).
- **Chiave entità = `entity_type` (text) + `entity_id` (text)** — NON FK su `product_id`/`catalog_category_id`. Polimorfica.
- Campo tradotto indirizzato da `field` (text) → una riga per `field` × `language_code` (es. name, description, notes).
- `source_text`, `source_hash`, `translated_text`, `provider`, **`status`** (default `'auto'`), `created_at`, `updated_at`.
- **AUTO vs MANUALE = colonna `status`**, CHECK `status IN ('auto','manual','overridden')`. NON esiste `is_manual`/`edited_at`. (`'overridden'` aggiunto da `20260509130000`.)
- `provider` CHECK `IN ('deepl','google','manual','system','mock')`.
- UNIQUE `(tenant_id, entity_type, entity_id, field, language_code)`.
- CHECK `translations_system_entity_only_null_tenant`: `tenant_id IS NOT NULL OR entity_type IN ('allergen','characteristic','attr_def','attr_def_option')`.
- FK `tenant_id→tenants ON DELETE CASCADE`; `language_code→supported_languages`.
- Indici: pkey; unique; `translations_lookup_idx (entity_type,entity_id,language_code) INCLUDE (translated_text,source_hash)`; partial `translations_by_tenant_idx (tenant_id,entity_type) WHERE tenant_id IS NOT NULL`.
- RLS (`{authenticated}`): SELECT `tenant_id IS NULL OR tenant_id IN get_my_tenant_ids()`; write `tenant_id IS NOT NULL AND tenant_id IN get_my_tenant_ids()` (righe NULL-tenant scrivibili solo da service_role).
- Migration: `20260503190000_translations_core.sql`.

### `translation_jobs` — coda async
- PK `id` uuid. `tenant_id` NULLABLE. `entity_type`, `entity_id`, `field`, `target_language_code`, `source_text`, `source_hash`.
- **`status` default `'pending'`, CHECK `IN ('pending','processing','done','failed')`** — solo 4 stati. Nessun `acknowledged`/`ready`.
- **Retry = `attempts` int default 0** (CHECK `>=0`). **Errore = `last_error` text** nullable. **Timestamp = `created_at` + `processed_at`** (no `started_at`).
- FK `tenant_id→tenants ON DELETE CASCADE`; `target_language_code→supported_languages`.
- Indici: pkey; partial `translation_jobs_pending_idx (status,created_at) WHERE status='pending'`; partial **dedup** `translation_jobs_dedup_idx (entity_type,entity_id,field,target_language_code) WHERE status='pending'`; `translation_jobs_progress_idx (tenant_id,target_language_code,status)`.
- RLS (`{authenticated}`): tutti i 4 comandi `tenant_id IS NOT NULL AND tenant_id IN get_my_tenant_ids()` (nessun check permesso, a differenza di `tenant_languages`).
- Migration: `20260503190000_translations_core.sql`.

### Cron
- `cron.job` jobid 9, jobname `process-translation-jobs`, schedule **`30 seconds`**, active. Fa `net.http_post` all'URL edge da vault (`process_translation_jobs_url`), header `X-Job-Secret` = vault `translation_job_secret`, body `{}`. Skip con NOTICE se secret NULL.

---

## 2. Pagina Lingue (frontend + service)

- Route: `src/App.tsx:233` `path="languages"` → `SettingsLanguages` (lazy), sotto business settings, gate `PageGate readPermission="catalogs.read"`.
- File pagina: `src/pages/Business/SettingsLanguages.tsx`. Riga lingua: `src/components/SettingsLanguages/LanguageRow.tsx`.
- Service: `src/services/supabase/tenantLanguages.ts` (primario), `translationJobs.ts`, `translationStatus.ts`. Hook progress: `src/hooks/useTranslationProgress.ts`.
- **Render** (`loadData`): in parallelo `listAvailableLanguages()` (`supported_languages WHERE is_available` ord. `sort_order`) + `listTenantLanguages(tenantId)` (`tenant_languages`, attive+inattive) + `useTranslationProgress(tenantId)` (RPC `get_translation_progress`). Gate write = permesso `translations.write`.

---

## 3. Enqueue su attivazione lingua (toggle ON) — domanda (a)

`handleConfirmActivate` → `activateTenantLanguage` (`tenantLanguages.ts:59-84`), ordine:
1. `upsert` in `tenant_languages` (`is_active:true`, onConflict `tenant_id,language_code`).
2. RPC **`enqueue_tenant_language_backfill(p_tenant_id, p_target_lang)`** (SECURITY DEFINER, `20260610140000`; richiede `translations.write` + membership). Bulk-INSERT in `translation_jobs` per i campi sorgente delle entità traducibili, ritorna conteggio job creati.
   - **Errore RPC NON bloccante**: loggato, lingua resta attiva (`tenantLanguages.ts:79-81`). Toast diverso se `jobsCreated > 0`.
- **Chi accoda**: RPC DB SECURITY DEFINER (non trigger, non edge). Granularità: 1 job per `(entity, field, lingua)`.
- **Protezione anti-saturazione**: dedup via `WHERE NOT EXISTS (... translation_jobs WHERE target_language_code=p_target_lang AND status IN ('pending','done'))` → non riaccoda ciò che è già pending/done. **Nessun limite su volume/budget caratteri** all'enqueue.

---

## 4. Enqueue su creazione/modifica contenuto — domanda (b)

**Meccanismo a livello SERVICE (application-level), NON trigger DB.** Nessun trigger su `products`/`catalog_categories` accoda job (solo trigger tipo `set_updated_at`).

- **Prodotto create/update**: `createProduct` (`products.ts:369,379`) e `updateProduct` (`481,491`) → `enqueueWithSilentError` → `enqueueTranslationJobsIfChanged`. Duplicate idem.
- **Categoria create/update**: `createCategory` (`catalogs.ts:186`) + `updateCategory` (`231`) → enqueue `entityType:"category"`.
- **Modifica testo IT sorgente**: SÌ riaccoda. `enqueueTranslationJobsIfChanged` calcola `newSourceHash`; per ogni lingua attiva non-base accoda se `!existingRow || existingRow.source_hash !== newSourceHash`. Hash mismatch → nuovo job → cron ritraduce.
  - **Righe manuali (`status='manual'`) SKIPPATE** (`if (manualLangs.has(lang)) return false`) → restano STALE, flaggate in UI (vedi §9). Non sovrascritte.
  - Rimozione testo sorgente → `DELETE` delle translations esistenti.
- **Limite**: il hook per-write accoda SOLO per lingue già attive al momento della write (`getActiveTenantLanguages` meno base; early-return se nessuna). Lingue attivate DOPO → coperte solo dal backfill (§3), non retroattivo dal per-write.

→ **Risposta: SÌ esiste enqueue automatico su create/update** (prodotti + categorie), incluso re-enqueue su modifica IT. Non c'è degrado silenzioso sul percorso create/update. Il "buco" è altrove: contenuto creato/modificato quando una lingua è OFF, e poi lingua riaccesa → coperto dal backfill solo se quel job non risulta già pending/done (vedi §5/zone grigie).

---

## 5. Comportamento toggle OFF — domanda (c)

`handleDeactivate` → `deactivateTenantLanguage` (`tenantLanguages.ts:90-100`): singolo `UPDATE tenant_languages SET is_active=false`.
- **`translations` esistenti**: LASCIATE INTATTE (non eliminate, non marcate). Commento esplicito nel service: riattivazione = gratis.
- **`translation_jobs` in coda**: NON toccati/eliminati. (I pending restano e verranno comunque processati dal cron — la disattivazione non li ferma.)
- **Riattivazione = SOLO il mancante.** Backfill ha dedup `NOT EXISTS ... status IN ('pending','done')` → ri-traduce solo i gap. Già done/queued saltati. Impatto budget DeepL minimo se sorgente invariata.

---

## 6. Worker / processore coda — domanda (d) parte 1

Edge Function **`supabase/functions/process-translation-jobs/index.ts`**, invocata dal cron via `net.http_post` (non RPC).
- Auth: 401 se `X-Job-Secret` ≠ env `TRANSLATION_JOB_SECRET` (`index.ts:48-51`).
- **Batch 50** (`index.ts:31`), **MAX_ATTEMPTS 3** (`index.ts:32`).
- Selezione job: RPC **`claim_pending_translation_jobs(p_limit)`** atomica — `UPDATE ... SET status='processing', attempts=attempts+1 WHERE id IN (SELECT ... WHERE status='pending' ORDER BY created_at ASC LIMIT p_limit FOR UPDATE SKIP LOCKED)` (`20260503230000`).
- Stati: `pending → processing → done | failed`. Job raggruppati per `(source_lang, target_lang)`; source = tenant `base_language_code` o `'it'` per righe sistema.
- **Retry**: errore retryable + `attempts < 3` → reset `status='pending'` + `last_error` (`index.ts:160-168`); altrimenti `markJobFailed` → `status='failed'`, `last_error`, `processed_at` (`index.ts:187-200`).
- **Scrittura risultato + preservazione manuale**: RPC **`upsert_auto_translation`** (`20260521171028_harden_upsert_auto_translation.sql`), DOPPIA guardia:
  1. Flag: `IF v_existing_status='manual' THEN RETURN FALSE` (skip, loggato `index.ts:142-149`).
  2. WHERE (anti-race): `ON CONFLICT DO UPDATE ... WHERE public.translations.status='auto'`.
- **Osservabilità**: solo `console.*` + colonne DB (`status/attempts/last_error/processed_at`). Counters `{processed,failed,retried}` nel body HTTP. Nessuna tabella metriche/telemetria.

---

## 7. Provider abstraction + consumo DeepL

- Router: `_shared/translation/router.ts` → `getProviderForLanguage(targetLang)`. Se env `TRANSLATION_PROVIDER==='mock'` → MockProvider; altrimenti DeepL se lingua supportata; Google = placeholder commentato.
- `:fx` free-tier: `DeepLProvider` ctor `isFreeTier = apiKey.endsWith(":fx")` → endpoint `api-free.deepl.com` vs `api.deepl.com` (`DeepLProvider.ts:54-57`).
- **Tracking caratteri**: `charsUsed` calcolato (`DeepLProvider.ts:134`, `MockProvider.ts:33`) e messo in `metadata.charsUsed`, MA **il processor non legge mai `result.metadata`** → mai persistito. **Nessuna stima a-priori, nessun budget check** pre-enqueue o pre-esecuzione. Unico segnale quota = reattivo: DeepL HTTP 456 → errore categoria `'quota'` non-retryable.
- **Chiavi**: unica env var **`DEEPL_API_KEY`** (`router.ts:52`). Free vs Pro auto-rilevato dal suffisso `:fx`, NON chiavi separate. Nessun nome chiave staging/prod distinto: separazione = valore secret diverso per progetto Supabase. Altri secret: `TRANSLATION_JOB_SECRET`, `TRANSLATION_PROVIDER`.

---

## 8. Stato coda interrogabile dal frontend — domanda (d) parte 2

**SÌ, esiste.** RPC **`get_translation_progress(p_tenant_id)`** (SECURITY DEFINER, `20260505120000_translation_progress_rpcs.sql`; 42501 se non membro). Aggrega `translation_jobs` per `target_language_code`, ritorna JSONB:
- per-lingua: `{ lang, pending (status pending|processing), done, error (failed), total }`
- totali: `total_pending, total_error, total_done`.

Wrapper `getTranslationProgress` (`tenantLanguages.ts:136-145`) → hook `useTranslationProgress` (poll 5s finché `total_pending>0`, stop a 0, toast a completamento). Render per-lingua via `progressByLang(code)` su `LanguageRow`. "Retry failed" → RPC `retry_all_failed_translations`.

**Limiti del dato attuale**: conteggi a livello JOB (righe in `translation_jobs`), NON copertura "X di Y entità". Nessun timestamp "ultimo aggiornamento" per lingua esposto. La progress è "muta" su entità mai entrate in coda (es. contenuti creati quando la lingua era OFF e non ancora backfillati).

---

## 9. Tab Traduzioni per prodotto e categoria

Componente shared unico: **`src/components/ui/TranslationsTab/TranslationsTab.tsx`** (props `entityType`/`fieldKey`). Categoria: `CatalogEngine.tsx:1893` (`entityType="category"`). Prodotto: `ProductPage`/`SchedaTab`.
- **Lettura stato per-lingua**: `targetLanguages` → `translationsByCode[code]`, valore = `draft ?? translation?.translated_text`.
- **AUTO vs MANUALE**: `getStatusKind()` su `translation.status` → `'manual'` = manuale; altrimenti `'auto'`; assente = `'missing'`. Badge "Automatica" = `status !== 'manual'`.
- **Persist + protezione manuale**: `upsertManualTranslation` → RPC `upsert_manual_translation` (`20260509130000`) setta `provider='manual', status='manual'`. Protezione dall'auto-overwrite lato server in `upsert_auto_translation` (skip su `status='manual'`); enqueue FE salta `manualLangs`.
- **Stale**: `isStaleManual = kind==='manual' && translation.source_hash !== currentSourceHash` → banner "Il testo italiano è stato modificato...". Manuali NON auto-rimpiazzate; solo flaggate.
- **Indipendenza confermata**: layer granulare funziona via RPC + flag `status`, indipendente da cron/coda. Ipotesi confermata: il buco è nell'orchestrazione globale (visibilità copertura / contenuti non-coda), non nel singolo item.

---

## 10. Calcolo copertura — fattibilità

Fattibile con schema attuale (no scritture):
- Lingue attive: `tenant_languages WHERE is_active`.
- Per lingua L: **totale traducibile** = conteggio righe sorgente sulle entità traducibili del tenant (products.description/notes, category.name, ...); **tradotti freschi** = `COUNT(translations WHERE language_code=L AND source_hash = hash_corrente)` (il match hash distingue fresco vs stale); **in coda** = `COUNT(translation_jobs WHERE target_language_code=L AND status='pending')`; **falliti** = job `status='failed'` (/`attempts` esauriti / `last_error NOT NULL`).
- Già esiste l'aggregato job-level `get_translation_progress`. Per copertura "fresco vs stale a livello entità" serve ricalcolare il source-hash corrente e join contro `translations.source_hash`. Nessuna write necessaria.

---

## Risposte alle 4 domande critiche

**(a) Toggle ON** — Upsert riga in `tenant_languages` (`is_active=true`), POI RPC SECURITY DEFINER `enqueue_tenant_language_backfill` accoda in `translation_jobs` un job per `(entità, field, lingua)` per tutte le entità traducibili del tenant. Accoda il **DB (RPC)**, non trigger né edge. Dedup `NOT EXISTS status IN (pending,done)` evita doppioni; nessun limite di budget caratteri. Errore enqueue non-bloccante.

**(b) Create/modifica contenuto accoda automaticamente?** — **SÌ (con limite).** Service-level: create/update di prodotto e categoria chiamano `enqueueTranslationJobsIfChanged`; la modifica del testo IT (hash diverso) riaccoda; le righe `manual` vengono saltate (restano stale, flaggate). NON è un trigger DB. **Limite**: accoda solo per lingue attive al momento della write — contenuto creato/modificato con lingua OFF non viene coperto finché non interviene il backfill della riattivazione.

**(c) Toggle OFF** — Solo `UPDATE is_active=false`. `translations` esistenti **intatte**, `translation_jobs` in coda **non toccati**. Riattivazione ri-traduce **SOLO il mancante** (dedup `NOT EXISTS status IN (pending,done)`), non tutto: budget DeepL preservato se sorgente invariata.

**(d) Stato coda interrogabile dal frontend?** — **SÌ.** RPC `get_translation_progress` + hook `useTranslationProgress` danno conteggi per stato (pending/done/error) per lingua. **Ma** è job-level, non copertura entità-level (X di Y), e cieca su entità mai entrate in coda; nessun timestamp "ultimo aggiornamento" per lingua. Per copertura reale servirebbe join `entità sorgente × translations(source_hash)`.

---

## Domande aperte / zone grigie

1. **Drift silenzioso reale = solo il gap "OFF→create→ON"**: contenuto creato/modificato mentre una lingua è OFF non genera job (per-write salta le lingue inattive). Alla riattivazione, il backfill copre quei gap SOLO se non esiste già un job pending/done per quella `(entità,field,lingua)`. Da verificare: il backfill confronta il `source_hash`? Se la dedup guarda solo `status IN (pending,done)` senza considerare hash, un contenuto MODIFICATO mentre la lingua era OFF (con un vecchio job `done` su hash precedente) NON verrebbe riaccodato → traduzione stale permanente. **Punto da accertare leggendo il body esatto di `enqueue_tenant_language_backfill`.**
2. **Job orfani post-OFF**: i `translation_jobs` pending non vengono cancellati alla disattivazione → il cron li processa comunque e scrive `translations` per una lingua ora inattiva (spreco budget + righe per lingua OFF). Comportamento voluto? Da confermare.
3. **Inventario "entità traducibili"**: non c'è una sorgente unica di verità su quali entità/field sono traducibili (logica sparsa tra backfill RPC e `enqueueTranslationJobsIfChanged`). Per la copertura entity-level servirebbe consolidarla. Rischio: le due liste (backfill vs per-write) potrebbero divergere.
4. **`charsUsed` calcolato ma scartato**: nessuna persistenza consumo → impossibile oggi stimare/limitare costo DeepL. Solo segnale reattivo HTTP 456.
5. **`translation_jobs.tenant_id` nullable + RLS write `tenant_id NOT NULL`**: job di sistema (tenant NULL) gestibili solo da service_role — coerente, ma la progress RPC tenant-scoped non li vede (irrilevante per il tenant, da tenere a mente).
6. **Progress è job-based, non entity-based**: una volta che i job diventano `done` e (ipoteticamente) vengono prunati, la progress perde memoria; nessun "X di Y" stabile nel tempo.
