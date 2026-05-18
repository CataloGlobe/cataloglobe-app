# Audit Epic Ordinazioni — Report

> Audit READ-ONLY per "Ordinazioni dal Tavolo". Architettura concordata fissata
> (vedi prompt). Questo documento mappa **cosa esiste già**, **cosa va riusato**,
> **cosa va creato**, e propone una roadmap implementativa.
>
> Date references: 2026-05-15. Branch: `staging`.

---

## 1. Executive summary

| Metrica | Stima |
|---|---|
| File frontend nuovi | ~38 |
| File frontend modificati | ~6 (App.tsx, Sidebar, MainLayout PAGE_TITLES, PublicCollectionPage, CollectionView, FeesSection di Stripe per ordini futuro = 0 ora) |
| Migration DB nuove | ~7 (tables + RLS + cron + realtime publication + helper RPC) |
| Edge Function nuove | 6 (`submit-order`, `acknowledge-order`, `deliver-order`, `cancel-order`, `close-table`, `generate-table-qrs`) |
| Edge Function modificate | 1 (`resolve-public-catalog` — opzionale: param `table_token` per branding "stai ordinando dal tavolo X") |
| Realtime pre-configurato | **PARZIALE** — `pg_cron`/`pg_net`/extension già presenti; publication `supabase_realtime` esiste e contiene `notifications` (1 sola tabella). Pattern client `subscribeToNotifications` riusabile come template. Nessun pattern di subscribe pubblico anonimo (`anon`) ancora testato. |
| Cron pattern | **PRESENTE** — `pg_cron` + `pg_net` schedulano edge functions (vedi `purge-accounts`, `purge-tenants`, `process-translation-jobs`, `cleanup-draft-schedules`). Riutilizzabile direttamente per reset notturno disponibilità + scadenza sessioni. |

### Rischi principali

1. **Conflitto naming `product_availability_overrides`**: esiste già `activity_product_overrides` con colonne `price_override` + `visible_override`, attivamente usata da `_shared/resolveActivityCatalogs.ts:1705` (filtra prodotti per visibilità per-sede). **Decisione richiesta**: estendere la tabella esistente con flag tipo `available`/`disabled_at`/`disabled_reason` OPPURE creare una nuova tabella separata. Vedi Questione 1.
2. **Realtime senza autenticazione**: la pagina pubblica è anon. Il cliente deve subscribere a `orders` filtrando per `customer_session_id`, ma `customer_session_id` è opaco lato anon → richiede policy SELECT pubblica scoped per session_id (no info leak, ma da progettare con cura). Vedi Questione 2.
3. **`schedule_targets` security gap noto** (no `tenant_id`, no RLS) — pattern da NON replicare per `tables`/`orders`. Le nuove tabelle DEVONO avere `tenant_id NOT NULL` e 4 policy CRUD via `get_my_tenant_ids()`.
4. **No public page caching server-side**: il payload `resolve-public-catalog` è cached `localStorage` 7 giorni come fallback offline (vedi `publicCatalogCache.ts`). Quando un prodotto va out-of-stock manualmente, il catalogo cached lo mostra ancora disponibile. La validazione server-side al `submit-order` è quindi obbligatoria.
5. **TTL sessione 12h vs cleanup**: il pattern `cleanup-draft-schedules` (cron edge function) è il template diretto. Niente novità infrastrutturali.
6. **Stripe lifecycle integration**: oggi `subscription_status` su `tenants` blocca via `SubscriptionBanner` + `ActivationRequired`. La feature Ordini deve rispettare lo stato tenant (sospeso → blocca `submit-order`). Vedi Questione 6.
7. **Concorrenza submit**: due telefoni che ordinano contemporaneamente sullo stesso tavolo non si vedono — l'optimistic lock va sull'ordine, non sul tavolo. OK con architettura concordata (ogni "Invia" = nuovo `orders`).
8. **iOS Safari scroll lock**: la pagina pubblica usa `body.style.position = "fixed"` quando un `PublicSheet` è aperto. Carrello + "I miei ordini" come `PublicSheet` = vincolo a leggere `body.style.top` per qualsiasi listener su `window.scrollY` (pattern documentato in `PublicCollectionHeader`).

---

## 2. Mappa codebase per area

### Area A — Frontend pubblico

**File rilevanti**:

- `src/pages/PublicCollectionPage/PublicCollectionPage.tsx` (~600 righe). Entry pubblica `/:slug/:lang?`. Ciclo: `useEffect` su `[slug, langFromUrl, simulateParam, navigate, retryToken]` → `fetchPublicCatalog()` → `processPayload()` → `setState({ status: "ready", ... })`. Stati: `loading | error | inactive | subscription_inactive | empty | ready`. Cache fallback su network error.
- `src/services/publicCatalog/fetchPublicCatalog.ts` — wrapper resiliente attorno a `supabase.functions.invoke("resolve-public-catalog", ...)`. 3 retry con backoff esponenziale + jitter + timeout 6s. Classifica errori `domain_error` (no retry) vs `network_error` (retry).
- `src/services/publicCatalog/publicCatalogCache.ts` — cache `localStorage` schema v1, TTL 7 giorni, prune opportunistico, fallback offline. Pattern riusabile per cache "I miei ordini" lato cliente.
- `src/components/PublicCollectionView/CollectionView/` — contenitore principale. Container queries (`@container collection`). Hub tabs `menu | events | reviews`. Sezione modale "InfoSheet" inline.
- `src/components/PublicCollectionView/PublicCollectionHeader/` — hero-to-compact via scroll listener. Vincolo iOS: legge `body.style.top` se `body.style.position === "fixed"`.
- `src/components/PublicCollectionView/PublicSheet/PublicSheet.tsx` — bottom-sheet mobile (drag-to-close, framer-motion `useDragControls`) + dialog desktop. Body scroll lock con backup posizione + ripristino. **Pattern obbligatorio per Carrello, Catalogo "I miei ordini", Conferma ordine**. Niente SystemDrawer nella pagina pubblica.
- `src/components/PublicCollectionView/SearchOverlay/`, `ItemDetail/`, `SelectionSheet/`, `LanguageSelector/` — sheet/overlay già esistenti. `SelectionSheet` (selezione varianti/options al tap su prodotto) è il candidato naturale per integrare il bottone "Aggiungi al carrello" — oggi è informativo.
- `src/components/PublicCollectionView/AllergensSheet/`, `CharacteristicsSheet/` — pattern di filtraggio. Riusabile per filtri ordine/disponibilità.
- `src/App.tsx:241` — definisce `<Route path="/:slug/:lang?" ... />` come entry pubblica. Le rotte cliente "tavolo" si agganciano qui (es. `/:slug/t/:tableToken` o tramite query param `?t=<token>`).

**Ingresso pagina pubblica**: `<Route path="/:slug/:lang?">` → `PublicErrorBoundary` → `PublicCollectionPage`. Nessun TenantProvider, nessun MainLayout. SiteLayout NON è usato dalla pagina catalogo.

### Area B — Risoluzione catalogo lato server

**File rilevanti**:

- `supabase/functions/resolve-public-catalog/index.ts` — Edge Function principale (~700 righe). Input: `{ slug, simulate?, lang? }`. Output: `{ business, tenantLogoUrl, resolved: ResolvedCollections, vertical_type, canonical_slug?, effective_language, base_language_code, available_languages, lang_unsupported?, opening_hours?, upcoming_closures? }`. `Cache-Control: public, max-age=...` (no-store se `simulate`). Pattern: `// @ts-nocheck`, `verify_jwt: false`, `service_role` via `createClient`, CORS headers permissivi.
- `supabase/functions/_shared/resolveActivityCatalogs.ts` (~1800 righe) — **fonte unica della risoluzione catalogo per sede**. Combina: layout rule (catalogo + stile attivi) + featured rules + price overrides + visibility overrides + **`activity_product_overrides`** (oggi solo `visible_override` letto a riga 1706) + scheduling. Output: `ResolvedCollections` con `catalog.categories[].products[]`.
- `supabase/functions/_shared/scheduleResolver.ts` + `src/services/supabase/scheduleResolver.ts` — duplicati byte-identical. Risoluzione regole layout/featured/price/visibility con competizione per sede (specificità target → temporale → priority → created_at → id).
- `supabase/functions/_shared/schedulingNow.ts` + `src/services/supabase/schedulingNow.ts` — Rome timezone helpers (`RomeDateTime`, `getNowInRome`, `toRomeDateTime`).
- `supabase/functions/_shared/`: `errors.ts`, `resolveActivityCatalogs.ts`, `scheduleResolver.ts`, `schedulingNow.ts`, `stripe-helpers.ts`, `tenant-purge.ts`, `translation`. **Aggiungere `_shared/orders.ts`** per: `validateOrderItems()`, `priceLineItem()`, `fetchOverrides()` riusabili tra `submit-order` e (futuro) `payment` edge.
- Migrations recenti scheduling: `20260409120000_get_schedule_featured_contents_rpc.sql`, `20260414120000_add_featured_rule_type.sql`, `20260414190000_*` (rimozione hero slot featured), `20260417120000_get_schedule_featured_contents_tenant_guard.sql`, `20260419*`, `20260506131400_cleanup_orphan_schedule_targets.sql`.

**Aggancio per Ordini**: `submit-order` deve invocare `resolveActivityCatalogs(activity.id, getNowInRome(), tenant_id)` lato edge per **rivalidare** prezzo/visibilità/disponibilità di ogni `order_items` PRIMA di scrivere. Lo snapshot `unit_price_snapshot` viene dal resolved, NON dal payload del client.

### Area C — Backoffice admin (pattern da replicare)

**File rilevanti**:

- `src/App.tsx:185-237` — blocco `/business/:businessId` annidato in `<TenantProvider><MainLayout /></TenantProvider>`. Aggiungere qui: `<Route path="orders" element={<OrdersOverview />} />` + `<Route path="orders/:activityId" element={<OrdersActivityPage />} />`.
- `src/layouts/MainLayout/MainLayout.tsx` — `Sidebar` (`isMobile`, `mobileOpen`, `collapsed`) + `<DrawerProvider>` + `<SubscriptionBanner />` + `<Outlet />`. Mappa `PAGE_TITLES`: aggiungere `orders: 'Ordini'`.
- `src/components/layout/Sidebar/Sidebar.tsx` — `buildGroups(businessId, catalogLabel)`: aggiungere voce `{ to: ${b}/orders, label: "Ordini", icon: <ClipboardList size={18} /> }` nel gruppo "Operatività" (con `Programmazione`, `Sedi`).
- `src/components/layout/SystemDrawer/SystemDrawer.tsx` + `DrawerLayout.tsx` — wrapper drawer destro. `width={420|520|720}`. Pattern footer: `<Button form={FORM_ID} type="submit" />`.
- `src/pages/Dashboard/Products/Products.tsx` (~700 righe) — esempio Page completo. State pattern: `[items, setItems]`, `[isLoading, setIsLoading]`, `[isCreateEditOpen, setIsCreateEditOpen]`, `[mode, setMode]`, `[selected, setSelected]`. `loadData = useCallback(... → listFoo(tenantId))`. `useEffect(() => loadData(), [loadData])`.
- `src/pages/Dashboard/Products/ProductCreateEditDrawer.tsx` — esempio drawer CRUD. `<SystemDrawer><DrawerLayout header= footer=><ProductForm formId={FORM_ID} ... /></DrawerLayout></SystemDrawer>`.
- `src/pages/Operativita/Attivita/tabs/contacts/ContactsMainDrawer.tsx` — altro esempio drawer di "edit identità sede" (`SystemDrawer width={520}`, `DrawerLayout header/footer`, form separato collegato via `form="contacts-main-form"`).
- `src/services/supabase/products.ts` (~510 LOC) — esempio service: `listBaseProductsWithVariants(tenantId)`, `getProduct(id, tenantId)`, `createProduct(tenantId, data, parentId?)`, `updateProduct(id, tenantId, data)`, `deleteProduct(id, tenantId)`. Cattura `error.code` (`PGRST116`, `23503`).
- `src/services/supabase/notifications.ts:81` — **template realtime** per `subscribeToOrders(activityId, onNew)`. Restituisce `RealtimeChannel`. Caller fa `unsubscribeFromNotifications(channel)`.

**Componenti UI esistenti** (in `src/components/ui/` — verificare PRIMA di creare): `AddressAutocomplete, AllergenIcon, AppLoader, Badge, Breadcrumb, BulkBar, Button, Card, CharacteristicIcon, ConfirmDialog, DataTable, Divider, Drawer, DropdownMenu, EmptyState, FilterBar, InlineBanner, Input, Loader, ModalLayout, PageHeader, Pill, PillGroup, RadioGroup, SeatsInput, SegmentedControl, Select, SelectionDrawer, Skeleton, StatusBadge, Switch, TablePagination, TableRowActions, Tabs, Text, Textarea, Toast, Tooltip, TranslationStatusBadge, TranslationsTab, UnsavedChangesBar, page` + index.ts.

Componenti riusabili immediatamente per Ordini admin: `DataTable` (lista ordini), `Pill`/`StatusBadge` (stati `submitted/acknowledged/delivered/cancelled`), `FilterBar` (filtro per tavolo, stato, intervallo), `PageHeader`, `EmptyState`, `Toast`, `Switch` (toggle disponibilità prodotto), `SeatsInput` (per `tables.seats`), `BulkBar` (azioni multi-ordine).

### Area D — Schema DB e RLS

**Tabelle attualmente attive (read da `mcp__supabase-staging__list_tables`)** — 60 tabelle pubbliche. Rilevanti per Ordini:

| Tabella | Righe | Note |
|---|---|---|
| `tenants` | 10 | Aziende. Stripe: `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, `paid_seats`, `trial_until`. |
| `activities` | 11 | Sedi. `slug` UNIQUE globale, `status`, `inactive_reason`, `fees JSONB`, `fees_public`, indirizzo strutturato. |
| `products` | 509 | Catalogo. `parent_product_id` per varianti. `is_visible` rimossa (`20260305102500`). |
| `product_variants` (= `products` con `parent_product_id` not null) | — | Pattern variante = riga product con padre. |
| `product_option_groups` | 75 | + `product_option_values` (176 righe). PRIMARY_PRICE pattern per format pricing. |
| `product_option_values` | 176 | Modificatori prezzo (`price_delta`). |
| `catalog_categories` | 96 | + `catalog_category_products` (402 righe). |
| `catalogs` | 13 | Resolved per sede via `schedule_layout`. |
| `activity_product_overrides` | **1** | **CONFLITTO POTENZIALE.** Già contiene `price_override numeric`, `visible_override boolean`. Vedi Questione 1. |
| `schedules` | 32 | + `schedule_targets` (20), `schedule_layout` (14), `schedule_price_overrides` (4), `schedule_visibility_overrides` (3), `schedule_featured_contents` (19). |
| `allergens` | 14 | System table. `tenant_id` assente. Public read. |
| `analytics_events` | 5669 | Esempio di tabella event-stream tenant-scoped. Pattern simile per audit ordini. |
| `audit_events` | 14 | Audit globale. RLS gap noto (no policy). |
| `notifications` | 1 | Già in publication `supabase_realtime`. **Pattern realtime da copiare.** |

**Helper RPC esistenti**:

- `public.get_my_tenant_ids()` — base di tutte le RLS tenant-scoped.
- `public.is_reserved_slug(text)` — usata per validazione slug. Riusabile per `tables.label` (no, label è libero); per `tables.qr_token` no, è UUID.
- `public.get_public_translations(...)` — SECURITY DEFINER, invocata da `resolve-public-catalog`.
- `public.get_schedule_featured_contents(schedule_id, tenant_id)` — SECURITY DEFINER, STABLE, tenant_guard.
- `public.get_tenant_public_info(p_tenant_id)` — info tenant per pagina pubblica.

**Pattern RLS canonico** (da `20260225115200_v2_allergens.sql`, `mig_schedule_featured_contents_rls`, `DESIGN_product_characteristics`):

```sql
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant select own rows"
  ON public.tables FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

CREATE POLICY "Tenant insert own rows"
  ON public.tables FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

CREATE POLICY "Tenant update own rows"
  ON public.tables FOR UPDATE TO authenticated
  USING  (tenant_id IN (SELECT public.get_my_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

CREATE POLICY "Tenant delete own rows"
  ON public.tables FOR DELETE TO authenticated
  USING (tenant_id IN (SELECT public.get_my_tenant_ids()));
```

**Realtime**: solo `notifications` è in `ALTER PUBLICATION supabase_realtime ADD TABLE ...`. Migration template:

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_orders_realtime.sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tables;  -- per status derivato
```

**Cron pattern** (da `20260320080000_purge_accounts_cron.sql`, `20260315180000_v2_purge_tenants_cron.sql`, `20260411100000_stripe_subscription_setup.sql:77`):

```sql
SELECT cron.schedule(
  'reset-product-availability-overrides',
  '0 4 * * *',  -- 04:00 Europe/Rome (server UTC: dipende dalla policy progetto)
  $$ SELECT extensions.http_post(...) $$  -- o DELETE diretto in SQL
);
```

**Security Advisor** — issues attuali rilevanti per nuove tabelle (da non replicare):

- `rls_enabled_no_policy` su `audit_events`, `otp_challenges`, `otp_send_audit` (pre-esistenti, INFO level). NUOVE tabelle Ordini DEVONO avere 4 policy CRUD subito.
- `schedule_targets` no `tenant_id`/no RLS (security gap noto, NON replicare).

### Area E — Stripe (touch leggero)

- `src/services/supabase/billing.ts` (52 LOC) — minimal: chiama edge `stripe-checkout`, `stripe-portal`, `stripe-update-seats`.
- `supabase/functions/stripe-webhook/index.ts` (~301 LOC) — pattern da replicare per webhook futuri (es. `payment_intent.succeeded` su ordini pagabili):
  - `verify_jwt: false` + verify firma `stripe-signature` con `stripe.webhooks.constructEventAsync(rawBody, signature, STRIPE_WEBHOOK_SECRET)`.
  - Idempotency con tabella `public.stripe_processed_events` (INSERT ON CONFLICT DO NOTHING, codice `23505` = già processato → return 200 silenzioso).
  - Errori applicativi → tabella `public.webhook_errors` (audit) ma return 200 a Stripe per evitare retry storm.
- Pattern Stripe lifecycle: `_shared/stripe-helpers.ts` con `scheduleStripeCancel`, `reactivateStripeSubIfScheduled`, `cancelStripeSubImmediate`, `deleteStripeCustomer`. Per "ordine pagabile" (futuro) si aggiungono helper `createPaymentIntent` + `confirmOrderPayment` nello stesso file.
- **Aggancio futuro**: campo `orders.payment_intent_id`, `orders.paid_at`. NON necessario per MVP "Ordina dal tavolo" senza pagamento online.

### Area F — Allergeni

- Tabella `public.allergens` (14 righe seed UE). Schema: `id smallint PK, code text UNIQUE, label_it text, label_en text, sort_order int`. Cross-tenant, no `tenant_id`. Una sola policy RLS: SELECT public read.
- Tabella join `public.product_allergens` (238 righe). PK composite `(product_id, allergen_id)`, FK CASCADE su tenant + product, RESTRICT su allergen. RLS: 4 policy tenant-scoped + 1 public read (`anon` SELECT true).
- Resa pubblica: `AllergensSheet` in `src/components/PublicCollectionView/AllergensSheet/` (sheet che mostra elenco allergeni per categoria). Allergeni sono già tradotti via `applyAllergens()` in `resolve-public-catalog`.
- **Riuso per Ordini**: il filtro allergeni cliente-side già esiste. Il prodotto in carrello porta con sé `allergens[]` dallo snapshot, ma per MVP NON è necessario serializzare allergens su `order_items` (il flusso "alert allergeni nel carrello" è UX layer, non persistenza).

---

## 3. Pattern da riusare

| Cosa serve | Pattern esistente da copiare | File di riferimento |
|---|---|---|
| Layout pagina admin | `MainLayout` con sidebar + outlet | `src/layouts/MainLayout/MainLayout.tsx:1` |
| Voce sidebar nuova | `buildGroups()` + `NavGroup` | `src/components/layout/Sidebar/Sidebar.tsx` (gruppo Operatività) |
| Page admin (lista + drawer) | `Products.tsx` state pattern (loadData, isLoading, drawer mode) | `src/pages/Dashboard/Products/Products.tsx` |
| Drawer CRUD | `SystemDrawer + DrawerLayout + Form (formId, mode, entityData, tenantId, onSuccess, onSavingChange)` | `src/pages/Dashboard/Products/ProductCreateEditDrawer.tsx` |
| Drawer "edit identità" semplice | `ContactsMainDrawer` (no mode, solo edit) | `src/pages/Operativita/Attivita/tabs/contacts/ContactsMainDrawer.tsx` |
| Service domain | `list*/get*/create*/update*/delete*` con `tenantId` | `src/services/supabase/products.ts` |
| Edge Function pubblica con CORS + service_role | `// @ts-nocheck` + `serve` + `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` + `corsHeaders` | `supabase/functions/resolve-public-catalog/index.ts` |
| Edge Function con verifica firma + idempotenza | Verifica firma + `INSERT ON CONFLICT 23505 → return 200` | `supabase/functions/stripe-webhook/index.ts` |
| Realtime subscribe (template per `subscribeToOrders`) | `subscribeToNotifications(userId, onNew)` con `RealtimeChannel` | `src/services/supabase/notifications.ts:81` |
| Realtime publication migration | `ALTER PUBLICATION supabase_realtime ADD TABLE` | `supabase/migrations/20260410140000_extend_notifications_schema.sql:70` |
| RLS 4-policy template | `Tenant {select|insert|update|delete} own rows` con `get_my_tenant_ids()` | `supabase/migrations/20260225115200_v2_allergens.sql`, `mig_schedule_featured_contents_rls` |
| Public read RLS | `CREATE POLICY ... TO anon USING (true)` | `product_allergens` (post-fix `20260410130000`), `allergens` |
| pg_cron edge function trigger | `cron.schedule(name, '0 4 * * *', http_post(...))` | `supabase/migrations/20260320080000_purge_accounts_cron.sql:32` |
| Sheet/Modal pagina pubblica | `PublicSheet` (mobile bottom-sheet drag-to-close + desktop dialog, body scroll lock iOS-safe) | `src/components/PublicCollectionView/PublicSheet/PublicSheet.tsx` |
| Cache localStorage (per "I miei ordini" persistente) | `publicCatalogCache.ts` schema versionato + TTL + prune + namespace | `src/services/publicCatalog/publicCatalogCache.ts` |
| Resolver risoluzione regole tenant + sede | `resolveActivityCatalogs(activityId, now, tenantId)` (Edge + frontend duplicato) | `supabase/functions/_shared/resolveActivityCatalogs.ts`, `src/services/supabase/resolveActivityCatalogs.ts` |
| Validazione server-side ordine | Riuso di `resolveActivityCatalogs` per ricalcolo prezzo + check visibilità + check `activity_product_overrides` | stesso file sopra |
| Cleanup notturno scadenze | `cleanup-draft-schedules` edge function + cron | `supabase/functions/cleanup-draft-schedules/index.ts` |
| Idempotency table per webhook | `stripe_processed_events` (event_id PK + insert ON CONFLICT) | `supabase/functions/stripe-webhook/index.ts` |
| Audit/error log table | `webhook_errors` | `supabase/migrations/20260428100000_stripe_webhook_hardening.sql` (presunto) |
| Activity-scoped resource pattern | `activity_hours`, `activity_closures`, `activity_media`, `activity_product_overrides` | tutte hanno FK CASCADE su `activities`, RLS via `tenant_id` |
| Soft-block per tenant non attivo | `SubscriptionBanner` + `ActivationRequired` in `MainLayout` | `src/layouts/MainLayout/MainLayout.tsx` + `src/components/Subscription/` |
| Toast | `useToast().showToast({ message, type })` | global |
| Caricamento immagine compressa | `src/services/supabase/upload.ts` + `src/utils/compressImage.ts` | per QR codes generati come PNG |

---

## 4. Gap analysis per componente

Stati: ✅ Esiste, riutilizzabile · 🔧 Esiste, va esteso · 🆕 Da creare · ⚠️ Conflitto/decisione aperta

### DB tables

| Componente | Stato | Pattern di riferimento | Note |
|---|---|---|---|
| `tables (id, tenant_id, activity_id, label, qr_token UNIQUE, seats, zone, status, timestamps)` | 🆕 | `activity_hours` (activity-scoped + tenant_id) | `qr_token` UUID v4 con UNIQUE INDEX. `status` è "manual close" override (non derivato), default `open`. CASCADE da `activities`. |
| `customer_sessions (id, tenant_id, activity_id, current_table_id, customer_name, first_seen_at, last_activity_at, expires_at)` | 🆕 | nessun pattern diretto (prima entità "anonima persistente" in CataloGlobe) | `current_table_id` nullable (sessione segue il cliente tra tavoli). Niente FK su `auth.users`. RLS: solo `service_role` accede, dashboard admin legge tramite RPC `get_active_sessions(activity_id)` SECURITY DEFINER con guard tenant. |
| `orders (id, tenant_id, activity_id, table_id, customer_session_id, customer_name, status, submitted_at, acknowledged_at, delivered_at, cancelled_at, cancelled_by, cancellation_reason, notes, total_amount, currency, resolved_schedule_id, ...)` | 🆕 | `analytics_events` per pattern event-stream + `notifications` per realtime | Realtime ON. Optimistic locking via `version int DEFAULT 0` + `version = expected_version + 1` in `acknowledge-order` etc. |
| `order_items (id, order_id, product_id, product_name_snapshot, unit_price_snapshot, quantity, line_total, options_snapshot jsonb, item_notes, created_at)` | 🆕 | `product_allergens` (composite/snapshot) | FK CASCADE su `orders`. `options_snapshot` JSONB serializza scelte option_group/value + price_delta al momento del submit. |
| `product_availability_overrides` | ⚠️ | `activity_product_overrides` esiste già con campi simili | **Decisione richiesta** (vedi Questione 1). Opzione A: estendere tabella esistente con `available boolean`, `disabled_at timestamptz`, `disabled_reason text`. Opzione B: nuova tabella separata. |

### Service layer

| Componente | Stato | Pattern di riferimento | Note |
|---|---|---|---|
| `src/services/supabase/tables.ts` | 🆕 | `activities.ts`, `activityHours.ts` | `listTables(tenantId, activityId)`, `createTable(tenantId, activityId, data)`, `updateTable(id, tenantId, data)`, `deleteTable(id, tenantId)`, `regenerateQrToken(id, tenantId)`. |
| `src/services/supabase/customerSessions.ts` | 🆕 | nessuno (anon-only flow) | API minimale lato admin: `listActiveSessionsForActivity(tenantId, activityId)`. La create/update viene fatta da edge `submit-order` (service_role). |
| `src/services/supabase/orders.ts` | 🆕 | `notifications.ts` (per realtime pattern) | `listOrders(tenantId, activityId, filters)`, `getOrder(id, tenantId)`, `subscribeToOrders(activityId, onChange) → RealtimeChannel`, `unsubscribeFromOrders(channel)`. Le mutations stato vanno via Edge Function. |
| `src/services/supabase/productAvailability.ts` | 🆕 (o esteso da `activeCatalog.ts`) | `activeCatalog.ts` (CRUD overrides) | `setProductAvailability(tenantId, productId, activityId, available)`, `listOverridesForActivity(tenantId, activityId)`. Già esiste `activeCatalog.ts` con CRUD su `activity_product_overrides`. |
| `src/services/publicCatalog/orderSession.ts` | 🆕 | `publicCatalogCache.ts` | Helper localStorage: `getOrCreateSessionId() → string` (UUID v4 in localStorage, TTL 12h refresh on activity), `getMyOrders() → cached snapshot`, `clearSession()`. |

### Edge Functions

| Componente | Stato | Pattern di riferimento | Note |
|---|---|---|---|
| `submit-order` | 🆕 | `submit-review` (anon write con validazione + service_role) | Input: `{ slug, table_token, customer_session_id, customer_name?, items: [{product_id, quantity, options: [{group_id, value_id}], item_notes?}], notes? }`. Resolve activity by slug, valida tavolo by token, riusa `resolveActivityCatalogs(activity.id, now, tenant_id)` per ricalcolo prezzi e check visibilità + check overrides. INSERT `orders` + `order_items` in transaction. Trigger Realtime via INSERT (tutto via publication). Output: `{ order_id, total_amount, status: "submitted" }`. |
| `acknowledge-order` | 🆕 | `submit-review` + `update-tenant` (auth admin) | Input: `{ order_id, expected_version }`. Auth: dashboard user con tenant guard. Optimistic lock via `WHERE version = expected_version`. Update `status='acknowledged'`, `acknowledged_at=now()`, `version+=1`. Errore `409 conflict` se version mismatch. |
| `deliver-order` | 🆕 | come `acknowledge-order` | Stesso pattern. `status='delivered'`, `delivered_at=now()`. |
| `cancel-order` | 🆕 | come `acknowledge-order` | Input aggiunge `cancelled_by` (`admin` | `customer`), `cancellation_reason`. Cliente può cancellare solo se `status='submitted'` e entro N minuti (configurabile). |
| `close-table` | 🆕 | nessun pattern diretto | Input: `{ table_id }`. Auth admin. Set `tables.status='closed'`. Side-effect: marca `customer_sessions.current_table_id=NULL` per tutte le sessioni con quel tavolo (preserva la session per "follow customer"). NON cancella ordini delivered, ma libera il tavolo. |
| `generate-table-qrs` | 🆕 | `generate-menu-pdf` (genera asset binari) | Input: `{ activity_id, table_ids: string[]?, format?: "pdf"|"png-zip" }`. Auth admin. Genera QR code PNG (libreria `qrcode` da Deno) per ogni tavolo + PDF stampabile (riusa `generate-menu-pdf` template Puppeteer). URL QR: `https://<host>/<activity.slug>?t=<table.qr_token>`. |
| `resolve-public-catalog` | 🔧 (opzionale) | self | Aggiungere param opzionale `table_token?` per loggare analytics + branding "stai ordinando dal tavolo X". Non blocca il render se token invalido. |

### Frontend admin (dashboard)

| Componente | Stato | Pattern di riferimento | Note |
|---|---|---|---|
| Route `/business/:businessId/orders` | 🆕 | route `scheduling`/`reviews` | Lista ordini su tutte le sedi del tenant. Filtri: sede, stato, data. |
| Route `/business/:businessId/orders/:activityId` | 🆕 | route `scheduling/:ruleId` | Vista per-sede con grid tavoli + drawer dettaglio tavolo (apre drawer destro con sessioni + ordini live). |
| Voce Sidebar "Ordini" | 🆕 | `Sidebar.tsx buildGroups` | Gruppo "Operatività". Icon `ClipboardList` da `lucide-react`. |
| `PAGE_TITLES.orders = 'Ordini'` | 🆕 | `MainLayout.tsx` mappa | One-line update. |
| `OrdersOverview.tsx` page | 🆕 | `Products.tsx` | DataTable con paginazione. Subscribe realtime su tutti gli orders del tenant (filter via RLS). |
| `OrdersActivityPage.tsx` | 🆕 | `ProgrammingRuleDetail.tsx` | Layout grid tavoli + click tavolo → `TableDetailDrawer`. Subscribe realtime filtrato per `activity_id`. |
| `TableDetailDrawer.tsx` | 🆕 | `ContactsMainDrawer.tsx` (drawer "edit semplice") | Mostra sessioni attive + ordini. Bottoni acknowledge/deliver/cancel/close-table. |
| `TableCreateEditDrawer.tsx` + `TableForm.tsx` | 🆕 | `ProductCreateEditDrawer.tsx` + form pattern | CRUD tavoli. Campi: label, seats, zone. `qr_token` generato server-side. |
| `TableDeleteDrawer.tsx` | 🆕 | `ProductDeleteDrawer.tsx` (Pattern B informativo + cleanup) | FK orders ON DELETE RESTRICT (mantenere storico) → in realtà Pattern A (blocco preventivo) se ci sono ordini non `delivered` o `cancelled`. Vedi Questione 5. |
| Toggle disponibilità prodotto in `ProductPage` | 🔧 | `ActivityHoursForm` (toggle per-day) | Aggiungere sezione "Disponibilità per sede" che lista tutte le sedi del tenant + Switch per ognuna. Già esiste `activity_product_overrides` con `visible_override` — Questione 1 decide se overload o nuovo campo. |
| Page Tavoli (CRUD) | 🆕 | `Products.tsx` | Sotto `/business/:businessId/locations/:activityId/tables` (annidato in pagina sede) o standalone? Vedi Questione 3. |

### Frontend pubblico (cliente)

| Componente | Stato | Pattern di riferimento | Note |
|---|---|---|---|
| Lettura `?t=<table_token>` da URL | 🆕 | `useSearchParams` già usato in `PublicCollectionPage` per `?simulate=` | Salva in localStorage namespaced per slug. |
| Carrello in pagina pubblica | 🆕 | `SelectionSheet` (esiste, oggi informativa) | Estendere `SelectionSheet` con bottone "Aggiungi al carrello" + counter. Carrello globale via context o useState in PublicCollectionPage. |
| Sheet "Carrello" | 🆕 | `PublicSheet` + `AllergensSheet` (UI list pattern) | Bottom-sheet con line items, subtotal, bottone "Invia ordine". |
| Sheet "I miei ordini" persistente | 🆕 | `PublicSheet` + cache localStorage `publicCatalogCache.ts` | Subscribe realtime su `orders` filtrato per `customer_session_id`. Mostra stati con StatusBadge. |
| Pulsante "I miei ordini" floating | 🆕 | nessun pattern, nuovo bottone fixed bottom-right | Visibile solo se sessione ha ordini attivi. |
| Form nome cliente | 🆕 | nessun pattern (campo opzionale, single input) | Modale al primo "Aggiungi al carrello" o al submit. |
| Schermata "ordine inviato" + tracking real-time | 🆕 | `PublicSheet` | Subscribe realtime su `orders` filtrato per `id`. |
| Banner "stai ordinando dal tavolo X" | 🆕 | `StaleDataBanner.tsx` (pattern banner top) | Già esiste `StaleDataBanner` riusabile. |
| Generazione/lettura QR | 🆕 frontend admin per visualizzazione/print | nessuno | Edge `generate-table-qrs` produce assets. UI admin scarica zip o pdf. |

### Cross-cutting

| Componente | Stato | Pattern di riferimento | Note |
|---|---|---|---|
| Subscribe realtime admin | 🔧 | `subscribeToNotifications` template diretto | Pattern: `subscribeToOrders(tenantId, activityId?, onChange)` con filter SQL. |
| Fallback polling 15s | 🆕 | nessuno (notifications usa solo realtime) | `useEffect` con `setInterval` + `clearInterval`. Combina con realtime: pause polling se channel.state === 'joined'. |
| Validazione server-side ordine (riuso scheduleResolver) | 🔧 | `resolveActivityCatalogs` esiste e copre layout/featured/price/visibility | Aggancio in `submit-order` edge function. Non duplicare logica. |
| pg_cron reset disponibilità | 🆕 | `purge-accounts` cron template | Job notturno che `DELETE FROM product_availability_overrides WHERE disabled_at < now() - interval '24 hours'` o similar logic. |
| pg_cron scadenza sessioni | 🆕 | come sopra | `DELETE FROM customer_sessions WHERE expires_at < now()`. |
| Realtime publication | 🆕 | `20260410140000_extend_notifications_schema.sql:70` | `ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;` + `tables`. |
| RLS policy per nuove tabelle | 🆕 | template 4-policy + 1 public read selettiva | `tables` e `customer_sessions` necessitano policy speciali per anon read scoped per `qr_token`/`session_id`. Vedi Questione 4. |
| Integrazione `resolve-public-catalog` (param tavolo) | 🔧 | self | Param `table_token?` passa tavolo come contesto. Validazione lato edge: SELECT da `tables WHERE qr_token = ? AND activity.tenant_id = ...`. |
| Soft-block tenant suspended | ✅ | `SubscriptionBanner` + `ActivationRequired` esistono | Già in `MainLayout`. Per pagina pubblica: `subscription_inactive` già gestito da `resolve-public-catalog` (banner). Edge `submit-order` deve ritornare 423 se tenant.subscription_status non in `(active, trialing)`. |
| Audit log mutations ordini | 🔧 | `audit_events` o `audit_logs` esistenti | Riusare. Se le tabelle sono problematiche (gap RLS noto), valutare nuova tabella `order_audit_log` tenant-scoped. |

---

## 5. Questioni aperte

Numerate per priorità. Ogni voce: cosa emerge, perché blocca, opzioni.

### 5.1 [PRIORITÀ ALTA] Conflitto naming/scope con `activity_product_overrides`

**Cosa emerge**: la tabella `public.activity_product_overrides` esiste già (1 riga in staging). Schema:

```sql
-- supabase/migrations/20260223154000_v2_activity_product_overrides.sql
CREATE TABLE public.v2_activity_product_overrides (
  id uuid PRIMARY KEY,
  activity_id uuid NOT NULL REFERENCES v2_activities(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES v2_products(id) ON DELETE CASCADE,
  price_override numeric NULL,
  visible_override boolean NULL,
  created_at, updated_at,
  UNIQUE(activity_id, product_id)
);
```

Letta da `_shared/resolveActivityCatalogs.ts:1705-1706` (filtra `visible_override`) e usata via `src/services/supabase/activeCatalog.ts` per CRUD.

L'architettura concordata richiede:

```
product_availability_overrides (id, tenant_id, product_id, activity_id, available, disabled_at, disabled_reason, UNIQUE(product_id, activity_id))
```

**Perché blocca**: due tabelle con scope sovrapposto = bug latenti, doppia query nel resolver, drift.

**Opzioni**:

- **A** — Estendere `activity_product_overrides` aggiungendo colonne `available boolean DEFAULT true`, `disabled_at timestamptz NULL`, `disabled_reason text NULL`, `tenant_id uuid NOT NULL` (oggi assente, da backfillare via `activities.tenant_id`). Adattare `resolveActivityCatalogs` per filtrare anche su `available`. **Pro**: niente duplicazione. **Contro**: la tabella attuale ha semantica "override prezzo + visibilità", non "available". `visible_override = false` non è semanticamente identico a "out of stock temporaneamente". Distinguerli serve per UX (admin: "ho disabilitato manualmente perché finito" vs "questo prodotto è mai venduto in questa sede").
- **B** — Lasciare `activity_product_overrides` per `price_override`/`visible_override` (semantica "personalizzazione catalogo") e creare `product_availability_overrides` separata per "disponibilità ad-hoc" con reset notturno. Il resolver applica entrambi: `visible_override = false` rimuove il prodotto, `available = false` lo mostra grigiato/sold-out. **Pro**: separazione semantica chiara. **Contro**: due query, due tabelle, due UI di gestione.
- **C** — Rinominare `activity_product_overrides` → `activity_product_settings` (è dove vivono override permanenti) e creare nuova tabella `product_availability_overrides` per override transienti. Migration di rename + service rename.

**Raccomandazione**: B se il reset notturno è una feature core dell'epic (è l'unico caso). A se si accetta che "manuale disabilita" sia un'azione persistente ma override-able dall'admin manualmente.

### 5.2 [PRIORITÀ ALTA] Realtime pubblico anon — RLS per `customer_session_id`

**Cosa emerge**: il cliente è anonimo. La schermata "I miei ordini" deve subscribe a Realtime su `orders WHERE customer_session_id = ?`. Realtime applica RLS server-side: per ricevere events, l'anon role deve avere SELECT permessa.

Una policy `TO anon USING (true)` su `orders` espone TUTTI gli ordini di TUTTI i tenant. Inaccettabile.

**Perché blocca**: senza una policy granulare, il flusso "cliente vede i propri ordini" o non funziona (no subscribe events) o leak privacy.

**Opzioni**:

- **A** — Policy basata su signed JWT generato al `submit-order` con claim `customer_session_id`. Edge ritorna `realtime_token`. Client lo passa a `supabase.realtime.setAuth(token)`. Policy: `USING (customer_session_id::text = (auth.jwt()->>'customer_session_id'))`. **Pro**: secure. **Contro**: richiede setup JWT custom, non immediato.
- **B** — Polling-only per la pagina pubblica (no realtime). 15s polling già in architettura come fallback. Per MVP: usa solo polling, niente realtime. Realtime solo lato admin (authenticated). **Pro**: niente RLS anon. **Contro**: latenza updates 15s (accettabile?).
- **C** — RPC `get_my_orders(p_session_id uuid)` SECURITY DEFINER con guard interno (`SET search_path TO ''`, return solo orders matching). Usata via polling. Realtime resta admin-only. Stessa UX di B ma più clean. **Pro**: pattern già usato in CataloGlobe (`get_public_translations`, `get_schedule_featured_contents`). **Contro**: come B, no realtime client.

**Raccomandazione**: B+C come MVP (polling + RPC SECURITY DEFINER). Realtime client opzione futura via JWT custom.

### 5.3 [PRIORITÀ MEDIA] Posizione UI tavoli — entità sede o entità top-level?

**Cosa emerge**: la dashboard tavoli può vivere:

- (a) annidata in pagina sede: `/business/:businessId/locations/:activityId` con tab "Tavoli"
- (b) standalone: `/business/:businessId/tables` con filtro sede
- (c) sotto Ordini: `/business/:businessId/orders/:activityId` mostra grid tavoli + drawer ordini

**Perché**: incide su sidebar, navigazione e mental model utente.

**Opzioni**: (a) e (c) combinati. Tavoli si gestiscono dentro la sede (CRUD), ma lo stato live (chi sta ordinando dove) vive nella sezione Ordini.

**Raccomandazione**: CRUD tavoli in tab dedicato dentro `ActivityDetailPage` (esiste a `/business/:businessId/locations/:activityId`). Live-status in `OrdersActivityPage`.

### 5.4 [PRIORITÀ ALTA] Auth flusso anon per `tables` lookup by `qr_token`

**Cosa emerge**: cliente arriva via `https://app.com/<slug>?t=<qr_token>`. Deve risolvere `tables` row da `qr_token` lato anon. Servono:

- SELECT su `tables` con policy `TO anon USING (true)` ⚠️ leak: tutti i tavoli di tutti i tenant esposti se conosci l'id (anche se UUID).
- O policy `TO anon USING (qr_token::text = current_setting('request.headers')->>'x-table-token')` (Supabase header passing).
- O RPC `resolve_table_by_token(token uuid) RETURNS table_summary` SECURITY DEFINER. **Pattern preferito** (consistente con `get_tenant_public_info`).

**Raccomandazione**: RPC `public.resolve_table_by_token(p_token uuid)` SECURITY DEFINER STABLE che ritorna `(table_id, activity_id, tenant_id, label, seats, zone)`. Invocata da edge `submit-order` e potenzialmente da `resolve-public-catalog` v2 con param `table_token`.

### 5.5 [PRIORITÀ MEDIA] Delete drawer pattern per `tables`

**Cosa emerge**: CLAUDE.md definisce 3 pattern delete (A blocco preventivo, B informativo+cleanup, C swap-then-delete). Cosa applicare a `tables`?

`tables` ha FK inbound da `orders`. Se ON DELETE RESTRICT (raccomandato per preservare storico ordini): **Pattern A** se ci sono ordini non finalizzati. **Pattern B** se accettiamo soft-delete (`deleted_at` su tables, orders restano ma table_id resta puntatore).

**Raccomandazione**: Soft-delete su `tables` (`deleted_at timestamptz NULL`, escludere da liste/qr-resolve), ON DELETE RESTRICT su `orders.table_id`. Pattern delete drawer = **A** (blocco preventivo se esistono ordini `submitted`/`acknowledged` collegati al tavolo) + **B** (informa che il tavolo verrà soft-deleted e gli ordini storici restano linked).

### 5.6 [PRIORITÀ MEDIA] Gating per subscription_status

**Cosa emerge**: tenant in `subscription_status='past_due'` o `'canceled'` deve poter ricevere ordini? La pagina pubblica oggi mostra `subscription_inactive` se tenant non attivo (banner + degradation). Gli ordini submit devono essere bloccati o ignorati silenziosamente?

**Raccomandazione**: `submit-order` ritorna 423 (Locked) con messaggio i18n se `tenant.subscription_status NOT IN ('active', 'trialing')`. UI mostra "Servizio non disponibile, contatta lo staff".

### 5.7 [PRIORITÀ BASSA] Stripe per pagamento ordine — futuro

Niente da fare ora. Solo nota: lo schema `orders` può ospitare in futuro `payment_intent_id text NULL`, `paid_at timestamptz NULL`, `payment_status text NULL`. Webhook `stripe-webhook` riusabile.

### 5.8 [PRIORITÀ BASSA] Fuori scope letti accidentalmente

Nessuno. Audit chiuso al perimetro definito.

### 5.9 [PRIORITÀ MEDIA] Sincronizzazione `scheduleResolver.ts` (gemello)

**Cosa emerge**: `_shared/scheduleResolver.ts` e `src/services/supabase/scheduleResolver.ts` sono duplicati byte-identical. La regola CLAUDE.md è di sincronizzarli sempre. Per la feature Ordini il resolver NON cambia (solo lettura). Ma `_shared/resolveActivityCatalogs.ts` e `src/services/supabase/resolveActivityCatalogs.ts` sono anch'essi duplicati e VANNO modificati per leggere `available` da `product_availability_overrides`.

**Raccomandazione**: applicare modifiche in entrambi i file con commit unico. Aggiungere test dedicato alla parità.

### 5.10 [PRIORITÀ MEDIA] Concorrenza submit ordine + race su override

**Cosa emerge**: cliente A clicca "Invia". Edge `submit-order` legge `activity_product_overrides`, vede prodotto disponibile, scrive ordine. Tra le due operazioni, admin disabilita prodotto. Cliente A riceve ordine confermato anche se nel frattempo il prodotto è OOS.

**Raccomandazione**: accettare race window di ~100ms. L'admin vede l'ordine confermato e lo cancellerà manualmente con `cancellation_reason = "out_of_stock"`. Alternativa: lock pessimistico via `SELECT ... FOR UPDATE` su `product_availability_overrides` riga, ma overhead alto vs frequenza evento. Skip per MVP.

---

## 6. Rischi e considerazioni

### Performance

- **Realtime con N sedi**: ogni admin loggato in `OrdersOverview` apre 1 channel filtrato per `tenant_id`. Con 100 ordini/min sui 10 tenant attuali, throughput sopportabile (limite Supabase Free: 200 concurrent connections). Se in futuro >50 sedi, valutare un single channel `tenant:{id}` con server-side filter.
- **Polling fallback**: ogni client connesso fa una query ogni 15s. 100 client × 4/min = 400 req/min su `orders`. Indice `(tenant_id, activity_id, status, submitted_at DESC)` obbligatorio.
- **Query `submit-order` riusa `resolveActivityCatalogs`**: il resolver fa molte query (catalog + categories + products + variants + options + allergens + characteristics + ingredients + featured + overrides). Per MVP OK, in produzione cache resolver per (activity_id, minute_window) con `Cache-Control: public, max-age=60`.

### Sicurezza

- **`tables.qr_token`**: UUID v4 random (122 bit entropy). NON predictable. Anche se `tables` fosse SELECT public, conoscere il token è prova di possesso del QR fisico. OK come segreto leggero.
- **`customer_session_id`**: stesso ragionamento. UUID v4 in localStorage. Niente PII collegata server-side oltre `customer_name?`.
- **RLS gap noto**: `schedule_targets` non ha `tenant_id`. NON replicare. `tables` e `orders` DEVONO avere `tenant_id NOT NULL` + 4 policy CRUD + indice composito su `(tenant_id, activity_id)`.
- **Edge submit-order**: niente trust del prezzo client. SEMPRE ricalcolo via `resolveActivityCatalogs`. Confronto: se totale calcolato ≠ totale dichiarato → return 422.
- **Rate limit submit**: aggiungere check `customer_sessions.last_activity_at` o IP-based throttle (max 10 submit/min per session). Pattern simile a `submit-review`.

### Concorrenza

- **Optimistic locking**: campo `version int DEFAULT 0` su `orders`. Update: `UPDATE orders SET status=..., version=version+1 WHERE id=? AND version=?` con `count` check → 0 = conflict 409.
- **Unique constraint timing**: `tables.qr_token UNIQUE` impedisce duplicati. Race su regenerate: gestire via UUID v4 (collision probability negligibile).

### Edge case

- **Cliente offline durante submit**: `fetchPublicCatalog` ha già pattern retry+backoff. Riusare per `submit-order`. Se fallisce dopo 3 tentativi, mostra "Ordine non inviato, riprova" (NO save offline — semplifica MVP).
- **Cliente cambia tavolo a metà cena**: `customer_sessions.current_table_id` viene aggiornato al nuovo `?t=<token>`. Ordini precedenti restano linked al table_id originale (storico corretto).
- **Tavolo eliminato mentre cliente sta ordinando**: soft-delete impedisce hard delete con FK orders. Submit fallisce con 410 Gone. UI mostra "Tavolo non disponibile".
- **Sessione scaduta tra submit e tracking**: cliente cerca ordini, sessione expired da cron. Renderizzare graceful con "I tuoi ordini precedenti sono scaduti".
- **Browser blocca localStorage**: la cache `publicCatalogCache.ts` già degrada silenziosamente. Stessa pattern: `getOrCreateSessionId` ritorna sempre un UUID, scrive best-effort.
- **Tenant sospeso a metà sessione cliente**: `submit-order` 423. UI mostra messaggio. Sessione e ordini esistenti restano leggibili ma read-only.
- **Cambio lingua durante carrello**: snapshot `product_name_snapshot` è nella lingua del momento del submit. Se cambia lingua a metà, il carrello in stato draft può essere ricostruito al volo (i prodotti sono già localizzati nel `resolved`).

---

## 7. Roadmap implementativa proposta

Stima effort: S = ~4h, M = ~1d, L = ~3d. Tempi assumono 1 dev full-time familiare con codebase.

### Fase 0 — Decisioni bloccanti (mezza giornata)

1. **Risolvere Questione 5.1** (`activity_product_overrides` scope). [S]
2. **Risolvere Questione 5.2** (Realtime client: polling-only o JWT custom). [S]
3. **Decidere flusso URL tavolo** (`?t=<token>` query param vs `/<slug>/t/<token>` path). [S]
4. **Confermare Questione 5.5** (delete drawer pattern per tables). [S]

Dipendenze: nessuna. Output: 4 ADR brevi inline qui o in `docs/orders-decisions.md`.

### Fase 1 — Foundations DB (~3 giorni)

1. **Migration `tables` + RLS** [M]. Riferimento CLAUDE.md → "Database" + "Pattern obbligatori".
2. **Migration `customer_sessions` + RPC `get_or_create_session` SECURITY DEFINER** [M]. Decisione 5.4: anche RPC `resolve_table_by_token`.
3. **Migration `orders` + `order_items` + indici (`tenant_id, activity_id, status, submitted_at DESC`) + RLS + optimistic lock** [L]. Riferimento Pattern A (analytics_events) per event-stream.
4. **Migration `product_availability_overrides`** (o estensione `activity_product_overrides` se opzione A) [M]. Backfill se opzione A.
5. **Migration realtime publication** (`ALTER PUBLICATION supabase_realtime ADD TABLE orders, tables`) [S].
6. **Migration pg_cron** per reset notturno (riusa pattern `purge-accounts`) [M].
7. **Verify con `mcp__supabase-staging__get_advisors`** [S].

Dipendenze: Fase 0. Output: 7 file migration in `supabase/migrations/`.

### Fase 2 — Service layer + Edge Functions (~5 giorni)

1. **`src/services/supabase/tables.ts`** [M]. CRUD + `regenerateQrToken`.
2. **`src/services/supabase/orders.ts`** [M]. List + subscribe (template `notifications.ts`).
3. **`src/services/supabase/productAvailability.ts`** (o estensione `activeCatalog.ts`) [M].
4. **`src/services/publicCatalog/orderSession.ts`** + cache "I miei ordini" [M]. Riusa pattern `publicCatalogCache.ts`.
5. **Edge `submit-order`** [L]. Riusa `_shared/resolveActivityCatalogs.ts` per validation. Auth: `verify_jwt: false` + service_role + rate-limit basic.
6. **Edge `acknowledge-order`, `deliver-order`, `cancel-order`** [M each]. Pattern uniformi, condividere helper in `_shared/orders.ts`.
7. **Edge `close-table`** [M].
8. **Edge `generate-table-qrs`** [L]. Libreria `qrcode` Deno + Puppeteer per PDF. Storage bucket `table-qrs` per archiviare zip.
9. **Estendere `_shared/resolveActivityCatalogs.ts` per leggere `available`** [M]. Sincronizzare con copia frontend.

Dipendenze: Fase 1. Output: 6 nuove edge functions, 4 nuovi service files, 1 modifica resolver (entrambe le copie).

### Fase 3 — UI Admin (~5 giorni)

1. **Aggiungere route in `App.tsx`** [S].
2. **Voce Sidebar + `PAGE_TITLES`** [S].
3. **`OrdersOverview.tsx`** [L]. DataTable, filtri, subscribe realtime (paginazione su lista).
4. **`OrdersActivityPage.tsx`** + `TableDetailDrawer.tsx` [L]. Grid tavoli, click → drawer.
5. **`TableCreateEditDrawer.tsx`** + `TableForm.tsx` + `TableDeleteDrawer.tsx` (Pattern misto A+B) [L].
6. **Tab "Tavoli" in `ActivityDetailPage`** [M]. Lista + bottone "Stampa QR".
7. **Sezione "Disponibilità per sede" in `ProductPage`** [M]. Switch toggle per sede.
8. **Action stampa QR**: integrazione edge `generate-table-qrs` [M].
9. **Subscribe realtime + fallback polling 15s** in hook `useOrdersStream` [M].

Dipendenze: Fase 2. Output: ~12 file nuovi sotto `src/pages/Dashboard/Orders/` + estensioni a `ActivityDetailPage`/`ProductPage`/Sidebar/MainLayout/App.tsx.

### Fase 4 — UI Cliente (~4 giorni)

1. **Lettura `?t=<token>` + persistenza session** in `PublicCollectionPage` [M].
2. **Banner "stai ordinando dal tavolo X"** (riusa `StaleDataBanner` look) [S].
3. **Form nome cliente opzionale** (modale al primo "Aggiungi al carrello") [S].
4. **Estendere `SelectionSheet` con "Aggiungi al carrello"** [M].
5. **`CartSheet.tsx`** (`PublicSheet`) — line items, total, "Invia ordine" [L].
6. **`MyOrdersSheet.tsx`** (`PublicSheet`) — lista ordini sessione + polling 15s o realtime (decisione 5.2) [L].
7. **Bottone floating "I miei ordini"** + counter [M].
8. **Schermata conferma ordine** + tracking real-time [M].
9. **Gestione errori submit** (rate limit, OOS, tenant suspended) con i18n [M].

Dipendenze: Fase 2. Output: ~10 file nuovi sotto `src/components/PublicCollectionView/Orders/` + estensioni a `PublicCollectionPage`/`SelectionSheet`.

### Fase 5 — i18n (1 giorno)

Aggiungere chiavi a `src/i18n/locales/{it,en,fr,es,de}/public.json` + dashboard. Strings: "Aggiungi al carrello", "Carrello", "Invia ordine", "I miei ordini", stati, errori. [M]

### Fase 6 — QA + edge cases (~3 giorni)

1. **Test E2E Playwright** su flusso completo cliente + admin [L]. Riferimento CLAUDE.md → MCP playwright obbligatorio per modifiche `PublicCollectionView`.
2. **Test concorrenza submit** + optimistic lock [M].
3. **Test sessione expire/recovery** [M].
4. **Test offline/network failure** [M].
5. **Security review** (`/security-review` slash command) prima del merge — RLS su `tables`/`orders`/`customer_sessions`, edge functions, anon access [M].

### Stima totale

| Fase | Effort |
|---|---|
| Fase 0 | 0.5 gg |
| Fase 1 | 3 gg |
| Fase 2 | 5 gg |
| Fase 3 | 5 gg |
| Fase 4 | 4 gg |
| Fase 5 | 1 gg |
| Fase 6 | 3 gg |
| **Totale** | **~21 giorni** (dev singolo, full-time) |

Critical path: Fase 0 → 1 → 2 → (3 || 4) → 5 → 6.

Aree parallelizzabili: Fase 3 e 4 dopo Fase 2. Fase 5 può iniziare in parallelo a 3/4 da subito con i18n keys.

---

## Appendice A — Mappa file rilevanti per area

| Area | Path | Ruolo |
|---|---|---|
| A | `src/pages/PublicCollectionPage/PublicCollectionPage.tsx` | Entry pubblica |
| A | `src/services/publicCatalog/fetchPublicCatalog.ts` | Wrapper fetch resiliente |
| A | `src/services/publicCatalog/publicCatalogCache.ts` | Cache localStorage TTL 7gg |
| A | `src/components/PublicCollectionView/CollectionView/` | Container catalogo |
| A | `src/components/PublicCollectionView/PublicCollectionHeader/` | Header hero-to-compact |
| A | `src/components/PublicCollectionView/PublicSheet/PublicSheet.tsx` | Sheet bottom mobile + dialog desktop |
| A | `src/components/PublicCollectionView/SelectionSheet/` | Selezione varianti/options (estendere per cart) |
| A | `src/App.tsx:241` | Route pubblica `/:slug/:lang?` |
| B | `supabase/functions/resolve-public-catalog/index.ts` | Edge risoluzione catalogo |
| B | `supabase/functions/_shared/resolveActivityCatalogs.ts:1705` | Lettura `activity_product_overrides` |
| B | `supabase/functions/_shared/scheduleResolver.ts` | Resolver regole (duplicato) |
| B | `src/services/supabase/scheduleResolver.ts` | Resolver regole (duplicato) |
| B | `supabase/functions/_shared/schedulingNow.ts` | Rome timezone helpers |
| C | `src/App.tsx:185-237` | Block business routes |
| C | `src/layouts/MainLayout/MainLayout.tsx` | Layout admin + DrawerProvider + SubscriptionBanner |
| C | `src/components/layout/Sidebar/Sidebar.tsx` | Sidebar `buildGroups` |
| C | `src/components/layout/SystemDrawer/SystemDrawer.tsx` | Drawer destro |
| C | `src/components/layout/SystemDrawer/DrawerLayout.tsx` | Header/children/footer drawer |
| C | `src/pages/Dashboard/Products/Products.tsx` | Esempio Page completo |
| C | `src/pages/Dashboard/Products/ProductCreateEditDrawer.tsx` | Esempio Drawer CRUD |
| C | `src/services/supabase/products.ts` | Esempio service |
| C | `src/services/supabase/notifications.ts:81` | Template realtime subscribe |
| D | `supabase/migrations/20260225115200_v2_allergens.sql` | Template tabella system + RLS public |
| D | `supabase/migrations/20260304120000_v2_schedule_targets.sql` | Anti-pattern (no tenant_id, no RLS) |
| D | `supabase/migrations/20260227200000_v2_rls_base.sql` | Base RLS pattern |
| D | `supabase/migrations/20260410140000_extend_notifications_schema.sql:70` | Realtime publication |
| D | `supabase/migrations/20260320080000_purge_accounts_cron.sql:32` | pg_cron + pg_net edge invocation |
| E | `src/services/supabase/billing.ts` | Service billing |
| E | `supabase/functions/stripe-webhook/index.ts` | Pattern webhook idempotente |
| E | `supabase/functions/_shared/stripe-helpers.ts` | Helper Stripe lifecycle |
| F | `src/components/PublicCollectionView/AllergensSheet/` | UI allergeni pubblica |
| F | `supabase/migrations/20260225115200_v2_allergens.sql` | Schema allergens |

---

## Appendice B — Snippet riferimento

### B.1 Pattern Edge Function (template per `submit-order`)

```ts
// supabase/functions/submit-order/index.ts
// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveActivityCatalogs } from "../_shared/resolveActivityCatalogs.ts";
import { getNowInRome } from "../_shared/schedulingNow.ts";

const corsHeaders = { /* ... vedi resolve-public-catalog ... */ };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  try {
    const body = await req.json();
    // 1. Resolve table by token
    // 2. Validate session + create if missing (RPC get_or_create_session)
    // 3. resolveActivityCatalogs(activity_id, getNowInRome(), tenant_id)
    // 4. Validate items: visibility + price + availability override
    // 5. Check subscription_status
    // 6. INSERT orders + order_items in transaction
    // 7. Return { order_id, total_amount, status }
  } catch (err) {
    return new Response(JSON.stringify({ error: "..." }), { status: 500, headers: corsHeaders });
  }
});
```

### B.2 Realtime subscribe template (per `subscribeToOrders`)

```ts
// src/services/supabase/orders.ts
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/services/supabase/client";

export function subscribeToOrders(
  tenantId: string,
  activityId: string | null,
  onChange: (order: Order) => void
): RealtimeChannel {
  const filter = activityId
    ? `tenant_id=eq.${tenantId}&activity_id=eq.${activityId}`
    : `tenant_id=eq.${tenantId}`;
  return supabase
    .channel(`orders:${tenantId}:${activityId ?? "all"}`)
    .on("postgres_changes",
        { event: "*", schema: "public", table: "orders", filter },
        (payload) => onChange(payload.new as Order))
    .subscribe();
}
```

### B.3 Voce sidebar (template per `Orders`)

```ts
// src/components/layout/Sidebar/Sidebar.tsx — buildGroups()
{
  label: "Operatività",
  items: [
    { to: `${b}/orders`, label: "Ordini", icon: <ClipboardList size={18} /> },
    { to: `${b}/locations`, label: "Sedi", icon: <Building2 size={18} /> },
    { to: `${b}/scheduling`, label: "Programmazione", icon: <Calendar size={18} /> },
    // ...
  ]
}
```

### B.4 Migration template `tables`

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_orders_tables.sql
BEGIN;

CREATE TABLE public.tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  qr_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  seats INT NULL CHECK (seats > 0),
  zone TEXT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  deleted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (activity_id, label) DEFERRABLE INITIALLY IMMEDIATE
);

CREATE INDEX idx_tables_tenant_activity ON public.tables (tenant_id, activity_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tables_qr_token ON public.tables (qr_token) WHERE deleted_at IS NULL;

ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant select own rows" ON public.tables;
CREATE POLICY "Tenant select own rows" ON public.tables FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

DROP POLICY IF EXISTS "Tenant insert own rows" ON public.tables;
CREATE POLICY "Tenant insert own rows" ON public.tables FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

DROP POLICY IF EXISTS "Tenant update own rows" ON public.tables;
CREATE POLICY "Tenant update own rows" ON public.tables FOR UPDATE TO authenticated
  USING  (tenant_id IN (SELECT public.get_my_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

DROP POLICY IF EXISTS "Tenant delete own rows" ON public.tables;
CREATE POLICY "Tenant delete own rows" ON public.tables FOR DELETE TO authenticated
  USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

-- Anon access via SECURITY DEFINER RPC, NO direct anon SELECT policy
COMMENT ON TABLE public.tables IS
  'Tavoli fisici per ordini al tavolo. qr_token UUID = segreto leggero. Soft-delete via deleted_at.';

COMMIT;
```

---

_End of audit._
