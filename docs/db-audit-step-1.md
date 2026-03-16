# Database Audit Report — Step 1

**Data**: 2026-03-16
**Scope**: Inventario completo dello schema, classificazione tabelle, identificazione oggetti legacy
**Metodo**: Analisi di tutte le 130 migration files, servizi frontend, edge functions, views, policies RLS

---

## 1. Elenco completo delle tabelle

### V2 — Tabelle attive del sistema corrente

| Tabella | Categoria | Motivazione |
|---------|-----------|-------------|
| `v2_tenants` | V2 | Tabella centrale multi-tenant. FK da tutte le tabelle v2. Soft-delete, billing, owner_user_id |
| `v2_activities` | V2 | Sedi/location. Backfillata da `businesses`. Referenziata ovunque nel frontend e edge functions |
| `v2_products` | V2 | Prodotti. Backfillata da `items`. Supporta varianti (parent_product_id) |
| `v2_catalogs` | V2 | Cataloghi. Backfillata da `collections`. Usata attivamente |
| `v2_catalog_categories` | V2 | Modello catalogo gerarchico (max 3 livelli). Sostituisce v2_catalog_sections |
| `v2_catalog_category_products` | V2 | Pivot categoria-prodotto nel nuovo modello catalogo |
| `v2_catalog_sections` | V2 (SUPERSEDED) | Vecchio modello catalogo flat. Backfillata da `collection_sections`. Sostituita da v2_catalog_categories ma NON droppata |
| `v2_catalog_items` | V2 (SUPERSEDED) | Vecchio modello pivot sezione-prodotto. Backfillata da `collection_items`. Sostituita da v2_catalog_category_products ma NON droppata. Ancora referenziata in `catalogs.ts` e `CatalogEngine.tsx` |
| `v2_styles` | V2 | Stili grafici. current_version_id punta a v2_style_versions |
| `v2_style_versions` | V2 | Versioni degli stili. Config JSONB |
| `v2_schedules` | V2 | Regole di scheduling (layout/price/visibility). Modello complesso con target multipli |
| `v2_schedule_layout` | V2 | Associazione schedule -> stile + catalogo |
| `v2_schedule_targets` | V2 | Target multipli per schedule. NOTA: nessun tenant_id, RLS via parent schedule |
| `v2_schedule_price_overrides` | V2 | Override prezzi per schedule |
| `v2_schedule_visibility_overrides` | V2 | Override visibilita per schedule |
| `v2_schedule_featured_contents` | V2 | Contenuti in evidenza associati a schedule |
| `v2_activity_product_overrides` | V2 | Override prezzo/visibilita per sede. Backfillata da `business_item_overrides` |
| `v2_activity_groups` | V2 | Gruppi di sedi. Include gruppo sistema "Tutte le sedi" |
| `v2_activity_group_members` | V2 | Membri dei gruppi di sedi |
| `v2_featured_contents` | V2 | Contenuti in evidenza (hero, promo, bundle) |
| `v2_featured_content_products` | V2 | Prodotti associati ai contenuti in evidenza |
| `v2_product_attribute_definitions` | V2 | Definizioni attributi prodotto. tenant_id NULLABLE (platform-level) |
| `v2_product_attribute_values` | V2 | Valori attributi per prodotto |
| `v2_allergens` | V2 (SYSTEM) | 14 allergeni EU. Tabella di lookup immutabile, public read |
| `v2_product_allergens` | V2 | Pivot prodotto-allergene |
| `v2_ingredients` | V2 | Ingredienti per tenant |
| `v2_product_ingredients` | V2 | Pivot prodotto-ingrediente |
| `v2_product_option_groups` | V2 | Gruppi opzioni prodotto. Creata via Supabase Studio (migration stub vuoto) |
| `v2_product_option_values` | V2 | Valori opzioni prodotto. Creata via Supabase Studio (migration stub vuoto) |
| `v2_product_groups` | V2 | Gruppi di prodotti. Creata via Supabase Studio (migration stub vuoto) |
| `v2_product_group_items` | V2 | Membri dei gruppi prodotto. Creata via Supabase Studio (migration stub vuoto) |
| `v2_tenant_memberships` | V2 | Team/inviti. Supporta inviti per email, token, ruoli |
| `v2_audit_logs` | V2 | Log audit immutabili. Solo service_role puo scrivere |
| `v2_plans` | V2 (SYSTEM) | Piani (free/pro/enterprise). Lookup table, seeded |

### CORE — Tabelle condivise/auth non parte del refactor v2

| Tabella | Categoria | Motivazione |
|---------|-----------|-------------|
| `profiles` | CORE | Profilo utente (first_name, last_name, phone, avatar_url). FK a auth.users. Trigger on_auth_user_created. Usata attivamente da profile.ts e componenti UI |
| `otp_session_verifications` | CORE | Verifica sessione OTP. Parte del flusso auth a due stadi. Usata da AuthProvider.tsx e edge functions verify-otp |
| `otp_challenges` | CORE | Challenge OTP effimere. Usata da edge functions send-otp, verify-otp, status-otp |

### LEGACY — Tabelle pre-v2 probabilmente eliminabili

| Tabella | Categoria | Motivazione |
|---------|-----------|-------------|
| `businesses` | LEGACY | Sostituita da v2_tenants + v2_activities. Ancora referenziata in `businesses.ts`, `reviews.ts`. Backfill completato |
| `items` | LEGACY | Sostituita da v2_products. Ancora referenziata in `collections.ts`, `businesses.ts`. Backfill completato |
| `collections` | LEGACY | Sostituita da v2_catalogs. Ancora referenziata in `collections.ts`. Backfill completato |
| `collection_sections` | LEGACY | Sostituita da v2_catalog_sections (poi da v2_catalog_categories). Ancora referenziata in `collections.ts`, parity-check |
| `collection_items` | LEGACY | Sostituita da v2_catalog_items (poi da v2_catalog_category_products). Ancora referenziata in `collections.ts` |
| `business_item_overrides` | LEGACY | Sostituita da v2_activity_product_overrides. Ancora referenziata in `overrides.ts`, parity-check |
| `business_collection_schedules` | LEGACY | Sostituita da v2_schedules + v2_schedule_targets. Ancora referenziata in `schedules.ts`, `collections.ts` |
| `item_categories` | LEGACY | Sistema categorie legacy. Referenziata in `categories.ts`, `collections.ts` |

### DUBBIA — Da verificare manualmente

| Tabella | Categoria | Motivazione |
|---------|-----------|-------------|
| `reviews` | DUBBIA | Sistema recensioni. Referenziata in `reviews.ts` e Dashboard/Overview. Non ha equivalente v2. Potrebbe essere feature attiva o abbandonata |
| `qr_scans` | DUBBIA | Tracking scansioni QR. Referenziata in codice legacy. Non ha equivalente v2. Potrebbe essere feature attiva |
| `businesses_with_capabilities` | DUBBIA | VIEW (non tabella). Referenziata in `businesses.ts`. Potrebbe dipendere da tabelle legacy |
| `v2_catalog_sections` | DUBBIA | Tecnicamente superseded da v2_catalog_categories, ma NON droppata e potenzialmente ancora referenziata in qualche path. Da verificare se qualche codice la usa ancora attivamente |
| `v2_catalog_items` | DUBBIA | Come sopra. Ancora referenziata in `catalogs.ts` e `CatalogEngine.tsx`. Potrebbe essere in uso parallelo con il nuovo modello |

### Storage Buckets

| Bucket | Stato | Note |
|--------|-------|------|
| `business-covers` | ATTIVO | Usato da activities, delete-business, tenant-purge |
| `business-items` | LEGACY? | Nome legacy. Usato in upload.ts legacy |
| `catalog-items` | ATTIVO | Immagini catalogo. Usato in upload.ts |
| `avatars` | ATTIVO | Avatar utente. Usato in profile.ts |

---

## 2. Coppie legacy -> v2 (sostituzioni logiche confermate)

Tutte le seguenti sono confermate dalle migration di backfill (INSERT INTO v2_* SELECT FROM legacy_*):

| Legacy | V2 | Migration backfill | Note |
|--------|----|--------------------|------|
| `businesses` (come tenant) | `v2_tenants` | 20260223150000 | 1 tenant per user_id. businesses.user_id -> v2_tenants.id |
| `businesses` (come sede) | `v2_activities` | 20260223151000 | Preserva ID. businesses.id -> v2_activities.id |
| `items` | `v2_products` | 20260223152000 | Preserva ID. items.user_id -> v2_products.tenant_id |
| `collections` | `v2_catalogs` | 20260223153000 | Preserva ID. collections.user_id -> v2_catalogs.tenant_id |
| `collection_sections` | `v2_catalog_sections` | 20260223153000 | Preserva ID |
| `collection_items` | `v2_catalog_items` | 20260223153000 | Preserva ID |
| `business_item_overrides` | `v2_activity_product_overrides` | 20260223154000 | Preserva ID |
| `business_collection_schedules` | `v2_activity_schedules` -> poi `v2_schedules` + `v2_schedule_targets` | 20260223155000, 20260304120000 | Doppia migrazione: prima backfill, poi rearchitecture |

**Sostituzione interna v2 (non legacy->v2):**

| Vecchio | Nuovo | Migration | Note |
|---------|-------|-----------|------|
| `v2_catalog_sections` + `v2_catalog_items` | `v2_catalog_categories` + `v2_catalog_category_products` | 20260225121000 | Modello flat -> gerarchico. Le vecchie tabelle NON sono state droppate |
| `v2_activity_schedules` | `v2_schedules` + `v2_schedule_layout` + `v2_schedule_targets` | 20260302130000 | Droppata esplicitamente |

---

## 3. Tabelle shared/core non parte del refactor

| Tabella/Oggetto | Tipo | Motivazione |
|-----------------|------|-------------|
| `profiles` | Tabella | Profilo utente collegato a auth.users. Non ha prefisso v2 ma e corretto cosi: e un'estensione della tabella auth, non un'entita di dominio tenant-scoped |
| `otp_session_verifications` | Tabella | Parte del flusso auth custom (OTP a 2 stadi). Indipendente dal refactor multi-tenant |
| `otp_challenges` | Tabella | Challenge OTP effimere. Usata dalle edge functions OTP |
| `v2_allergens` | Tabella sistema | Lookup 14 allergeni EU. Immutabile, public read. Non e tenant-scoped |
| `v2_plans` | Tabella sistema | Lookup piani (free/pro/enterprise). Seeded, non e tenant-scoped |
| `v2_user_tenants_view` | View | Vista utente -> tenant con ruolo derivato. Filtra soft-deleted |
| `v2_tenant_members_view` | View | Vista membri di un tenant con email da auth.users |

---

## 4. Oggetti non-tabella da considerare nel cleanup futuro

### Views

| View | Stato | Dipendenze | Note |
|------|-------|------------|------|
| `v2_user_tenants_view` | ATTIVA | v2_tenants, v2_tenant_memberships, get_my_tenant_ids() | Usata in TenantProvider, TeamPage, WorkspacePage |
| `v2_tenant_members_view` | ATTIVA | v2_tenant_memberships, auth.users | Usata in TeamPage |
| `businesses_with_capabilities` | LEGACY | Probabilmente dipende da `businesses` | Referenziata in businesses.ts. DA VERIFICARE |

### Funzioni legacy o da verificare

| Funzione | Stato | Note |
|----------|-------|------|
| `duplicate_collection()` | LEGACY | RPC referenziata in `collections.ts`. Opera su tabelle legacy (collections) |
| `accept_tenant_invite_rpc()` | DEPRECATED | Sostituita da `accept_invite_by_token()`. Verificare se ancora presente nel DB |
| `change_member_role_rpc()` | INCOMPLETA | Referenziata in commenti/migration ma implementazione non chiara |
| `resend_invite_rpc()` | INCOMPLETA | Referenziata ma implementazione non visibile nelle migration |
| `revoke_invite_rpc()` | INCOMPLETA | Migration stub (20260313070000) |

### Funzioni attive (non toccare)

| Funzione | Tipo | Note |
|----------|------|------|
| `get_my_tenant_ids()` | SECURITY DEFINER | Cuore del sistema RLS. Usata in TUTTE le policies |
| `get_public_catalog(uuid)` | SECURITY DEFINER | Catalogo pubblico. Bypassa RLS per anon |
| `get_user_id_by_email(text)` | SECURITY DEFINER | Lookup utente per inviti |
| `invite_tenant_member(uuid, text, text)` | SECURITY DEFINER | Flusso inviti team |
| `accept_invite_by_token(uuid)` | SECURITY DEFINER | Accettazione inviti |
| `decline_invite_by_token(uuid)` | SECURITY DEFINER | Rifiuto inviti |
| `delete_invite(uuid)` | SECURITY DEFINER | Eliminazione inviti non attivi |
| `remove_tenant_member(uuid, uuid)` | SECURITY DEFINER | Rimozione membro |
| `leave_tenant(uuid)` | SECURITY DEFINER | Uscita volontaria dal tenant |
| `get_my_deleted_tenants()` | SECURITY DEFINER | Lista tenant eliminati per restore |
| `trg_check_v2_product_variant()` | Trigger fn | Validazione varianti prodotto |
| `handle_new_user()` | Trigger fn | Crea profilo su registrazione |
| `handle_new_tenant_membership()` | Trigger fn | Crea membership owner su creazione tenant |
| `handle_new_tenant_system_group()` | Trigger fn | Crea gruppo sistema + trial su creazione tenant |
| `prevent_deleted_at_client_update()` | Trigger fn | Protegge soft-delete da client |
| `update_updated_at_column()` | Trigger fn | Aggiorna updated_at |

### Trigger

Tutti i trigger attuali sono collegati a tabelle v2 o core (profiles). Non risultano trigger legacy da rimuovere, ma verificare se esistono trigger su tabelle legacy non visibili nelle migration analizzate.

### Policies RLS potenzialmente legacy

Le policies sulle tabelle legacy (businesses, items, collections, ecc.) non sono state analizzate in dettaglio perche le tabelle stesse sono candidate all'eliminazione. Se le tabelle vengono droppate, le policies cadono automaticamente.

---

## 5. Rischi di cleanup

### Dipendenze FK critiche

- `v2_tenants` ha ON DELETE RESTRICT su molte FK figlie (v2_featured_contents, v2_activities). **Non si puo droppare un tenant senza prima eliminare i dati figli** — il purge edge function gestisce questo in ordine.
- `v2_products` ha ON DELETE CASCADE da v2_featured_content_products, v2_catalog_category_products, ecc.
- `profiles.id` = `auth.users.id` — legame diretto, non toccare.

### Codice frontend che usa tabelle legacy

I seguenti file di servizio referenziano **direttamente** tabelle legacy e dovrebbero essere migrati o eliminati PRIMA di droppare le tabelle:

| File | Tabelle legacy usate |
|------|---------------------|
| `src/services/supabase/businesses.ts` | businesses, items, businesses_with_capabilities |
| `src/services/supabase/collections.ts` | collections, collection_sections, collection_items, business_collection_schedules, items, item_categories, v2_schedule_price_overrides |
| `src/services/supabase/categories.ts` | item_categories |
| `src/services/supabase/overrides.ts` | business_item_overrides |
| `src/services/supabase/schedules.ts` | business_collection_schedules |
| `src/services/supabase/reviews.ts` | reviews, businesses |
| `src/services/supabase/resolveBusinessCollections.ts` | Delega a v2 (potrebbe essere gia safe) |

### Edge functions con riferimenti misti

| Edge function | Note |
|---------------|------|
| `generate-menu-pdf` | Potrebbe usare tabelle legacy (businesses) oltre a v2 |
| `menu-ai-import` | Da verificare dipendenze tabelle |

### Funzioni SQL che leggono tabelle legacy

| Funzione | Rischio |
|----------|---------|
| `duplicate_collection()` | Opera su tabelle legacy. Droppare collections rompe questa funzione |
| `businesses_with_capabilities` (view) | Probabilmente dipende da businesses. Droppare businesses rompe la view |

### Script di utilita

| Script | Tabelle legacy |
|--------|---------------|
| `npm run parity:check` | Usa collection_sections, business_item_overrides per confronto con v2 |
| `npm run test:activity-overrides` | Da verificare |

### Storage buckets

- Il bucket `business-items` ha nome legacy. Se rinominato, tutti i riferimenti URL salvati nel DB diventano invalidi. **Non rinominare senza migration dei dati.**
- Il bucket `business-covers` e usato attivamente per le attivita v2 nonostante il nome legacy. Stesso rischio.

---

## 6. Prima proposta di perimetro cleanup

### Candidate sicure da approfondire per eliminazione

Queste tabelle hanno un equivalente v2 confermato con backfill completato. L'eliminazione richiede solo la rimozione dei riferimenti nel codice frontend:

| Tabella | Equivalente v2 | Blockers da risolvere prima |
|---------|-----------------|----------------------------|
| `business_item_overrides` | `v2_activity_product_overrides` | Rimuovere `overrides.ts`, aggiornare parity-check |
| `business_collection_schedules` | `v2_schedules` + `v2_schedule_targets` | Rimuovere `schedules.ts`, riferimenti in `collections.ts` |
| `collection_sections` | `v2_catalog_sections` -> `v2_catalog_categories` | Rimuovere riferimenti in `collections.ts`, parity-check |
| `collection_items` | `v2_catalog_items` -> `v2_catalog_category_products` | Rimuovere riferimenti in `collections.ts` |
| `item_categories` | Nessun equivalente diretto v2, ma il sistema categorie e in v2_catalog_categories | Rimuovere `categories.ts` |
| `v2_activity_schedules` | Gia DROPPATA (migration 20260302130000) | Nessuno — gia rimossa |

### Candidate che richiedono verifica del codice applicativo

| Tabella/Oggetto | Motivo della verifica |
|-----------------|----------------------|
| `businesses` | Usata in `reviews.ts` e `businesses.ts`. Verificare se reviews e una feature attiva o abbandonata. Verificare se `businesses.ts` e usato da pagine attive |
| `items` | Referenziata in `collections.ts` e `businesses.ts`. Verificare se ci sono path UI che usano ancora il servizio legacy |
| `collections` | Referenziata in `collections.ts`. Verificare se ci sono componenti che usano il servizio legacy anziche v2/catalogs.ts |
| `reviews` | Non ha equivalente v2. Potrebbe essere una feature attiva. Verificare se la Dashboard/Overview la usa realmente |
| `qr_scans` | Non ha equivalente v2. Verificare se e una feature attiva |
| `businesses_with_capabilities` (view) | Verificare dipendenze e se e ancora usata |
| `v2_catalog_sections` | Superseded da v2_catalog_categories ma ancora referenziata. Verificare se CatalogEngine.tsx usa ancora questo modello |
| `v2_catalog_items` | Come sopra. Referenziata in catalogs.ts e CatalogEngine.tsx |
| `duplicate_collection()` (funzione) | Opera su tabelle legacy. Verificare se e usata da UI attiva |
| `accept_tenant_invite_rpc()` (funzione) | Marcata come deprecated. Verificare se e ancora nel DB |
| `business-items` (storage bucket) | Nome legacy ma potrebbe contenere dati attivi referenziati da URL nel DB |

### Candidate che NON vanno toccate

| Tabella/Oggetto | Motivo |
|-----------------|--------|
| Tutte le tabelle `v2_*` attive (30+) | Sistema corrente in produzione |
| `profiles` | Tabella core auth, non parte del refactor |
| `otp_session_verifications` | Parte del flusso auth attivo |
| `otp_challenges` | Parte del flusso auth attivo |
| `v2_allergens` | Tabella sistema immutabile |
| `v2_plans` | Tabella sistema billing |
| `v2_user_tenants_view` | Vista attiva usata dal TenantProvider |
| `v2_tenant_members_view` | Vista attiva usata da TeamPage |
| Tutte le funzioni SECURITY DEFINER attive | Cuore del sistema RLS e inviti |
| Tutti i trigger su tabelle v2/core | Sistema attivo |
| `business-covers` (storage bucket) | Usato attivamente nonostante il nome legacy |
| `avatars` (storage bucket) | Attivo |
| `catalog-items` (storage bucket) | Attivo |

---

## Appendice: Conteggi

| Categoria | Conteggio |
|-----------|-----------|
| Tabelle V2 attive | 34 |
| Tabelle V2 superseded (non droppate) | 2 (v2_catalog_sections, v2_catalog_items) |
| Tabelle V2 droppate | 1 (v2_activity_schedules) |
| Tabelle core/auth | 3 (profiles, otp_session_verifications, otp_challenges) |
| Tabelle legacy | 8 (businesses, items, collections, collection_sections, collection_items, business_item_overrides, business_collection_schedules, item_categories) |
| Tabelle dubbie | 2 (reviews, qr_scans) |
| Views attive | 2 |
| Views legacy | 1 (businesses_with_capabilities) |
| Funzioni attive | 15+ |
| Funzioni legacy/incomplete | 4-5 |
| Storage buckets | 4 |
| File servizio legacy da migrare/rimuovere | 7 |
