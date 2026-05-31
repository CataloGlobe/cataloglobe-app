# Audit — Redesign pagine Ordini / Tavoli / Sedi

Data: 2026-05-30
Scope: fondazione tavoli + pagina Sede attuale, in preparazione redesign Ordini/Tavoli/Sedi.
Modalità: SOLO lettura (DB via Supabase MCP, codice via filesystem). Nessuna modifica.

---

## 0. Decisioni date come input (NON discusse)

1. Zone tavoli = entità separata (γ-lite): nuova tabella `table_zones`, FK `tables.zone_id`. UI minimal inline.
2. Tab "Tavoli" in pagina Sede sempre visibile, con prerequisito quando `activities.ordering_enabled = false`.
3. Storico → "Ripristina" disponibile solo per ordini con stato finale entro inizio giornata operativa corrente.
4. Selettore sede combobox in cima a pagina Ordini, sempre visibile anche con 1 sede.

---

## 1. Schema DB attuale

### 1.1 Tabella `tables`

| Colonna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `tenant_id` | uuid | NO | — |
| `activity_id` | uuid | NO | — |
| `label` | text | NO | — |
| `qr_token` | uuid | NO | `gen_random_uuid()` |
| `seats` | smallint | YES | — |
| `zone` | text | YES | — (stringa libera) |
| `maintenance_mode` | boolean | NO | false |
| `deleted_at` | timestamptz | YES | — (soft delete) |
| `created_at` | timestamptz | NO | `now()` |
| `updated_at` | timestamptz | NO | `now()` |

Cardinalità staging snapshot 2026-05-30: 6 tavoli attivi, 2 stringhe `zone` distinte (migration γ-lite low-risk).

### 1.2 RLS `tables` (4 policy, role authenticated)

| Cmd | Policy | Check |
|---|---|---|
| SELECT | Roles can read tables | `has_permission('tables.read', activity_id)` |
| INSERT | Roles can insert tables | `WITH CHECK has_permission('tables.manage', activity_id)` |
| UPDATE | Roles can update tables | USING + WITH CHECK `has_permission('tables.manage', activity_id)` |
| DELETE | Roles can delete tables | `has_permission('tables.manage', activity_id)` |

Permessi `tables.read` / `tables.manage` derivano da epic multi-sede permessi (chat parallela in corso).

### 1.3 Tabella `activities` (campi rilevanti)

- `ordering_enabled boolean` (NOT NULL, default false probabile) — toggle epic ordering
- Altri campi non-tavolo/non-ordering fuori scope audit.

### 1.4 Tabella `orders`

Campi chiave: `id, tenant_id, activity_id, table_id, customer_session_id, order_group_id, parent_order_id, is_rectification, status, version, submitted_at, acknowledged_at, delivered_at, cancelled_at, cancellation_reason, total_amount, currency, ...`.

**⚠️ Non esiste `served_at`**. Decisione 3 ("cutoff fine giornata operativa") deve mappare a `delivered_at` (status = `delivered`) o `cancelled_at` (status = `cancelled`). Da chiarire in spec prima di implementare.

`status text NOT NULL` con valori validi (da TS `OrderStatus`): `"submitted" | "acknowledged" | "delivered" | "cancelled"`.

Optimistic locking via `version integer` (incrementato applicativamente, no trigger DB).

### 1.5 Tabella `order_groups`

`id, tenant_id, activity_id, table_id, status, closed_at, created_at, updated_at`. Status valori da TS `OrderGroupStatus = "open" | "closed"`.

### 1.6 Tabella `customer_sessions`

Include `bill_requested_at timestamptz NULL` (richiesta conto). 2 policy SELECT per anon (customer JWT) + admin (`has_permission('tables.read', activity_id)`).

### 1.7 RLS `orders` + `order_groups`

Stesso pattern (admin authenticated, 4 cmd), permessi `orders.read` / `orders.manage`. `orders` ha policy aggiuntiva anon `customer_session_id = get_jwt_customer_session_id()` per fetch customer.

### 1.8 View `v_tables_with_state`

Pre-aggregata, usata da `listTablesWithState`. Computa per tavolo (deleted_at IS NULL):

- `active_sessions_count` (cs.expires_at > now)
- `pending_orders_count` (status IN submitted, acknowledged)
- `open_groups_count` (og.status = open)
- `current_total` (sum delivered/acknowledged/submitted - sum rettifiche, exclude cancelled via JOIN `o.cancelled_at IS NULL`)
- `bill_requested_count` (sessioni attive con bill_requested_at NOT NULL)

LEFT JOIN su `customer_sessions`, `orders` (filter cancelled_at IS NULL), `order_groups`. GROUP BY t.id.

### 1.9 RPC SECURITY DEFINER su tables

Nessuna trovata in `supabase/migrations/`. CRUD diretto via Supabase client + RLS. Sicurezza interamente RLS-based via `has_permission()`.

Edge Functions ordering-correlate: `resolve-table`, `submit-order`, `cancel-order`, `cancel-order-admin`, `generate-table-qrs`.

---

## 2. Service layer attuale

### 2.1 `src/services/supabase/tables.ts` (10 funzioni)

- `listTables(tenantId, activityId)` — base list, ordered by label
- `listTablesWithState(tenantId, activityId)` — via view `v_tables_with_state`
- `clearBillRequest(sessionId, tenantId)`
- `listBillRequestsForTable(tableId, tenantId)`
- `getTable(id, tenantId)` — throw `TABLE_NOT_FOUND`
- `createTable(tenantId, {activity_id, label, seats?, zone?, maintenance_mode?})` — throw `TABLE_LABEL_CONFLICT`
- `updateTable(id, tenantId, updates: V2TableUpdate)`
- `deleteTable(id, tenantId)` — soft delete (`deleted_at = now()`)
- `regenerateTableQrToken(id, tenantId)` — UPDATE diretto (client-side, no RPC)
- `generateTableQrsPdf(activityId, tableIds?)` — invoke Edge `generate-table-qrs`

### 2.2 `src/services/supabase/orders.ts` (10 funzioni)

Customer-side: `submitOrder`, `getOrdersForSession`, `cancelOrderCustomer`.
Admin-side: `listOrdersForActivity(tenantId, activityId, options: {status?, tableId?, dateFrom?, dateTo?, limit?})`, `acknowledgeOrder`, `deliverOrder`, `cancelOrderAdmin`, `rectifyOrder` (tutti con `expectedVersion`).
Realtime: `subscribeToSessionOrders(customerJwt, callbacks)` — SOLO customer (channel `session-orders-{ts}`). **Niente realtime admin oggi.**

### 2.3 Tipi TypeScript — `src/types/orders.ts`

- `V2Table` (full row), `V2TableInsert` (escl. qr_token), `V2TableUpdate` (label, seats, zone, maintenance_mode)
- `V2Order`, `V2OrderWithItems`, `V2OrderItem`, `OrderStatus`, `OrderGroupStatus`
- Tipi maintenance mode (committati 7266bfb): `OrderingStateReason`, `ResolveTableOrderingUnavailable`, `ResolveTableOrderingUnavailableError`

---

## 3. UI esistente CRUD tavoli

### 3.1 Dove vive oggi: `src/pages/Dashboard/Tables/Tables.tsx`

**NON in pagina Sede.** È una pagina Dashboard standalone. Decisione 2 richiede di portarla come tab `Tavoli` dentro `ActivityDetailPage`.

### 3.2 Pattern attuale

- Filter `StatusFilter = "all" | "free" | "occupied" | "maintenance"` (line 40)
- Create/Edit drawer `SystemDrawer` (line 659), state `isDrawerOpen` (64), `formMaintenanceMode` (69)
- Trigger create (186) — open drawer + reset form
- Trigger edit (195) — populate form da row
- Delete handler (261) → `deleteTable()` soft-delete
- Maintenance toggle checkbox (715) controlled da `formMaintenanceMode`
- Filter logic (168-172) usa `maintenance_mode` per derivare status

### 3.3 QR display/print

- Edge Function `generate-table-qrs` produce PDF batch
- Client invoca via `generateTableQrsPdf(activityId, tableIds?)` → Blob
- Rotation client-side via `regenerateTableQrToken` (UPDATE `qr_token = gen_random_uuid()`)

### 3.4 maintenance_mode UI

Già implementata in `Tables.tsx`. Coerente con epic maintenance mode chiusa (6 commit chain f4378ea→d2a2cda).

---

## 4. Routing pagina Sede

- Path: `/business/:businessId/locations/:activityId` (`src/App.tsx:205`)
- Element: `<ActivityDetailPage />` (lazy import line 72)
- Provider chain: `<ProtectedRoute>` → `<TenantProvider>` → `<PermissionsProvider>` (lines 191-195)
- Tab pattern (`ActivityDetailPage.tsx`): URL search param `?tab=<value>` via `useSearchParams()`. Tab values attuali: `profile | availability | settings` (line 16). Legacy map: `info|media → profile`, `hours-services|access-control → settings`.
- Component `<Tabs>` line 141, props `value={activeTab} onChange={setActiveTab}`.

Aggiungere tab `tables` = aggiungere 1 valore al union `TabValue` + 1 entry alla `<Tabs>`. Backward-compat: niente legacy mapping necessario.

---

## 5. Pagina Ordini attuale

**Non esiste pagina dedicata.** Stato attuale:

- Admin vede ordini DENTRO `Dashboard/Tables/Tables.tsx` (drill-in per tavolo)
- Customer ordina via `CollectionView` + `OrderingSheet` (pubblico)

Service `orders.ts` ha già tutto per dashboard ordini (admin functions + filters). Manca solo il componente pagina.

**Realtime admin assente.** `subscribeToSessionOrders` è customer-only. Per dashboard ordini live serve nuovo channel admin (subscribe `postgres_changes` su `orders WHERE activity_id = X` + RLS filter via session).

---

## 6. Sovrapposizioni con altre chat (rischio conflitto)

| File | Modificato? | Rischio | Razionale |
|---|---|---|---|
| `supabase/functions/resolve-table/index.ts` | M (~133 lines) | basso | Aggiunge `checkOrderingState` import, scope maintenance mode. Non tocca tavoli/zone. |
| `supabase/functions/submit-order/index.ts` | M (~42 lines) | basso | Stesso scope maintenance mode. |
| `src/pages/Operativita/Attivita/tabs/ActivitySettingsTab.tsx` | M (+48) | medio | Permessi/team refactor. Se il tab `Tavoli` lo importa o ne condivide layout, possibile merge conflict. |
| `src/services/supabase/activities.ts` | M (+23) | basso | `ordering_enabled` field setter. Read-only impatto su redesign. |
| `src/types/activity.ts` | M (+1) | nullo | Aggiunge `ordering_enabled boolean`. |
| `src/components/layout/Sidebar/*` | M | nullo | Layout sidebar refactor (chat parallela). |
| `src/layouts/WorkspaceLayout/WorkspaceSidebar*` | M | nullo | Stesso scope. |
| `src/components/ui/Tooltip/Tooltip.module.scss` | M (+1) | nullo | UI tweak. |
| Migrations `20260530180000..210000_*` | U (untracked) | medio | Team/member role refactor — introduce funzioni `has_permission`, `get_tenant_members_v2` ecc. Le policy RLS attuali su `tables/orders` già usano `has_permission()` → fondazione presente in DB ma codice di setup migration in flight. |
| `src/components/ui/{ActivityMultiSelect,RoleSelector}/` | U (untracked) | basso | Nuovi componenti permessi. |
| `src/constants/layout.ts` | U (untracked) | nullo | Costanti layout. |
| `docs/maintenance-mode-audit-*.md`, `docs/security-audit-*.md` | U | nullo | Solo docs. |

**Conclusione**: nessun file in scope diretto del redesign (Tables.tsx, ActivityDetailPage.tsx, App.tsx routing, tables/orders services). Solo overlap medio su `ActivitySettingsTab.tsx` se introduciamo nuovo tab nella stessa pagina.

---

## 7. Gap identificati per il redesign

### 7.1 Zone γ-lite

- Manca tabella `table_zones (id, tenant_id, activity_id, name, sort_order, created_at, updated_at)` con UNIQUE (activity_id, name)
- Manca colonna `tables.zone_id uuid REFERENCES table_zones(id) ON DELETE SET NULL`
- Migration data: 2 distinct `zone` strings da migrare a righe `table_zones`
- Service `tableZones.ts` da creare (list/create/update/delete)
- `tables.ts:createTable/updateTable` da estendere con `zone_id` (mantenere `zone` text un ciclo per backward-compat? decisione)
- View `v_tables_with_state` da aggiornare con JOIN `table_zones` se serve `zone_name` aggregato

### 7.2 Tab Tavoli in pagina Sede

- Estendere `TabValue` union in `ActivityDetailPage.tsx:16` con `"tables"`
- Aggiungere case render con prerequisito: se `activity.ordering_enabled === false` → empty state "Per gestire i tavoli, abilita prima Ordinazioni QR" + CTA tab Settings
- Spostare/duplicare logica da `Dashboard/Tables/Tables.tsx`. Valutare: estrazione in componente shared `<TablesManagement activityId tenantId />` riusato in entrambe le pagine
- Vincoli: rispettare permesso `tables.manage` per CRUD, `tables.read` per visualizzazione

### 7.3 Cutoff Ripristina su Storico

- **⚠️ Chiarire mapping**: "fine giornata operativa" → `delivered_at >= today_start` o `cancelled_at >= today_start` (status `cancelled`)?
- Service `orders.ts:listOrdersForActivity` accetta già `dateFrom/dateTo`. Estendere `restoreOrder(orderId, expectedVersion)` (nuova funzione) — semantica "reverse cancel" (cancelled → previous status?). Schema-side serve nuovo status o riuso version + reset `cancelled_at`.
- Decisione 3 ambigua sul "ripristino": è undo della cancellazione admin (`cancelOrderAdmin`)? Storno della rettifica (`rectifyOrder`)? Riapertura order_group chiuso? Chiarire in spec.

### 7.4 Selettore sede combobox in Ordini

- Pagina `src/pages/Operativita/Ordini/` da creare ex-novo
- Componente `<ActivitySelectorCombobox tenantId currentActivityId onChange />` riusabile (esiste già `ActivityMultiSelect` untracked — verificare se single-select forkable)
- State persistenza: URL param `?activityId=` (deep-link friendly) > localStorage > primo activity disponibile
- Fetch lista activities via `activities.ts:listActivities(tenantId)`

### 7.5 Kanban Comande

- Componente `<OrdersKanban>` con colonne basate su `OrderStatus` (`submitted | acknowledged | delivered`, `cancelled` separato in storico)
- DnD opzionale (@dnd-kit già in stack) o solo bottoni transizione
- Optimistic locking: `expectedVersion` obbligatorio nelle transition (vincolo CLAUDE.md)
- Realtime admin: nuovo helper in `orders.ts` `subscribeToActivityOrders(tenantId, activityId, callbacks)` — subscribe `postgres_changes` filter `table=orders, filter=activity_id=eq.<id>`

### 7.6 Overview Tavoli operativa

- Già esiste foundation: `listTablesWithState` ritorna sessioni attive + ordini pending + totale + bill_requested per tavolo
- Manca componente `<TablesOverview>` (griglia/card per tavolo con stato live + indicatore "richiesta conto")
- Realtime: triggerare reload su INSERT/UPDATE `orders` o `customer_sessions` (same channel admin di 7.5)

### 7.7 Storico + Ripristina

- Tab/sezione storico in pagina Ordini con filtri (date range, status, tavolo)
- Tabella `DataTable` standard
- Bottone Ripristina condizionale (cutoff fine giornata operativa, vedi 7.3)
- Export CSV opzionale

---

## 8. Proposta di intervento (ordine logico)

Ogni step include: file impattati (stima), complessità (S/M/L), dipendenze.

### Step 1 — Migration + service zone γ-lite

- Migration: `YYYYMMDDHHMMSS_table_zones.sql` (nuova tabella + RLS + index UNIQUE + ALTER tables add zone_id + data backfill)
- Service: `src/services/supabase/tableZones.ts` (nuovo, ~5 funzioni)
- Service: estendere `tables.ts` (createTable/updateTable) per `zone_id`
- View `v_tables_with_state`: aggiornare per JOIN + esporre zone_name
- Tipi: `V2TableZone`, aggiornare `V2Table` + `V2TableInsert` + `V2TableUpdate`
- **Complessità: M** (3 nuovi file + 1 migration + 1 view update)
- **Dipendenze**: nessuna esterna; epic permessi (`has_permission`) già attivo

### Step 2 — UI tab Tavoli in pagina Sede

- Refactor `Dashboard/Tables/Tables.tsx` → estrai `<TablesManagement>` shared component
- Estendere `ActivityDetailPage.tsx`: nuovo tab `tables` con prerequisito `ordering_enabled`
- Form create/edit con dropdown `zone_id` + "+ Crea zona" inline (drawer nested o popover)
- Pannello "Gestisci zone" compatto (CRUD zone)
- **Complessità: L** (refactor + nuovo tab + UI inline zone)
- **Dipendenze**: Step 1 completo

### Step 3 — Pagina Ordini + selettore sede

- Nuova route `/business/:businessId/orders` in `App.tsx`
- Nuova `src/pages/Operativita/Ordini/Ordini.tsx`
- Componente `<ActivitySelectorCombobox>` (riuso forkato da `ActivityMultiSelect` se possibile)
- Tabs interni: `Comande` (kanban) / `Tavoli` (overview) / `Storico`
- **Complessità: M** (scaffold pagina + selettore)
- **Dipendenze**: nessuna (può partire parallelo a Step 2)

### Step 4 — Kanban Comande + realtime admin

- Componente `<OrdersKanban>` 3 colonne (submitted/acknowledged/delivered)
- Service `orders.ts`: nuovo `subscribeToActivityOrders(tenantId, activityId, callbacks)`
- Transizioni via `acknowledgeOrder/deliverOrder/cancelOrderAdmin` con `expectedVersion`
- Empty states + loading skeletons
- **Complessità: L** (UI kanban + realtime + handling optimistic lock conflict 409)
- **Dipendenze**: Step 3 (pagina contenitore)

### Step 5 — Overview Tavoli operativa

- Componente `<TablesOverview>` con griglia card per tavolo
- Riusa `listTablesWithState` esistente (già aggregato)
- Reload triggerato da realtime channel di Step 4
- Indicatore "richiesta conto" + CTA `clearBillRequest`
- **Complessità: M** (UI + integrazione realtime esistente)
- **Dipendenze**: Step 4 (realtime channel admin)

### Step 6 — Storico + Ripristina con cutoff

- Tab Storico in pagina Ordini con `DataTable` + filtri
- Service `orders.ts`: nuovo `restoreOrder(orderId, expectedVersion)` — DA SPECIFICARE semantica (vedi gap 7.3)
- Condizione bottone Ripristina: ordine `(cancelled OR delivered)` AND `(cancelled_at OR delivered_at) >= today_start`
- Migration eventuale se ripristino richiede nuovo campo / Edge Function dedicata
- **Complessità: M** (UI semplice, ma semantica restore da chiarire)
- **Dipendenze**: Step 3 + chiarimento spec Ripristina

---

## 9. Sommario decisioni-bloccanti pre-implementazione

Prima di Step 1 chiedere conferma su:

1. **`tables.zone` text esistente**: drop subito post-backfill, o mantenere 1 ciclo deploy per backward-compat?
2. **Semantica "Ripristina"**: undo di `cancelOrderAdmin`? Storno di `rectifyOrder`? Riapertura `order_group`? Reset `cancelled_at` con incremento version?
3. **Cutoff "fine giornata operativa"**: timezone? `now() - interval '1 day'`? Mezzanotte locale tenant? Configurable per tenant?
4. **`ActivityMultiSelect` untracked**: aspettare merge altra chat o forkare subito? Rischio: API instabile prima del merge.

---

## Addendum mini-audit 2026-05-30 sera

### Correzione finding #2 precedente

Audit precedente affermava: "Pagina Ordini NON esiste, orders gestiti dentro `Dashboard/Tables/Tables.tsx`". **Errato.**

Realta:
- `src/pages/Dashboard/Orders/Orders.tsx` ESISTE come route standalone (`App.tsx:209 path="orders" element={<Orders />}`, lazy `App.tsx:55`)
- `src/pages/Dashboard/Tables/Tables.tsx` ESISTE come pagina standalone separata da Ordini (`App.tsx:207 path="tables"`, lazy `App.tsx:54`)
- Le 2 pagine condividono solo pattern (selettore sede, header) ma vivono indipendenti
- Cartelle complete con drawer dedicati:
  - `Dashboard/Orders/`: `OrderCard`, `OrderDetailDrawer`, `OrderCancelDrawer`, `OrderRectifyDrawer`
  - `Dashboard/Tables/`: `BillRequestsDrawer`, `TableCloseDrawer`, `TableDeleteDrawer`, `TableRegenerateTokenDrawer`

**Impatto sul redesign**: lavoro greenfield molto inferiore al previsto. Refactor + restyling + aggiunta selettore robusto, non costruzione ex-novo.

### Pagina Ordini esistente (`/business/:businessId/orders`)

**File**: `src/pages/Dashboard/Orders/Orders.tsx`

- Titolo: `"Ordini"` (line 224)
- Subtitle: `"Dashboard live degli ordini in corso."` (line 225)
- Tabs (line 123-128) — mapping diretto `OrderStatus`:
  | Tab | status filter |
  |---|---|
  | Tutti | (no filter) |
  | Da prendere | `submitted` |
  | In corso | `acknowledged` |
  | Consegnati | `delivered` |
  | Cancellati | `cancelled` |
- Auto-refresh: `setInterval` ogni 30s (`AUTO_REFRESH_INTERVAL_MS = 30_000`, line 45). Toggle persistito in `localStorage["ordersAutoRefresh"]` (line 44)
- Search: `customer_name_snapshot` + table label lookup (client-side filter, case-insensitive). Placeholder `"Cerca per cliente o tavolo..."` (line 201)
- Activity selector: **native HTML `<select>` con local useState**, no URL param (lines 191-199). Conditional render se `activities.length > 1`
- Service: `listOrdersForActivity(tenantId, activityId, {status})` (line 85-92)
- Detail drawer (`OrderDetailDrawer`): solo display (footer vuoto). Actions vivono sull'OrderCard per riga
- Actions per status su `OrderCard.tsx:108-133`:
  - `submitted` → Conferma + Cancella + Vedi dettaglio
  - `acknowledged` → Consegna + Cancella + Vedi dettaglio
  - `delivered && !is_rectification` → Rettifica + Vedi dettaglio
- Realtime admin: **assente** (solo polling 30s)

**Risposta su stato "Pronte"**: NON esiste nello schema. `OrderStatus = submitted | acknowledged | delivered | cancelled`. Nessun riferimento a `ready_at`, `pronta`, `preparing`. Se UX vuole "Pronta" come intermedio tra `acknowledged` (preparazione cucina) e `delivered` (portata al tavolo), serve:
- **Opzione A**: nuovo enum value `ready` + nuovo timestamp `ready_at` (migration ALTER TYPE + ALTER TABLE + Edge updates)
- **Opzione B**: pseudo-stato derivato (es. `acknowledged` con flag `is_ready boolean`) — meno pulito
- **Opzione C**: lasciare cucina<->servizio inferito dal contesto (no nuovo stato), accettare 3 colonne kanban
Decisione richiesta utente.

### Pagina Tavoli esistente (`/business/:businessId/tables`)

**File**: `src/pages/Dashboard/Tables/Tables.tsx`

- Titolo: `"Tavoli"` (line 334)
- Subtitle: `"Gestisci i tavoli delle tue sedi e monitora lo stato live."` (line 335)
- Filter buttons (lines 388-406) tipo `StatusFilter` (line 40):
  | Tab | logica |
  |---|---|
  | Tutti | nessun filtro |
  | Liberi | `active_sessions_count === 0 && !maintenance_mode` |
  | Occupati | `active_sessions_count > 0 && !maintenance_mode` |
  | Manutenzione | `maintenance_mode === true` |
- DataTable colonne (lines 253-332):
  1. Tavolo (label + zone + badge "Conto richiesto")
  2. Posti
  3. Stato (badge Manutenzione/Occupato/Libero)
  4. Sessioni (`active_sessions_count`)
  5. Conti (`open_groups_count`)
  6. Totale (`current_total` EUR)
  7. Actions (`TableRowActions` menu)
- Data source: `listTablesWithState(tenantId, activityId)` → view `v_tables_with_state`
- Refresh: **manuale via bottone "Aggiorna"** (line 313). NO polling, NO realtime
- Nuovo tavolo: drawer inline (`SystemDrawer`, line 659+)
  - Fields: label (required), zona (text libero), posti (number opt), maintenance checkbox
- Genera QR: 2 trigger
  - All-batch: bottone toolbar → `generateTableQrsPdf(activityId)` → blob download
  - Single: row action → `generateTableQrsPdf(activityId, [tableId])` → blob download
- Maintenance toggle: SOLO in form drawer (no inline per-row)
- Activity selector: **native HTML `<select>` con local useState**, no URL param (lines 356-368). Conditional `activities.length > 1`
- CRUD/management actions disponibili:
  - Create, Read, Update, Delete (soft, single + bulk)
  - Generate QR all/single
  - Regenerate QR token (`TableRegenerateTokenDrawer`)
  - Close table (`TableCloseDrawer` → chiude order_groups + orders)
  - Bill requests view (`BillRequestsDrawer`)
  - Refresh manuale

**Cosa MIGRARE (estrazione/shared component)**:
- Tutta la logica CRUD tavoli (Create/Update/Delete/Regenerate QR/Generate QR) → tab `Tavoli` in `ActivityDetailPage`. La pagina standalone `/tables` puo restare come "operativa multi-sede" oppure essere ritirata (decisione redesign).
- Drawer existing (`TableRegenerateTokenDrawer`, `TableDeleteDrawer`) sono riusabili invariati

**Cosa SPOSTARE a pagina Ordini (tab "Tavoli operativa")**:
- View live state (`listTablesWithState` + colonne Sessioni/Conti/Totale + "Conto richiesto" badge)
- `BillRequestsDrawer` (richiesta conto e' workflow operativo, non setup)
- `TableCloseDrawer` (chiudere tavolo = azione operativa, non setup)
- Filtri Liberi/Occupati/Manutenzione (operativi, non setup)

Risultato: 2 viste separate per concern diversi:
- `ActivityDetailPage` tab "Tavoli" = setup (CRUD + QR + maintenance flag)
- Pagina Ordini tab "Tavoli operativa" = monitoring live + workflow (chiudi/richieste conto)

### Routing e sidebar

Route confermate in `src/App.tsx`:
- `path="tables" element={<Tables />}` (line 207)
- `path="orders" element={<Orders />}` (line 209)

Nessuna nested route (no `/orders/:orderId`). Detail via drawer in-page.

**Sidebar overlap update**: `git status --short` 2026-05-30 sera mostra che `Sidebar.tsx` e `Sidebar.module.scss` **NON sono piu' modificati** (altra chat ha committato). `ActivityMultiSelect.tsx` + `RoleSelector.tsx` **risultano DELETED** (refactored altrove). Nuovi modified emersi: `InviteMemberForm.tsx`, `MemberDrawer.{tsx,module.scss}`, `TeamPage.{tsx,module.scss}`, `types/team.ts`, `lib/permissions.ts`, `tests/lib/permissions.test.ts` — tutti scope team/permessi, **nessun overlap** col redesign Ordini/Tavoli/Sedi.

Voci sidebar "Ordini" + "Tavoli" → non investigate in dettaglio (subagent non aveva diff Sidebar da mostrare). Da verificare al momento dell'aggiunta tab `tables` in ActivityDetailPage se serve toccare nav.

### 4 decisioni-bloccanti — analisi

#### Decisione 1: `tables.zone` text post-backfill

- **Stato attuale**: campo `zone text` libero, 2 stringhe distinte staging (6 tavoli)
- **Punto di vista tecnico**: drop nello STESSO migration di γ-lite. Rationale: il campo e' stringa libera senza semantica, niente Edge Function legge `zone` per logica (verifica con `grep "\.zone[^_]" supabase/functions/`). Backfill = INSERT distinct in `table_zones` + UPDATE `tables.zone_id` via JOIN su nome + DROP COLUMN `tables.zone`. Atomic in 1 migration.
- **Info aggiuntiva richiesta**: confermare via grep che nessuna view/RPC/Edge legge `tables.zone` direttamente. Probabile NO (view `v_tables_with_state` espone `t.zone` ma e' SELECT, non logica)
- **Raccomandazione**: drop in 1 ciclo (no backward-compat). Risparmia 1 deploy successivo

#### Decisione 2: ActivityMultiSelect untracked (ora deleted)

- **Stato attuale aggiornato**: componente NON piu' untracked — risulta DELETED in `git status` (`D src/components/Businesses/InviteMemberDrawer/components/ActivityMultiSelect.{tsx,module.scss}`). Altra chat l'ha rimosso, probabile refactor a livello superiore (in `InviteMemberForm.tsx` o `MemberDrawer.tsx`)
- **Punto di vista tecnico**: fork bloccato. Componente non esiste piu'
- **Raccomandazione**: costruire ex-novo `<ActivitySelectorCombobox>` (single-select) generico in `src/components/ui/`. Pattern minimal: input + dropdown searchable + keyboard nav, basato su pattern esistente in altre combobox del progetto (es. `GooglePlacesSearch`)
- **Info aggiuntiva richiesta**: nessuna

#### Decisione 3: Semantica "Ripristina"

**Caso d'uso dichiarato**: "errore di click 'Servita' da sistemare" → admin ha cliccato per sbaglio Consegna su ordine, vuole tornare indietro.

**3 significati possibili analizzati**:

| Significato | DB action | Pro | Contro |
|---|---|---|---|
| **A) Undo cancel** | `cancelled_at = NULL`, `status = previous` (richiede memorizzare prev), `version++` | Util quando admin annulla per sbaglio | Servono campi extra (es. `pre_cancel_status`) o derivare dai timestamp |
| **B) Riapertura servito** | `delivered_at = NULL`, `status = 'acknowledged'`, `version++` | Match esatto caso d'uso dichiarato | Banale, no schema change |
| **C) Storno rettifica** | crea nuovo order `is_rectification = true` con negativi | Modello fiscale-friendly | Complesso, gia esiste `rectifyOrder()` |
| **D) Riapertura order_group** | `og.status = 'open'`, `og.closed_at = NULL` | Caso macro (tavolo gia chiuso) | Fuori scope ordine singolo |

**Raccomandazione**: implementare B = "Riapertura servito" come prima funzione `restoreOrder(orderId, expectedVersion)`. Cutoff giornata operativa (decisione 4) limita window. Schema NO change: solo `UPDATE orders SET delivered_at = NULL, status = 'acknowledged', version = version + 1 WHERE id = :id AND status = 'delivered' AND version = :expected_version`.

Per A (undo cancel): seconda funzione future `uncancelOrder()`, schema-aware (richiede salvataggio `pre_cancel_status`). Out of scope MVP.

**Info aggiuntiva richiesta**: utente conferma che B (delivered → acknowledged) e' il caso target. Se serve anche undo cancel, e' fase separata.

#### Decisione 4: Timezone "fine giornata operativa"

- **Stato schema**: nessun campo `timezone`, `business_day_start`, `business_day_end`, `iana_timezone` su `activities` (verificato DB info_schema + TS type)
- **Default sensato**: hardcode `Europe/Rome` (90%+ tenant IT, conferma da nomi sedi visti in audit — San Pietro Porta Venezia ecc.)
- **Pattern implementativo**: client-side `Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome" })` per derivare `today_start` ISO. Service `listOrdersForActivity({dateFrom: today_start})` accetta gia parametro.
  ```ts
  function getOperativeDayStart(tz = "Europe/Rome"): Date {
    const now = new Date();
    const todayLocal = new Intl.DateTimeFormat("sv-SE", { timeZone: tz }).format(now); // "2026-05-30"
    return new Date(`${todayLocal}T00:00:00+02:00`); // ⚠️ offset DST-aware servirebbe libreria
  }
  ```
  Per gestire DST correttamente: usare `date-fns-tz` o `Temporal` polyfill (overhead). Alternative: backend-side via `now() AT TIME ZONE 'Europe/Rome'::date::timestamptz`
- **Raccomandazione**: backend-side, dentro service `listOrdersForActivity` oppure RPC dedicato `get_orders_restorable(activity_id)`. Postgres gestisce DST nativamente. Niente frontend gymnastics.
- **Estendibilita futura**: aggiungere `activities.iana_timezone text DEFAULT 'Europe/Rome'` quando primo tenant non-IT chiede support multi-region. Migration banale, backward-compat preservata.
- **Info aggiuntiva richiesta**: utente conferma `Europe/Rome` come default globale, OR vuole campo per-activity da subito

### Piano aggiornato di intervento

Sostituisce/affianca il piano sezione 8. Step rinominati in base ai finding aggiornati:

#### Step 1 — Migration γ-lite zone (invariato)

- Migration unica: `YYYYMMDDHHMMSS_table_zones.sql`
- `table_zones` + RLS + UNIQUE (activity_id, name) + index
- `tables.zone_id uuid REFERENCES table_zones(id) ON DELETE SET NULL`
- Data backfill (INSERT distinct + UPDATE JOIN)
- DROP `tables.zone` (post-conferma grep Edge)
- View `v_tables_with_state` JOIN `table_zones` + espone `zone_name`
- Service `tableZones.ts` (new, 5 funzioni)
- Service `tables.ts` esteso per `zone_id`
- Tipi TS aggiornati
- **Complessita**: M | **Dipendenze**: nessuna

#### Step 2 — Refactor `<TablesManagement>` shared + tab `tables` in `ActivityDetailPage`

- Estrai logica CRUD da `Dashboard/Tables/Tables.tsx` in componente shared `<TablesManagement activityId tenantId />`
- Aggiungi `TabValue` union: `"tables"` in `ActivityDetailPage.tsx`
- Render tab con prerequisito `ordering_enabled === false`
- Form create/edit: dropdown `zone_id` + "+ Crea zona" inline
- Pannello "Gestisci zone" compatto (CRUD zone, popover o sezione)
- Pagina standalone `Dashboard/Tables/Tables.tsx`: mantieni per ora (operativa multi-sede) OR migra a `Operativita/Ordini` tab "Tavoli operativa"
- **Complessita**: L | **Dipendenze**: Step 1

#### Step 3 — Refactor pagina Ordini esistente

- Sostituisci native `<select>` con `<ActivitySelectorCombobox>` (riusabile, persistenza URL param `?activityId=`)
- Aggiungi tab `Tavoli operativa` (sposta logica live monitoring da Dashboard/Tables)
- Mantieni auto-refresh 30s come fallback; aggiungi realtime admin opzionale
- **Complessita**: M | **Dipendenze**: nessuna (puo partire parallelo a Step 2)

#### Step 4 — Realtime admin orders + kanban refactor

- Service `orders.ts`: `subscribeToActivityOrders(tenantId, activityId, callbacks)` — postgres_changes filter `activity_id`
- Refactor `Orders.tsx` da lista + tab a kanban 3-4 colonne (se decisione "Pronte" approva nuovo stato, 4 colonne; altrimenti 3)
- Optimistic locking `expectedVersion` mantenuto
- Empty states + skeleton
- **Complessita**: L | **Dipendenze**: Step 3 + decisione user "Pronte" Y/N

#### Step 5 — Storico + Ripristina

- Tab Storico in pagina Ordini con `DataTable` + filtri date/status/tavolo
- Service `orders.ts`: nuovo `restoreOrder(orderId, expectedVersion)` (significato B = delivered → acknowledged)
- Backend cutoff via RPC `get_restorable_orders(activity_id)` o filter Postgres `delivered_at AT TIME ZONE 'Europe/Rome' >= current_date AT TIME ZONE 'Europe/Rome'`
- Condizione bottone Ripristina: `status = 'delivered' AND delivered_at >= operative_day_start(activity_tz)`
- **Complessita**: M | **Dipendenze**: Step 3 + decisione user timezone

#### Step 6 — Cleanup pagina standalone `/tables`

- Decisione: ritirare oppure mantenere come "operativa multi-sede"?
- Se ritirare: rimuovere route + lazy import + cleanup link sidebar
- Se mantenere: refactor con `<ActivitySelectorCombobox>` + condividere componenti con tab Sede
- **Complessita**: S | **Dipendenze**: Step 2 (shared component)

---

### Sommario decisioni-bloccanti aggiornato

1. `tables.zone` drop subito (no backward-compat) — raccomandazione tecnica chiara, attesa conferma utente
2. ActivityMultiSelect deleted → costruire combobox new — nessuna decisione richiesta
3. Ripristina = riapertura delivered → acknowledged (caso B), schema-free — attesa conferma utente
4. Timezone `Europe/Rome` hardcoded backend-side via Postgres, future-extensible — attesa conferma utente
5. **NUOVO**: stato "Pronte" (ready) tra acknowledged e delivered — schema change Y/N? Attesa decisione utente
6. **NUOVO**: pagina `/tables` standalone — ritirare o mantenere operativa multi-sede? Attesa decisione utente
