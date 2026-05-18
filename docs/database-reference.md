# Database Reference — CataloGlobe

Riferimento schema. Per regole binding (RLS, naming, migration discipline) vedi `CLAUDE.md` → Database.

## Tabelle principali (selezionate)

- `tenants` — aziende/brand. Campi legali aggiunti con migration `20260518095654_add_legal_fields_to_tenants`: `legal_name`, `vat_number`, `fiscal_code`, `ateco`, `rea_code`, `pec`, indirizzo strutturato (`address`, `street_number`, `postal_code`, `city`, `province`, `country`). Tutti nullable.
- `activities` — sedi (slug, status, inactive_reason, cover_image rimovibile, contatti, social, street_number, postal_code, province — indirizzo strutturato; `fees` JSONB tariffe predefinite con flag `fees_public`)
- `activity_slug_aliases` — alias slug storici per redirect (slug UNIQUE globale, ON DELETE CASCADE da activities)
- `schedules` — regole scheduling (rule_type: "catalog" | "featured")
- `schedule_targets` — target N:N (no RLS — security gap noto)
- `schedule_featured_contents` — contenuti in evidenza per slot
- `featured_contents` — contenuti highlight (titolo, media, prodotti, pricing_mode)
- `catalogs`, `catalog_categories`, `catalog_category_products` — catalogo
- `products`, `product_variants`, `product_option_groups`, `product_option_values`
- `styles`, `style_versions` — stili con versioni immutabili
- `reviews` — recensioni (rebuild `20260413085957`)
- `notifications` — notifiche estese (`20260410140000`)
- Stripe billing su `tenants`: colonne `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, `paid_seats`, `trial_until` (`20260411100000`, `20260413100000`). Le tabelle `stripe_subscriptions` e `stripe_customers` NON esistono — i dati Stripe vivono come colonne su `tenants`.

## Schema facts critici

- `v2_activity_schedules` — ELIMINATA (migration `20260302130000`). Non referenziare mai.
- `activities.slug` — UNIQUE globale (non per tenant), constraint `activities_slug_unique`. CHECK formato: `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$` + no `--`. Reserved slugs enforced a DB level via `is_reserved_slug()` (migration `20260416140000`).
- `activity_slug_aliases` — NO policy UPDATE (alias si eliminano, non si modificano). Lookup pubblico via `service_role` nella Edge Function `resolve-public-catalog`.
- `activities.fees` — JSONB array di `{key, value}`. Chiavi ammesse: `coperto`, `servizio`, `prenotazione_minima`, `spesa_minima`, `eta_minima`. Definizioni centralizzate in `src/constants/activityFees.ts`. Non usare JSONB libero — le chiavi sono un enum fisso non modificabile dall'utente. Migration `20260428110000_activities_fees.sql`.
- `schedule_targets` — NO `tenant_id` ma RLS attivo: 4 policy con sub-select su schedules.tenant_id (audit aprile 2026)
- `product_attribute_definitions.tenant_id` — NULLABLE (attributi piattaforma usano NULL)
- `schedule_featured_contents.slot` — constraint CHECK a 2 valori: `before_catalog`, `after_catalog` (migration `20260414190000`, hero rimosso)
- `schedules.start_at` — salvato come inizio giornata locale (`T00:00:00` locale → UTC via `toISOString()`)
- `schedules.end_at` — salvato come fine giornata locale (`T23:59:59` locale → UTC via `toISOString()`)
- `activity_hours.closes_next_day` — BOOLEAN DEFAULT false. Se `closes_at < opens_at`, il form imposta il flag automaticamente. Overlap detection usa `closes_at_minutes + 1440` per slot notturni. Stesso pattern per `activity_closures` (JSONB slots, `closes_next_day` è campo del JSON — nessun campo DB aggiuntivo).
- View utenti vs RPC: `user_tenants_view` è SECURITY INVOKER e delega a `get_user_tenants()`. Per dati membri/inviti usare le RPC `get_tenant_members(uuid)` e `get_my_pending_invites()` (entrambe SECURITY DEFINER, accesso filtrato internamente). Le view legacy `tenant_members_view` e `my_pending_invites_view` sono state droppate nelle migration `20260427100000_security_advisor_fixes.sql` + `20260427110000_drop_orphan_member_views.sql`.
- `src/config/company.ts` e `supabase/functions/_shared/company-config.ts` sono **duplicazione sincronizzata** dei dati legali aziendali. Backend Deno non può importare da `src/`. Stesso pattern di `scheduleResolver.ts`. Entrambi i file iniziano con header `// ⚠️ SYNC`. Modifica sempre entrambi nello stesso commit.

## Storage policy naming canonico

Post canonicalizzazione 30/04/2026, migration `20260430180000_storage_policy_canonicalize.sql`: tutte le 24 policy su `storage.objects` seguono il pattern `<bucket> <op>` (lowercase, hyphen-space). 6 bucket × 4 operazioni (select/insert/update/delete). Tutte `TO authenticated`. UPDATE policy hanno SEMPRE sia USING che WITH CHECK populate (identici).

Storia: 3 stili coesistevano (snake_case, sentence-case, hyphen-space) con drift staging/prod. Canonicalizzazione ha allineato entrambi gli ambienti. Future migration storage devono mantenere il pattern (vedi `CLAUDE.md` → Pattern obbligatori).

## Trigger DB auto-create su `tenants` insert

Alla creazione di una nuova riga in `tenants`, trigger automatici creano:

- 1 `style` di default + 1 `style_versions` collegato
- 1 `activity_group` di default

Test che si aspettano "tenant minimal con 0 styles/groups" sono sbagliati: la baseline post-create è già `{styles: 1+, activity_groups: 1}`. Verificato via test purge runtime 01/05/2026.

## Tabelle audit duplicate (cleanup futuro)

Due tabelle di audit con schema diverso e scope sovrapposto:

- `public.audit_logs`: usata da `purge-tenants` e `purge-tenant-now` per eventi `tenant_purged`. Schema: `event_type`, `user_id`, `metadata` (jsonb), `created_at`.
- `public.audit_events`: usata da `purge-accounts` per eventi `account_purged`. Schema: `event_type`, `actor_user_id`, `target_user_id`, `tenant_id`, `payload` (jsonb), `created_at`.

Inconsistenza nota da consolidare: candidate per merge in singola tabella con schema unificato. Per ora, nei test verificare ENTRAMBE.

## Soft-delete account semantica

Il flow soft-delete account NON popola `auth.users.deleted_at`. Usa `banned_until` su `auth.users` + `profiles.account_deleted_at`. Query del tipo "trova account purgable" devono cercare in `profiles.account_deleted_at`, non in `auth.users.deleted_at` (che è sempre NULL nel flow attuale).
