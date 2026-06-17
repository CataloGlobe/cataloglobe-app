# CLAUDE.md — CataloGlobe

Regole vincolanti. In caso di dubbio: seguire il pattern esistente nel codice.

**Riferimenti**:
- Architettura completa: `docs/architecture.md`
- Regole estese: `docs/ai-operational-rules.md`
- Route: `docs/routes.md`
- Schema DB e fact critici: `docs/database-reference.md`
- Edge Functions + bug history: `docs/edge-functions.md`
- Scheduling (Programmazione): `docs/scheduling.md`
- Epic "Ordinazioni dal tavolo": `docs/orders-architecture.md` (v1.2) — state machine, RPC, optimistic locking, error code, roadmap 6 fasi. Dettaglio pattern: `docs/patterns/epic-ordering.md`
- Security Advisor stato: `docs/security-advisor-status.md`
- **Permissions Matrix** (v3, Track A completo): `docs/permissions-matrix.md` — 41 permessi, matrice ruolo×permesso, gating FE per pagina, readiness Fase 1
- Roadmap: `docs/roadmap.md`
- **Pattern dettagliati** (`docs/patterns/`): `delete-drawer.md`, `activity-detail.md`, `draft-unsaved-bar.md`, `public-page.md`, `style-editor.md`, `ui-components.md`, `storage-sql.md`, `epic-ordering.md`

---

## Quick start

```bash
npm install
npm run dev          # vite dev server
npm run build        # tsc -b && vite build
npm run lint         # eslint .
npm test             # vitest run
npm run test:watch   # vitest watch
```

---

## Stack tecnologico

- React 19 + TypeScript 5.9 (strict) + Vite 7
- React Router v7 — tutte le route in `src/App.tsx`
- Supabase JS v2 — client solo in `src/services/supabase/client.ts`
- Framer Motion v12 — animazioni
- SCSS Modules (`.module.scss`) — niente CSS inline
- Icons: Lucide React + `@tabler/icons-react`
- Charts: recharts | DnD: @dnd-kit | Testing: Vitest | Export Excel: xlsx-js-style

---

## Architettura

- **Service layer obbligatorio**: `Componente → src/services/supabase/<dominio>.ts → Supabase Client → PostgreSQL`. MAI chiamare Supabase da componenti React.
- **Un file service per dominio**. Firma: `list*(tenantId)`, `get*(id, tenantId)`, `create*(tenantId, data)`, `update*(id, tenantId, data)`, `delete*(id, tenantId)`.
- `list*` ritorna `T[]` (mai null). `get*` lancia errore se non trova. `delete*` ritorna `void`.
- **Errori**: controllare `error.code` — `PGRST116` (not found), `23503` (FK violation), `23505` (duplicate). Poi `throw error`.
- **Route**: tutte in `src/App.tsx`. Business routes sotto `/business/:businessId/`. `businessId` = source of truth per tenant. Lista completa in `docs/routes.md`.
- **Layout**: `MainLayout` (business), `WorkspaceLayout` (workspace), `SiteLayout` (pubblico). Non crearne di nuovi. Entrambi i layout admin (business + workspace) hanno `AppHeader` globale fisso in alto + sidebar a sinistra; il workspace usa `AppHeaderWorkspace` (logo + greeting "Ciao {firstName}" + notifiche + avatar, niente tenant pill).
- **Provider esistenti**: AuthProvider, TenantProvider, PermissionsProvider (solo dentro `/business/:businessId/*`), DrawerProvider, ToastProvider, ThemeProvider, TooltipProvider. Non crearne di nuovi senza necessità.

---

## Tenant Isolation

- `tenant_id` SOLO da `useTenantId()` o `useTenant().selectedTenantId`. **MAI** da `auth.user.id`.
- OGNI write al DB include `tenant_id`. Nessun dato cross-tenant (eccezione: `allergens`).
- RLS obbligatorio su ogni tabella tenant-scoped: `tenant_id = ANY(get_my_tenant_ids())`. Per scope activity-granulare usa `has_permission(permission_id, activity_id?)` — vedi `## Sistema permessi multi-sede`.

---

## Sistema permessi multi-sede

### Ruoli (5)

Modello post-Fase 2: scope tenant-wide vs activity-scoped.

- **owner**: `tenants.owner_user_id` (NESSUNA riga in `tenant_memberships`)
- **admin**: `tenant_memberships.role='admin'` (scope tenant-wide)
- **manager / staff / viewer**: `tenant_memberships.role=NULL` + righe in `tenant_membership_activities` con `role + activity_id` (scope activity)

### Backend permission system

- Tabella `role_permissions`: 41 permission seed, scope `tenant` o `activity`
- Helper SECURITY DEFINER:
  - `has_permission(p_permission_id text, p_activity_id uuid DEFAULT NULL) → boolean`
  - `has_permission_any_activity(p_permission_id text, p_tenant_id uuid) → boolean`
  - `get_my_activity_ids() → setof uuid`
  - `get_my_tenant_ids() → setof uuid`
- Pattern RLS: `USING (has_permission('<perm>.read', activity_id))` per tabelle activity-scoped
- **Self-mod guard server-side**: `change_member_role` e `remove_tenant_member` rifiutano con `42501` se `target_user_id = auth.uid()`
- **Owner synthetic row** in `get_tenant_members`: `membership_id` sentinel `'00000000-0000-0000-0000-000000000000'` (owner non ha tm post-Fase 5.B.2 cleanup)

### RPC pubbliche (frontend)

| RPC | Scope | Note |
|---|---|---|
| `get_my_permissions(uuid)` | tenant | 42501 se non membro. Returns role + activity_ids + permissions[] |
| `get_tenant_members(uuid)` | tenant | Requires `team.read`. Owner synthetic first |
| `invite_tenant_member` | tenant | Sig 4 args (tenant_id, email, role, activity_ids[]) |
| `change_member_role` | tenant | Sig 3 args (membership_id, new_role, activity_ids[]) + self-guard |
| `remove_tenant_member(uuid)` | tenant | Sig single arg + manager scope + tma cleanup |
| `get_invite_info_by_token(uuid)` | pre-auth | anon + authenticated |
| `get_my_pending_invites()` | user | Per InviteModal workspace |
| `has_permission(text, uuid?)` | inline | Usato in policy RLS |

### Frontend libraries

- **`src/lib/permissions.ts`** — `UserPermissions, UserRole, isOwner(perms), canDoOnTenant, canDoOnActivity, canDoOnAnyActivity, isOwnerOrAdmin, isTenantWide, canChangeRoleOf, canRemoveMember, canInviteRole, canEditSchedule`. **SOLO dentro `/business/:businessId/*`** (richiede `PermissionsProvider`).
- **`src/utils/workspaceRole.ts`** — `workspaceRoleIsOwner, workspaceRoleIsAdmin, workspaceRoleIsScoped`. **SOLO per workspace** (`/workspace/*`, `/select-business`). Literal compare su `tenant.user_role` da `get_user_tenants` view (no PermissionsProvider in scope).
- **`src/context/PermissionsContext.tsx`** — `usePermissions()` hook: `{ permissions, loading, refresh }`. Manual `refresh()` dopo cambio ruolo runtime (no realtime).

### Pattern UI

- **Locked state**: `EmptyState` + `Lock` icon (size 40, strokeWidth 1.5) usato in TeamPage / SubscriptionPage / BusinessSettingsPage per `!canDoOnTenant(perms, '<read>')`. Pre-check permission → if locked, return Locked block early.
- **Sidebar gating**: `NavItem.permission?: (perms) => boolean` filter per voce. Loading-optimistic: `permissions===null` mostra tutte le voci (transitorio). Gruppi vuoti nascosti.
- **Skip fetch pre-check**: se `!canRead<resource>` NON chiamare RPC (evita `42501` inutile). Esempio: `TeamPage` useEffect guard.
- **Self-modification frontend guard**: `canChangeRoleOf` / `canRemoveMember` accettano opzionale `callerUserId` → ritorna `false` se `target.userId === callerUserId`. Backend ha guard hardcoded (defense in depth).

---

## Drawer Pattern

TUTTE le operazioni CRUD usano drawer laterali destri. MAI modali centrate.

```
SystemDrawer → DrawerLayout (header/children/footer) → DomainForm (collegato via form="id")
```

- Submit button nel footer del DrawerLayout, collegato al form via attributo `form`.
- Form separato dal drawer. Props form: `formId`, `mode`, `entityData`, `tenantId`, `onSuccess`, `onSavingChange`.
- Post-success: `onSuccess()` → reload dati → chiudi drawer → toast.
- Dimensioni: sm=420px, md=520px (default), lg=720px.

**Delete drawer**: 3 pattern (A blocco preventivo / B informativo+cleanup / C swap-then-delete) scelti via FK inbound. Default sicuro = B. Dettaglio + anti-pattern: `docs/patterns/delete-drawer.md`.

---

## Page Pattern

State `items[] + isLoading`, `loadData` via `useCallback` + `useEffect`, drawer state (`isDrawerOpen + mode + selected`). `handleSuccess`: `await loadData() → close → toast`.

JSX: chiama `usePageHeader({ title, subtitle, actions? })` PRIMA di qualsiasi early return → contenuto pagina (`FilterBar` → `DataTable`) → `CreateEditDrawer` → `DeleteDrawer`. Il `PageHeader` è renderizzato dal `PageHeaderSlot` centralizzato in `MainLayout`/`WorkspaceLayout` via `PageHeaderContext`. Pattern valido per business + workspace.

---

## File Structure per Dominio

```
Dominio/
├── Dominio.tsx                 # Lista (state + drawer open/close)
├── DominioPage.tsx             # Dettaglio (se serve)
├── DominioCreateEditDrawer.tsx
├── DominioDeleteDrawer.tsx
└── components/
    └── DominioForm.tsx         # Form puro, nessuna logica drawer
```

---

## Pattern: draft inline + UnsavedChangesBar

Pattern per editing rapido. Sostituisce debounce manuale (`useRef<setTimeout>`) — **tech debt chiuso**, NON reintrodurre.

- State diviso `draft` + `saved` nel parent. `isDirty` deriva dal diff.
- Componenti figli **controlled** (`value` + `onChange`, no state interno).
- `<UnsavedChangesBar>` appare solo se `isDirty`. Annulla = `setDraft(saved)`. Salva = service call → reload.
- Toggle binari (`*_public`) restano save-immediato.

Esempi in produzione: `SchedaTab` (6 sezioni prodotto), `ActivitySettingsTab`. Dettaglio + accordion single-open: `docs/patterns/draft-unsaved-bar.md`.

---

## Pagine custom

- **Dettaglio sede** (`/business/:businessId/locations/:activityId`) — 3 tab via `?tab=` (profile/availability/settings). Dettaglio: `docs/patterns/activity-detail.md`.
- **Pagina pubblica** (`/:slug`) — flusso `resolve-public-catalog` → `CollectionView`. Container queries (`@container collection`, MAI `@media`). 4 combinazioni card prodotto (Card/Compatto × List/Grid). Slot featured: solo `before_catalog`/`after_catalog` (hero rimosso). Dettaglio: `docs/patterns/public-page.md`.
- **PublicSheet** — modali pagina pubblica. **Non usare** SystemDrawer/DrawerLayout nella pagina pubblica. iOS scroll-lock via `body.position:fixed` (scroll listener su window deve leggere `body.style.top` durante lock). Import: `@components/PublicCollectionView/PublicSheet/PublicSheet`. Dettaglio: `docs/patterns/public-page.md`.
- **Style Editor** (`/business/:businessId/styles/:styleId`) — preview/runtime devono restare sincronizzati via `parseTokens()`. Dettaglio: `docs/patterns/style-editor.md`.

---

## Scheduling (Programmazione)

Due `rule_type` su stesso modello `schedules`: `"catalog"` + `"featured"`. Resolver via **competizione** (1 sola regola vince per sede per tipo). Sistema bozze (`enabled=false` finché campi obbligatori mancanti). Periodo + giorni combinabili.

Dettaglio rule resolver, sistema bozze, simulatore, schema tabelle: `docs/scheduling.md`.

---

## Epic Ordinazioni dal tavolo

QR-table-ordering integrato nei cataloghi. Cliente scansiona QR → ordina → admin dashboard live.

Spec autoritativa: `docs/orders-architecture.md` v1.2. Dettaglio pattern (dual-auth, optimistic locking, error code, schema facts, service layer): `docs/patterns/epic-ordering.md`.

**Regole vincolanti**:
- **Dual-auth**: customer JWT custom firmato con `CUSTOMER_JWT_SECRET` (NON `SUPABASE_JWT_SECRET`) generato da `resolve-table`. Admin = Supabase auth user standard.
- **`customer_session_id` MAI decodificato dal JWT lato frontend**. Solo da response Edge Function `resolve-table` o re-read via `getCurrentCustomerSession`.
- **Optimistic locking obbligatorio** sulle transition admin (`acknowledge` / `deliver` / `cancel-admin`). `expected_version` sempre richiesto, 409 `OPTIMISTIC_LOCK_CONFLICT` da rispettare.
- **Edge Functions customer-only** (`submit-order`, `cancel-order`, `get-orders-for-session`) NON callable da contesto admin (richiedono customer JWT custom).
- `orders.version` increment **applicativo** (no trigger DB).

Service layer in `src/services/supabase/`: `tables.ts`, `tableZones.ts` (4 funzioni + `getZoneTableCounts` per drawer "Gestisci zone"), `customerSessions.ts`, `productAvailability.ts`, `orders.ts`. Tipi in `src/types/orders.ts`.

UI shared CRUD tavoli in `src/components/Tables/`:
- `TablesManagement/` — componente shared per CRUD tavoli + stato live. Usato dalla tab "Tavoli" di `ActivityDetailPage` (unico call site post Step 6). Header con bottoni "Gestisci zone" + "Nuovo tavolo" renderizzato inline, sempre. `TablesEmptyState` sub-componente per prerequisito `ordering_enabled=false`.
- `ZoneSelectField/` — dropdown zone nel form Crea/Modifica tavolo con expand inline "+ Crea nuova zona" (mini-form). Niente modali nested.
- `TableZoneManagementDrawer/` — drawer dedicato per CRUD zone (md=520px). Rename inline, delete con conferma + count tavoli orfanati, callback `onZonesChanged` notifica parent.
- `TablesLiveView/` — vista operativa live tavoli (card per zona, read-only) usata in tab "Tavoli" di pagina Ordini. Realtime via hook `useTablesLiveRealtime` (Step 4c): 1 canale con 3 binding `postgres_changes` su `orders + order_groups + customer_sessions` filter `activity_id=eq.<id>`, refetch debounced 250ms di `listTablesWithState`, reconnect-resilience via refetch su `SUBSCRIBED`. Niente polling. Card cliccabili via prop opzionale `onTableClick`. Filtri Tutti/Aperti/Liberi/Manutenzione, raggruppamento per `zone_name` (no-zone fallback ultimo).
- `TableDetailDrawer/` — drawer admin read-only (Step 4c) per dettaglio tavolo. Pattern `SystemDrawer + DrawerLayout` (footer solo "Chiudi", nessuna azione operativa). Mostra: stato (Libero/Occupato/Manutenzione + seats), sessioni attive (customer_name + tempo trascorso `now - first_seen_at` calcolato all'apertura — snapshot statico, no ticking timer), open `order_group`, ordini attivi (submitted/acknowledged/ready) + ordini serviti del tavolo. Service helper `getOpenOrderGroupForTable(tenantId, tableId)` in `customerSessions.ts` (filtro tenant+table esplicito oltre RLS).

UI riusabili in `src/components/ui/`:
- `ActivitySelectorCombobox/` — combobox sede con search input + dropdown lista con dot stato (verde active+ordering, ambra active+!ordering, grigio inactive). Persistenza selezione via `storageKey` localStorage opzionale. Default: prima sede alfabetica. Sempre visibile anche con 1 sola sede.

Pagina Ordini (`src/pages/Dashboard/Orders/`):
- 3 tab principali: Comande (logica esistente, 5 sub-tab filtro stato) / Tavoli (`<TablesLiveView>`) / Storico (delivered + cancelled della giornata operativa, con azione Ripristina sui delivered — Step 5b).
- `OrdersKpiBar.tsx` — 4 KPI condivisi (Tavoli aperti, Comande oggi, Tempo medio, Servite oggi). Visibile in Comande + Tavoli, nascosto in Storico.
- Selettore sede `<ActivitySelectorCombobox>` in header actions, persistenza `cataloglobe:orders:lastActivityId`.
- Auto-refresh 30s opzionale via checkbox: ricarica ordini + tabelle + tabellestate + KPI in batch.
- Service helper `orders.ts:getOrdersCountToday` / `getOrdersServedToday` / `listOrdersHistoryToday` — boundary "giornata operativa" calcolata server-side via RPC `get_operative_day_start()` (migration `20260601150000`). Formula `date_trunc('day', now() AT TIME ZONE 'Europe/Rome') AT TIME ZONE 'Europe/Rome'` — DST-aware, no off-by-1h ai cambi stagionali (29/3 + 25/10). Funzione `SECURITY INVOKER`, `SET search_path TO ''`, GRANT solo `authenticated`. `listOrdersHistoryToday` (Step 5b): `.eq('tenant_id') + .eq('activity_id')` esplicito (defense in depth oltre RLS) + `.or(and(status.eq.delivered,delivered_at.gte.X),and(status.eq.cancelled,cancelled_at.gte.X))` per la disgiunzione del filtro temporale; sort `updated_at DESC` (coincide con `delivered_at`/`cancelled_at` come exit-timestamp; rectify-order non muta il parent). TODO multi-region: parametrizzare il timezone via `activities.iana_timezone` quando arriveranno tenant non-IT.

---

## Database

- Schema changes: SEMPRE nuova migration (`supabase/migrations/YYYYMMDDHHMMSS_*.sql`). MAI modificare esistenti.
- **Query nei service**: nomi SENZA prefisso (`products`, mai `v2_products`). Tipi TS: prefisso `V2`.
- Nuove tabelle: `tenant_id UUID NOT NULL`, RLS abilitato, 4 policy (select/insert/update/delete).
- FK: `entita_id`. Self-ref: `parent_entita_id`. Colonne: `snake_case`. Tabelle: plurale.
- Schema attuale + fact critici (slug uniqueness, Stripe-on-tenants, schedule_targets RLS, ecc.) → `docs/database-reference.md`.
- **`table_zones`** (migration `20260531150043`): entita' zone tavoli, UNIQUE `(activity_id, name)`. FK `tables.zone_id ON DELETE SET NULL`. RLS via `has_permission('tables.read'|'tables.manage', activity_id)`. View `v_tables_with_state` espone `zone_name` via LEFT JOIN. Campo `tables.zone` text DROPPED nella stessa migration. Frontend admin legge `zone_name` dal JOIN; payload Edge customer mantiene alias `zone: string | null` per backward-compat localStorage.
- **`orders.status` + `orders.ready_at`** (migration `20260531180000`): constraint `orders_status_check` accetta 5 valori — `'submitted','acknowledged','ready','delivered','cancelled'`. Colonna `ready_at timestamptz NULL` write-once popolata al transition `acknowledged → ready` (Edge `mark-order-ready`, Step 4a). Index partial `idx_orders_active` esteso a `('submitted','acknowledged','ready')` con migration `20260601100000`.
- **Sistema permessi multi-sede** (vedi `## Sistema permessi multi-sede` sopra): tabelle `tenant_memberships` (role NULL|'admin' post Fase 5.B.2), `tenant_membership_activities (tenant_membership_id, activity_id, tenant_id, role IN manager|staff|viewer)`, `permissions (id, scope)`, `role_permissions (role, permission_id)`. Helper SECURITY DEFINER: `has_permission`, `has_permission_any_activity`, `get_my_activity_ids`, `get_my_tenant_ids`.
- Dati legali aziendali: `src/config/company.ts` ↔ `supabase/functions/_shared/company-config.ts` sono **duplicazione sincronizzata** (header `// ⚠️ SYNC`). Modifica entrambi nello stesso commit. Stesso pattern di `scheduleResolver.ts`.
- **Migration con `CREATE FUNCTION` + REVOKE/GRANT**: `supabase db push` fallisce con `SQLSTATE 42601`. Workaround: applicare via Studio SQL Editor + registrare in `supabase_migrations.schema_migrations`, oppure splittare in 2 file consecutivi. Dettaglio: `docs/patterns/storage-sql.md`.

---

## Pattern obbligatori — storage, SQL, Stripe

Dettaglio completo + esempi SQL: `docs/patterns/storage-sql.md`.

### Storage policy `storage.objects`
- Naming: `<bucket-id> <operation>` lowercase. `TO authenticated` (no public listing).
- UPDATE policy: SEMPRE `USING (...) WITH CHECK (...)` con espressione identica.
- Sempre `DROP POLICY IF EXISTS` (idempotenza cross-env).
- Upsert (`{ upsert: true }`) richiede 3 policy: INSERT + UPDATE (with CHECK) + SELECT `TO authenticated`. Senza tutte e 3 → HTTP 400 messaggio fuorviante.

### Funzioni SQL
- `SECURITY DEFINER` solo se necessario. Default: `SECURITY INVOKER`.
- `SET search_path TO ''` obbligatorio + qualifiche `public.<table>` esplicite.
- `REVOKE EXECUTE ... FROM PUBLIC` dopo `CREATE FUNCTION`.
- `SECURITY DEFINER` non destinata a `anon`/`authenticated`: `REVOKE FROM PUBLIC` NON basta — Supabase pre-configura grant default a `anon, authenticated, service_role`. Pattern: REVOKE espliciti da `PUBLIC + anon + authenticated`, GRANT solo a `service_role`. Verifica post-deploy con query `pg_proc + has_function_privilege`.
- **`RETURNS TABLE` alias collision**: le colonne OUT della `RETURNS TABLE` sono in scope nel body plpgsql come variabili. `SELECT/EXISTS` su tabella con colonna stesso nome senza qualificazione → `column reference "X" is ambiguous`. Pattern: qualifica SEMPRE le colonne con alias tabella (`tm.role`, `t.id`); per CTE con alias output identici alle cols `RETURNS TABLE`, prefisso `r_*` (vedi `20260530190000_fix_get_tenant_members_ambiguous.sql`). Incappato 2 volte (Fase 4 + Fase 5.B.2).

### Stripe lifecycle
Usare sempre `_shared/stripe-helpers.ts`. Pattern: `scheduleStripeCancel()` soft-delete → `reactivateStripeSubIfScheduled()` recovery → `cancelStripeSubImmediate()` + `deleteStripeCustomer()` hard-delete. Tutti idempotenti e non-throwing. NON chiamare `stripe.subscriptions.cancel()` direttamente in soft-delete.

---

## Edge Functions

Tutte in `supabase/functions/<nome>/index.ts`. Shared code in `_shared/`. `verify_jwt: false` su tutte.

**`scheduleResolver.ts` esiste in DUE posti**: `src/services/supabase/` e `supabase/functions/_shared/`. Sincronizzarli ENTRAMBI ad ogni modifica.

Catalogo completo, bug history (`purgeTenantData` ordine FK, `purgeActivityFolder` ricorsivo, `config.toml` entry obbligatoria, slash `/` nei commenti Deno) + 11 Edge Functions epic ordering → `docs/edge-functions.md`.

**`resolve-table` + `get-orders-for-session`**: post-migration `table_zones` (γ-lite), entrambe fanno JOIN `tables → table_zones` e mappano `zone_data.name → zone` (alias backward-compat) nel payload customer. Customer storage (`localStorage tableZone`) + `ResolveTableResult.table.zone` invariati. Refactor effettuato nella stessa migration di `table_zones` per evitare runtime errors (SELECT su colonna droppata).

**Admin order transitions** (5 endpoint, tutti wrapper di `_shared/adminOrderTransition.ts`):
- `acknowledge-order`: `submitted → acknowledged` (popola `acknowledged_at`)
- `mark-order-ready`: `acknowledged → ready` (popola `ready_at`) — Step 4a
- `deliver-order`: `acknowledged|ready → delivered` (popola `delivered_at`) — Step 4a estende il source set: ora accetta entrambi cosi i workflow che saltano lo step "ready" continuano a funzionare
- `cancel-order-admin`: `submitted|acknowledged → cancelled` (popola `cancelled_at`, `cancelled_by='admin'`, `cancellation_reason`)
- `restore-order`: `delivered → acknowledged` (azzera `delivered_at` + `ready_at` via `clear_fields`, nessun timestamp dedicato di ripristino) — Step 5a, usato dallo Storico per recuperare i "Servito" accidentali. NB: ordini `cancelled` NON sono ripristinabili (terminale per design).
Tutte: optimistic locking via `expected_version`, error mapping unificato (409 `OPTIMISTIC_LOCK_CONFLICT` vs wrong-state via `details.reason`), rate limit 30/min per `(user, order)` con namespace per `function_name`. Service mirror in `src/services/supabase/orders.ts`: `acknowledgeOrder`, `markOrderReady`, `deliverOrder`, `cancelOrderAdmin`, `restoreOrder` — tutte ritornano `throwMappedTransitionError(parseInvokeError(err))` sui 4xx/5xx.

**Helper `_shared/adminOrderTransition.ts` — estensione Step 5a**: `TransitionConfig.timestamp_field` ora `?: string | null` (opzionale: passare `null` quando la transition non ha colonna timestamp dedicata, come `restore-order`). Nuovo `TransitionConfig.clear_fields?: string[]` — colonne SET = NULL al success (es. `restore-order` clears `delivered_at` + `ready_at`). `updated_at` settato SEMPRE indipendentemente da `timestamp_field`. Backward-compat: i 4 wrapper esistenti passano una stringa → invariati.

**Realtime su `orders`** (Step 4b): tabella `orders` in publication `supabase_realtime` (insieme a `customer_sessions`, `order_groups`, `notifications`). RLS SELECT su `orders` filtra automaticamente i `postgres_changes` per il subscriber autenticato:
- Customer JWT custom: policy `customer_session_id = get_jwt_customer_session_id()`
- Admin user JWT: policy `has_permission('orders.read', activity_id)`

Nessun leak cross-tenant: il server realtime non emette eventi per righe non visibili via RLS SELECT del subscriber.

Hook admin: `src/pages/Dashboard/Orders/hooks/useActiveOrdersRealtime.ts`. Subscribe con filter `activity_id=eq.<id>` (volume reduction; RLS è la security boundary). Pattern: initial fetch via REST (`listOrdersForActivity` con status `['submitted','acknowledged','ready']`) + subscribe `postgres_changes` event=`*`. UPDATE applica patch con **version-max gate** (`new.version > local.version`) — scarta echi della propria azione e update stale. Se nuovo status non-attivo (`delivered`/`cancelled`) → drop dalla board + callback `onOrderLeftBoard` (parent refresha KPI). INSERT triggera silent refetch (postgres_changes NON delivera `items[]`). Re-SUBSCRIBED → refetch (colma eventi persi durante disconnect, wifi sala flaky). Cleanup canale on unmount/activityId-change.

Hook customer: `subscribeToSessionOrders` (in `orders.ts`), già pre-Step 4b. RLS via JWT custom `customer_session_id`. Pattern singleton `supabase.realtime.setAuth(jwt)` (no riconnessione WS, swap auth contesto).

Kanban admin "Comande" (`src/pages/Dashboard/Orders/OrdersKanban.tsx`): 3 colonne (Nuove / In lavorazione / Pronte) basate su status. Card actions per colonna:
- submitted: primary "Conferma" + secondary "Cancella"
- acknowledged: primary "Pronto" + secondary "Servito direttamente" (skip-ready workflow) + "Cancella"
- ready: primary "Servito" + secondary "Cancella"

Transition: bottone loading durante invoke (NO optimistic-move). Post-success: `applyLocalPatch(response)` con `(status, version, timestamp)` — realtime echo deduplicato dal version-max. Errori discriminati: `OPTIMISTIC_LOCK_CONFLICT` → toast warning + refetch silenzioso. `INVALID_STATE_TRANSITION` → toast error con `details.current_status` + refetch.

Customer stepper (`OrderStatusStepper.tsx`): 4 step (Inviato → In cucina → Pronto → Consegnato). Stato `ready` mostra step "Pronto" come `active` (icona `BellRing`).

---

## Integrazioni

- **Supabase client**: solo `src/services/supabase/client.ts`. Mai `service_role` nel frontend.
- **Email**: solo via Edge Functions (Resend), mai dal frontend.
- **Upload**: `src/services/supabase/upload.ts` + `src/utils/compressImage.ts`. Per upsert vedi `docs/patterns/storage-sql.md`.
- **Stripe**: sottoscrizione tenant, seat management, webhook. Service: `src/services/supabase/billing.ts`.
- **Google Places**: Edge Function `search-google-places` + `GooglePlacesSearch` component in `src/pages/Operativita/Attivita/tabs/contacts/`.
- **Export Excel Analitiche**: `src/pages/Dashboard/Analytics/utils/exportXlsx.ts` costruisce il workbook via `xlsx-js-style` (fork di SheetJS con cell styling; `xlsx` resta come dep separata, NON rimossa). Engine "un foglio = più tabelle impilate": 4 fogli (Copertina · Engagement · Ordini · Prenotazioni), stile per-cella. Header letto a runtime da `--brand-primary` (`_theme.scss`) → **theme-aware**: violetto in light, blu in dark (scelta voluta — l'xlsx segue il tema attivo). Dati presi dallo state della pagina (no re-fetch). Valuta/percentuali/durate scritte come **numeri + numFmt** (mai stringhe pre-formattate come valore di cella).

---

## UI

- Componenti in `src/components/ui/` — verificare PRIMA di crearne di nuovi. Catalogo dettagliato: `docs/patterns/ui-components.md` (`AddressAutocomplete`, `FeesSection`, `StatusBadge`, `UnsavedChangesBar`, `EmptyState`, `TranslationsTab`).
- Lingua: **italiano** ovunque. Tenant→"Azienda", Activity→"Sede", `owner_user_id`→mai in UI.
- **Stato attività**: UI usa sempre "**Pubblicata**" / "**Sospesa**" (mai "Attiva"/"Inattiva"). DB values restano `status: "active" | "inactive"`. Motivi sospensione mappati centralmente in `src/utils/activityStatus.ts` (`formatInactiveReason` + `INACTIVE_REASON_LABEL`).
- SCSS Modules (`.module.scss`). Tema: `src/styles/_theme.scss`.
- Import alias: `@components/`, `@services/`, `@context/`, `@types/`, `@utils/`, `@pages/`, `@layouts/`, `@styles/`. Mai `../../`.
- Toast: `useToast().showToast({ message, type })`.
- **Tooltip vs InfoTooltip**: regole d'uso in `memory/feedback_tooltip_guidelines.md`.
- **Gating permission**: scope business → `usePermissions()` + helper `src/lib/permissions.ts` (canDoOnTenant, canDoOnActivity, ecc.). Scope workspace → `src/utils/workspaceRole.ts` (literal compare). Pattern Locked state via `EmptyState + Lock` icon per pagine intere (TeamPage / SubscriptionPage / BusinessSettingsPage). Sidebar gating per voce via `NavItem.permission`. Vedi `## Sistema permessi multi-sede`.

---

## Aree in sviluppo / da completare

Tech-debt e refactor differiti. Non bloccanti per il task corrente; da valutare durante refactor mirati o cicli di consolidamento.

- **DropdownMenu custom vs TableRowActions** — coesistono due implementazioni di menu a tendina. `TableRowActions` (Radix-based) usato in 22 DataTable kebab. `DropdownMenu` custom (`src/components/ui/DropdownMenu/`, scritto a mano con framer-motion + useState/useRef/createPortal) usato in 4 call site non-tabella: `HeaderUserMenu`, `HeaderNotifications`, `ActivitySettingsTab`, `Programming.tsx` (bulk action). Refactor proposto: migrare i 4 call site a Radix DropdownMenu (stessa libreria di TableRowActions) ed eliminare `DropdownMenu` custom. Non urgente — funziona oggi. Vantaggio: una sola libreria menu, codice meno custom, manutenzione singola.
- **`leave_tenant` RPC rewrite** — vecchia firma `(p_tenant_id)`, no manager scope, no allineamento a `remove_tenant_member` v2. Low priority.
- **Realtime sync su `tenant_memberships`** — cambio ruolo runtime richiede refresh manuale (`usePermissions().refresh()`). Eventuale switch a Supabase Realtime channel per propagation automatica.
- **Sidebar loading-optimistic** — oggi `permissions===null` mostra tutte le voci (transitorio). Visivo flash su utenti scoped. Alternativa: skeleton durante load.
- **Permission `translations.read` dedicato** — mancante. Sidebar voce "Lingue" usa `catalogs.read` proxy. Creare permission dedicato se gating più fine.
- **Bulk cancel pending invites senza ConfirmDialog** — asimmetria vs bulk remove members (che ora ha confirm intermedio). Aggiungere ConfirmDialog per coerenza UX.
- **Storico admin — ripristino ordini annullati (caso A)** — Step 5b ha consegnato lo Storico (delivered + cancelled del giorno operativo) con azione "Ripristina" SOLO sui delivered (`restore-order`). Gli ordini `cancelled` restano terminali per design (no UI restore). Caso A futuro: recupero annullati richiederebbe una nuova edge function `restore-cancelled-order` (transition `cancelled → submitted` o `cancelled → acknowledged` con reset di `cancelled_at`/`cancelled_by`/`cancellation_reason` via `clear_fields`), source policy da concordare (es. solo entro N minuti dalla cancellazione).

---

## Plugin & MCP — regole d'uso

Le regole prevalgono sui descriptor dei plugin in caso di conflitto.

### Plugin disabilitati (non invocare)

- `vercel` — stack è Vite, non Next.js.
- `playground` — nessun caso d'uso.
- `ralph-loop` — nessun task ricorrente.
- `feature-dev` (agent suite + slash) — sostituito da `superpowers` per task complessi e da `TodoWrite` per task semplici.
- `feature-dev:code-reviewer` — sostituito dal flusso review descritto sotto.
- `caveman-commit` — sostituito da `commit-commands`.
- `typescript-lsp` — sostituito da `mcp__ide__getDiagnostics`.
- `github` plugin — già disabilitato. Per operazioni GitHub usare `gh` CLI via Bash.

### Code review

- **Feature multi-file, refactor architetturale, area security-sensitive (RLS, edge functions, billing)** → workflow `superpowers` completo. Review integrata via `superpowers:requesting-code-review`.
- **Task tattico singolo** → niente `superpowers`. Se review necessaria, `code-review` slash standalone.
- **Quick scan PR pre-merge** → `caveman-review`.

### Planning

- Default: `TodoWrite` inline.
- `superpowers:writing-plans` SOLO dentro un workflow `superpowers` già attivo.
- MAI invocare `feature-dev` agent: disabilitato.

### Workflow superpowers — quando attivarlo

Utile per task multi-step complessi, dannoso per task tattici (overhead di planning).

**Skip brainstorm/write-plan se il prompt utente è già strutturato** (≥2 marker: file espliciti con path, vincolo "NON leggere altro", obiettivo single-concern dichiarato, vincoli "non toccare X"). In quel caso esecuzione diretta. TDD e review-tra-task restano attive.

### Commit

- Standard: `commit-commands` (`/commit`, `/commit-push-pr`).
- Format: Conventional Commits.
- `/clean_gone` — VIETATO senza conferma esplicita umana per ogni branch eliminato.

#### Anti-drift WIP (obbligatorio prima di ogni commit)

Prima di ogni `git add` Claude Code DEVE eseguire e mostrare all'utente l'output di:

```bash
git diff --stat
git status --short
```

E identificare esplicitamente:
- File modified appartenenti al task corrente (vanno staged)
- File modified appartenenti ad altre chat parallele (NON vanno staged)
- File untracked nuovi: nostri (vanno staged) vs altri (lasciati)

Pattern di drift ricorrente: file modificati durante una task (es. `src/types/orders.ts`, `customerSessions.ts`) ma dimenticati nel `git add` perche il focus era su altri file. Risultato: build CI fallisce su file che importano export che il repo Git non ha ancora, recovery commit a cascata.

REGOLE:
1. `git add` SEMPRE esplicito file-by-file. MAI `git add -A`, MAI `git add .`.
2. Per file con modifiche interleavate (nostre + altre chat nello stesso file), valutare `git add -p` per stage selettivo. Se non separabili (es. nuovo blocco di codice nostro che dipende da modifiche dell'altra chat), committare l'intero blocco coerente con messaggio descrittivo.
3. Dopo OGNI commit di feature epic ricca di file, eseguire verifica: `git ls-files | grep <feature_keyword>` per confermare che tutti i file referenziati dal commit siano nel repo.
4. Pre-go-live di un epic: eseguire `npm run build` LOCALE su working tree pulito (solo file dell'epic stessa) per simulare ambiente CI. Se fallisce localmente → fallira su Vercel.

### Compressione output (caveman)

`caveman` full mode attivo per default ad ogni session start. Disattivare: "stop caveman" o `/caveman lite`. Riattivare: `/caveman full`. Per output user-facing (commit message lunghi, descrizioni PR, summary) → prosa normale.

### MCP — Supabase

L'MCP `supabase-staging` espone `apply_migration` e `execute_sql`. Bypassano filesystem migrations.

**Regola** per ogni schema change DDL: (1) creare file `supabase/migrations/YYYYMMDDHHMMSS_*.sql`, (2) conferma esplicita utente, (3) solo dopo invocare `apply_migration`. Letture MCP (`list_tables`, `list_migrations`, `get_advisors`, `get_logs`, `generate_typescript_types`) non richiedono conferma.

### MCP — context7

Per query su librerie/SDK del progetto (React 19, Vite 7, Framer Motion v12, Supabase JS v2, Stripe SDK, recharts, @dnd-kit), preferire `context7` alla knowledge memorizzata.

### MCP — playwright

Obbligatorio per modifiche a: `src/components/PublicCollectionView/`, `src/pages/Stili/StyleEditor/`, `scheduleResolver.ts` / `schedulingNow.ts`.

### Slash commands matched-with-rules

- `/security-review` — invocare prima del merge per modifiche RLS, edge functions, auth, billing.
- `/revise-claude-md` — invocare a fine sessione SOLO se l'utente lo richiede esplicitamente.

### File curati manualmente — protezione

NON modificare automaticamente: `CLAUDE.md` (root + `docs/`), `MEMORY.md`, file in `memory/`. `caveman:compress` su questi file VIETATO senza conferma esplicita umana (lettura del compress + backup `.original.md` + sovrascrittura).

---

## PROIBITO

**Sicurezza**: modificare migration esistenti | rimuovere RLS | `service_role` nel frontend | bypassare tenant validation | referenziare `v2_activity_schedules` (ELIMINATA)

**Architettura**: Supabase diretto da componenti | `tenant_id` da `auth.user.id` | nuovi provider context | modali centrate per CRUD | router fuori da App.tsx | top navbar | `any` in TypeScript | `customer_session_id` decodificato dal JWT lato frontend

**Database**: prefisso `v2_` nelle query service | tabelle senza `tenant_id` | `CASCADE` cross-dominio senza richiesta | modificare `get_my_tenant_ids()` | `DROP POLICY` senza `IF EXISTS` | bypassare optimistic locking nelle transition admin (`expected_version` sempre richiesto)

**Frontend**: CSS inline | testi in inglese | esporre `owner_user_id` | librerie npm non richieste | submit button dentro `<form>` nei drawer | SystemDrawer/DrawerLayout nella pagina pubblica (usare PublicSheet) | label "Attiva"/"Inattiva" per stato sede (usa "Pubblicata"/"Sospesa" via `StatusBadge`) | rimuovere `position: relative` su `.wrapper` o `top: 0; left: 0` su `.input` in `Switch.module.scss` (bug fix bceb822) | bypassare `formatInactiveReason` | reintrodurre debounce manuale (`useRef<setTimeout>`) per save multi-select (usare draft + `UnsavedChangesBar`) | chiamare Edge Functions customer-only da contesto admin

**Scheduling**: `end_at` come mezzanotte UTC (usare `T23:59:59` locale) | disabilitare giorni della settimana se periodo attivo (sono combinabili) | slot `hero` nei featured (rimosso)

**Pattern**: `null` da `list*` | `useEffect` senza `useCallback` | omettere toast nei catch | no reload dopo CRUD success | form con logica drawer | modificare scheduleResolver in un solo posto

**Permessi**: usare `userRole` da `TenantContext` per gating (NULL per manager/staff/viewer) | usare API legacy (`Role` enum, `canManage`, `isOwner(string)`, `isAdmin`, `isMember` — eliminate Fase 5.C.C) | bypassare i gating frontend (`canChangeRoleOf`, `canRemoveMember`, `canInviteRole`) chiamando direttamente la RPC senza pre-check | montare `PermissionsProvider` fuori da `/business/:businessId/*` | usare `usePermissions()` in componenti workspace (`/workspace/*`, `/select-business`) — usa `workspaceRole` helpers | INSERT manuale `tenant_memberships.role='owner'` (constraint post-Fase 5.B.2 ammette solo NULL\|'admin')

**Plugin & MCP**: invocare plugin disabilitati | DDL via Supabase MCP senza file migration creato prima | `/clean_gone` senza conferma esplicita per branch | `caveman:compress` su CLAUDE.md/MEMORY.md senza conferma | `superpowers` brainstorm/write-plan quando il prompt è già strutturato | knowledge memorizzata su versioni libreria invece di `context7`
