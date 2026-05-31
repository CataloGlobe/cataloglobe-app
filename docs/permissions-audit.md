# Audit — Permessi multi-sede

## 0. Metodologia

### Cosa ho esaminato

- **Repo locale**: `/Users/lorenzo_calzi/Lavoro/Progetti/Personali/CataloGlobe`, branch `staging`. Letti file in `src/`, `supabase/migrations/`, `supabase/functions/`. Cercati pattern via grep ricorsivi e indicizzazione.
- **Supabase staging** (project ref `lxeawrpjfphgdspueiag`) via MCP `mcp__supabase-staging__*`:
  - `list_tables` (schema `public`)
  - `execute_sql` su `information_schema`, `pg_policies`, `pg_proc`, `pg_constraint`, `pg_tables`, conteggi `tenant_memberships`
  - `get_advisors(type=security)`
- **Nessuna scrittura**: nessuna migration applicata, nessuna RPC nuova, nessun DDL.

### Data dell'audit

2026-05-26.

### Limiti

- L'audit guarda il codice committato sul branch `staging` (locale, non remoto). Eventuale debt non committato (`OrderStatusStepper.module.scss`, `OrderStatusStepper.tsx` untracked al momento) non è incluso nell'analisi di codice.
- Non analizza percorsi di test E2E né performance dei nuovi join.
- Non analizza la pagina pubblica (out-of-scope: il customer non ha account).
- Non quantifica volumi/righe su tabelle activity-scoped (volumi staging non rappresentativi).

---

## 1. Stato attuale del modello permessi

### 1.1 Schema `tenant_memberships`

Colonne (introspezione su staging via `information_schema.columns`):

| column | type | nullable | default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `tenant_id` | uuid | NO | — |
| `user_id` | uuid | YES | — |
| `role` | text | NO | — |
| `status` | text | NO | — |
| `invited_by` | uuid | YES | — |
| `created_at` | timestamptz | NO | `now()` |
| `updated_at` | timestamptz | YES | — |
| `invite_token` | uuid | YES | — |
| `invited_email` | text | YES | — |
| `invite_sent_at` | timestamptz | YES | `now()` |
| `invite_accepted_at` | timestamptz | YES | — |
| `invite_expires_at` | timestamptz | YES | `now() + '7 days'` |

FK (da `pg_constraint`):

- `tenant_memberships_tenant_id_fkey` → `tenants` ON DELETE **CASCADE** (`c`)
- `tenant_memberships_user_id_fkey` → `auth.users` ON DELETE **CASCADE** (`c`)
- `tenant_memberships_user_id_profiles_fkey` → `public.profiles` ON DELETE **CASCADE** (`c`)
- `tenant_memberships_invited_by_fkey` → `auth.users` ON DELETE **SET NULL** (`n`)

Nessun CHECK constraint sui valori `role` (solo le RPC vincolano ai valori `admin`/`member` per via applicativa; `owner` è impostato dalla migration di membership trigger).

Conta valori `role`/`status` su staging:

```sql
SELECT role, status, COUNT(*) FROM tenant_memberships GROUP BY 1,2 ORDER BY 1,2;
```

| role | status | count |
|---|---|---|
| admin | active | 4 |
| member | expired | 1 |
| member | revoked | 2 |
| owner | active | 11 |

→ Nessun membership `member` `active` su staging. Tutti gli account "in produzione" oggi sono owner o admin. Comodo: il refactor che marca `member` come obsoleto può procedere senza migrazione dati attiva.

Trigger / funzioni correlate (`pg_proc`):

- `handle_new_tenant_membership` (trigger su INSERT tenants → crea row owner)
- `update_updated_at_column` (trigger generico)

### 1.2 Helper `get_my_tenant_ids()`

Definizione corrente (`pg_get_functiondef` da staging):

```sql
CREATE OR REPLACE FUNCTION public.get_my_tenant_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Branch A: caller is the tenant owner
  SELECT t.id
  FROM public.tenants t
  WHERE t.owner_user_id = auth.uid()
    AND t.deleted_at IS NULL

  UNION

  -- Branch B: caller has an active membership (by user_id or pending invite by email)
  SELECT tm.tenant_id
  FROM public.tenant_memberships tm
  JOIN public.tenants t ON t.id = tm.tenant_id
  WHERE (tm.user_id = auth.uid() OR tm.invited_email = auth.email())
    AND tm.status    = 'active'
    AND t.deleted_at IS NULL
$function$
```

Caratteristiche:

- `SECURITY DEFINER`, `search_path` settato vuoto. Conforme alle regole `docs/patterns/storage-sql.md`.
- Nessuna granularità per `role`: restituisce TUTTI i tenant_id dove l'utente è owner o membro attivo.
- Nessuna granularità per `activity_id`: l'helper esiste solo a livello tenant.
- File migration originario: `supabase/migrations/20260309100000_v2_phase2_rls_multi_tenant.sql` (creato in fase 2 del refactor multi-tenant). Riformulato in:
  - `20260312130000_get_my_tenant_ids_team.sql`
  - `20260312140000_get_my_tenant_ids_permissions.sql`
  - `20260315120000_v2_fix_get_my_tenant_ids.sql`
  - `20260329120000_fix_get_my_tenant_ids_table_names.sql`

### 1.3 Pattern RLS attuale

Pattern ricorrente (template, da migration `20260227200000_v2_rls_base.sql`):

```sql
CREATE POLICY "Tenant select own rows" ON public.<table>
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.get_my_tenant_ids()));
CREATE POLICY "Tenant insert own rows" ON public.<table>
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));
CREATE POLICY "Tenant update own rows" ON public.<table>
  FOR UPDATE TO authenticated
  USING  (tenant_id IN (SELECT public.get_my_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));
CREATE POLICY "Tenant delete own rows" ON public.<table>
  FOR DELETE TO authenticated
  USING (tenant_id IN (SELECT public.get_my_tenant_ids()));
```

Tabelle che seguono il pattern verbatim (verificato su staging via `pg_policies`):

`activities`, `activity_closures`, `activity_hours`, `catalog_categories`, `catalog_category_products`, `catalog_items`, `catalog_sections`, `catalogs`, `customer_sessions`, `featured_content_products`, `featured_contents`, `ingredients`, `order_groups`, `orders`, `product_attribute_values`, `product_availability_overrides`, `product_groups`, `product_group_items`, `products`, `schedule_featured_contents`, `schedule_layout`, `schedule_price_overrides`, `schedule_visibility_overrides`, `schedules`, `styles`, `tables`, `tenant_languages`.

**Eccezioni al pattern**:

1. **`activity_media`** — policies tipo `(activity_id IN (SELECT id FROM activities WHERE tenant_id IN ...))`, non `tenant_id IN ...` diretto. Vedi §2.1.
2. **`activity_product_overrides`** — stesso pattern via `EXISTS … FROM activities` (vedi §2.1).
3. **`order_items`** — `(order_id IN (SELECT id FROM orders WHERE tenant_id IN ...))` + policy customer `customer_session_id`-based (vedi §2.2).
4. **`schedule_targets`** — niente `tenant_id` diretto, JOIN-via-`schedules` (vedi §2.4).
5. **`product_attribute_definitions`** — SELECT permette `tenant_id IS NULL` (platform-wide attrs).
6. **`notifications`** — policies `user_id = auth.uid()`, NON `tenant_id IN ...` (vedi §6.1).
7. **`tenants`** — RLS custom: `owner_user_id = auth.uid()` per insert/update; SELECT permette `owner OR id IN get_my_tenant_ids()`.
8. **`tenant_memberships`** — 6 policy SELECT (overlap storico) + 1 policy `ALL` "Tenant owner can manage memberships". Vedi §1.4.
9. **`reviews`** — policy `reviews_select_anon` (`status='approved'` pubblico) + tenant-scoped autenticato.
10. **`customer_sessions`, `orders`, `order_items`** — policy aggiuntiva `Customer select/update own…` basata su `get_jwt_customer_session_id()` (epic ordering customer JWT).
11. **Tabelle senza RLS**: `consent_records`, `plans`, `profiles`, `rate_limit_buckets`, `status_checks`, `status_incidents`, `status_service_state`, `stripe_processed_events`, `supported_languages`, `waitlist`, `webhook_errors`, `audit_events`, `otp_challenges`, `otp_send_audit`, `otp_user_verifications` (alcune sono RLS-enabled ma senza policy → advisor `rls_enabled_no_policy`).

### 1.4 Inviti e onboarding

Tabella invito = `tenant_memberships` riusata (no tabella separata `tenant_invites`). Colonne dedicate: `invited_email`, `invite_token`, `invite_sent_at`, `invite_expires_at`, `invite_accepted_at` + `status` con valori `pending|active|expired|revoked|left`.

**Edge function `send-tenant-invite`** (`supabase/functions/send-tenant-invite/index.ts`):

- Internal-only: richiede header `X-Internal-Secret` (validato contro env var `INTERNAL_EDGE_SECRET`).
- Input: `{ email, tenantName, inviterEmail, inviteToken }` (`index.ts:21-26`).
- Output: invio email Resend con CTA `${APP_URL}/invite/${inviteToken}`.
- **Non ha alcuna logica di ruolo o sede**: si limita a recapitare l'email.

**RPC `invite_tenant_member(p_tenant_id, p_email, p_role)`** (definizione completa via `pg_get_functiondef`):

- Caller deve essere `owner` o `admin` `active` del tenant (check inline).
- `p_role` accettato: `'admin'` o `'member'` (rejected `'owner'`).
- Crea o aggiorna row in `tenant_memberships` con `status='pending'`.
- Fire-and-forget `net.http_post` verso `send-tenant-invite` con secret dal Vault.

**RPC `accept_invite_by_token(p_token)`**:

- UPDATE atomico: status → `active`, `user_id` → `auth.uid()`, pulisce `invited_email`/`invite_token`.
- No filtro `user_id` in WHERE (necessario per email-only invites).

**Flusso UI accettazione**: `src/pages/Invite/InvitePage.tsx`

- `useParams<{ token }>` da URL `/invite/:token`.
- Se non loggato → redirect a `/login` con `state.from.pathname` per resume.
- `supabase.rpc("get_invite_info_by_token", { p_token: token })` → mostra info tenant+ruolo.
- `supabase.rpc("accept_invite_by_token", { p_token: token })` → ritorna `tenantId`.

**Altre RPC permessi-related** (sample via `pg_proc.proname LIKE`):

`accept_invite_by_token`, `accept_tenant_invite`, `change_member_role` (admin/member only, blocca cambio su owner), `decline_invite_by_token`, `delete_invite`, `expire_old_invites`, `get_invite_info_by_token`, `get_my_pending_invites`, `get_my_tenant_ids`, `get_public_tenant_ids`, `get_tenant_members`, `invite_tenant_member`, `leave_tenant`, `remove_tenant_member` (owner non rimuovibile, self-removal vietato), `resend_invite`, `revoke_invite`, `transfer_ownership` (solo owner attivo → target deve essere member attivo; downgrade owner → admin; reset Stripe).

**View `user_tenants_view`** (`20260317270000_fix_user_tenants_view_role_resolution.sql`):

```sql
SELECT t.id, t.name, t.vertical_type, t.created_at, t.owner_user_id,
  CASE
    WHEN t.owner_user_id = auth.uid() THEN 'owner'
    WHEN tm.role IS NOT NULL           THEN tm.role
    ELSE NULL
  END AS user_role
FROM tenants t
LEFT JOIN tenant_memberships tm
  ON tm.tenant_id = t.id AND tm.user_id = auth.uid() AND tm.status = 'active'
WHERE t.deleted_at IS NULL
  AND (t.owner_user_id = auth.uid() OR tm.user_id IS NOT NULL);
```

Source-of-truth del campo `user_role` consumato da `TenantProvider` (`src/context/TenantProvider.tsx:44-46`).

**Multiple SELECT policy su `tenant_memberships`** (debt storico): 6 policy SELECT che si sovrappongono parzialmente:

- `Tenant owner can manage memberships` (ALL)
- `Users can read their own membership` (`user_id=auth.uid()`)
- `Users can read their own pending email invites` (`status=pending AND invited_email=auth.email()`)
- `Users can read own memberships or invites` (`user_id=auth.uid() OR invited_email=auth.email()`)
- `Active members can read memberships` (per via `tenants.owner_user_id`)
- `Active members can read team memberships` (`tenant_id IN get_my_tenant_ids()`)
- `Users can read pending invites for their email`

→ Possibile lavoro di pulizia in fase di refactor (consolidare in 1-2 policy semantiche).

---

## 2. Censimento tabelle activity-scoped

### 2.1 Tabelle con `activity_id` diretto

Estratto da `information_schema.columns WHERE column_name='activity_id'`. Volumi non riportati (staging poco rappresentativo).

| tabella | nullable | FK → activities | ON DELETE | RLS check su activity? | note |
|---|---|---|---|---|---|
| `activities` | (PK `id`) | — | — | — | tabella padre |
| `activity_closures` | NO | `activity_closures_activity_id_fkey` | CASCADE | NO (solo `tenant_id`) | |
| `activity_group_members` | NO | — | — | — | da verificare |
| `activity_hours` | NO | `activity_hours_activity_id_fkey` | CASCADE | NO (solo `tenant_id`) | |
| `activity_media` | NO | `activity_media_activity_id_fkey` | CASCADE | SÌ via subquery `activities` | non ha `tenant_id` |
| `activity_product_overrides` | NO | `activity_product_overrides_activity_id_fkey` | CASCADE | SÌ via `EXISTS … FROM activities` | |
| `activity_slug_aliases` | NO | — | — | — | da verificare |
| `analytics_events` | NO | `analytics_events_activity_id_fkey` | CASCADE | — (no policy in scope) | telemetry |
| `customer_sessions` | NO | `customer_sessions_activity_id_fkey` | CASCADE | NO (solo `tenant_id`) | +policy customer JWT |
| `order_groups` | NO | `order_groups_activity_id_fkey` | CASCADE | NO (solo `tenant_id`) | |
| `orders` | NO | `orders_activity_id_fkey` | CASCADE | NO (solo `tenant_id`) | +policy customer JWT |
| `product_availability_overrides` | NO | `product_availability_overrides_activity_id_fkey` | CASCADE | NO (solo `tenant_id`) | |
| `reviews` | NO | `reviews_activity_id_fkey` | CASCADE | NO (solo `tenant_id`) | |
| `tables` | NO | `tables_activity_id_fkey` | CASCADE | NO (solo `tenant_id`) | |
| `v_tables_with_state` | YES | (view, no FK) | — | (eredita dalle tabelle base) | |

Conseguenza: oggi tutte queste tabelle (eccetto `activity_media` e `activity_product_overrides`) si limitano a controllare `tenant_id IN get_my_tenant_ids()`. Un membro tenant-attivo legge/scrive su **tutte** le sedi del tenant indistintamente. Manca il filtro `activity_id ∈ sedi_assegnate_al_membro`.

### 2.2 Tabelle activity-scoped indirette

- **`order_items`** — non ha `activity_id` né `tenant_id`. RLS via `order_id IN (SELECT id FROM orders WHERE tenant_id IN get_my_tenant_ids())`. Per filtraggio activity-scoped serve risalire `order_items → orders → activities`.
- **`schedule_featured_contents`** — ha `tenant_id` ma non `activity_id`. L'activity-scoping passa attraverso `schedule_targets.target_id` (vedi §2.4).
- **`schedules`** — solo `tenant_id`. Target multi-sede via `schedule_targets`.
- **`product_availability_overrides`** — ha sia `tenant_id` sia `activity_id`. RLS attuale guarda solo `tenant_id`. Activity filter è applicato solo lato client.

### 2.3 Tabelle tenant-scoped pure (NON activity-scoped)

Lista da `information_schema.columns WHERE column_name='tenant_id'` filtrata su quelle senza `activity_id`:

`catalog_categories`, `catalog_category_products`, `catalog_items`, `catalog_sections`, `catalogs`, `featured_content_products`, `featured_contents`, `ingredients`, `product_allergens`, `product_attribute_definitions` (nullable), `product_attribute_values`, `product_characteristic_assignments`, `product_group_items`, `product_groups`, `product_ingredients`, `product_option_groups`, `product_option_values`, `product_variant_assignments`, `product_variant_assignment_values` (no `tenant_id`), `product_variant_dimensions`, `product_variant_dimension_values`, `products`, `schedule_featured_contents`, `schedule_layout`, `schedule_price_overrides`, `schedule_visibility_overrides`, `schedules`, `style_versions`, `styles`, `tenant_languages`, `audit_events`, `audit_logs`, `notifications`, `translation_jobs`, `translations`.

**Tutte oggi**: scrivibili da ogni utente con `tenant_id ∈ get_my_tenant_ids()`. Nel nuovo modello manager/staff/viewer NON devono poter scrivere (eccezione tematica: `schedules` modificabile da manager se tutte le `schedule_targets` sono sue — vedi sezione 6 del prompt). RLS attuale è permissiva.

**Casi speciali**:

- `allergens` — NO `tenant_id`, cross-tenant, RLS `Public can read`. OK.
- `ingredients` — ha `tenant_id`, ma anche policy `Public can read ingredients` (`USING true`). Verificare se intenzionale.

### 2.4 Casi speciali: `schedule_targets`

**Stato attuale** confermato:

Colonne (`information_schema.columns`):

| column | type |
|---|---|
| `id` | uuid |
| `schedule_id` | uuid FK `schedules.id` ON DELETE CASCADE |
| `target_type` | text (CHECK `'activity' | 'activity_group'`) |
| `target_id` | uuid |
| `created_at` | timestamptz |

Niente `tenant_id`. Niente FK su `activities.id` o `activity_groups.id` (target_id polimorfico).

**Policy attuali** (`pg_policies`, 4 entry):

```sql
-- SELECT
USING (schedule_id IN (SELECT id FROM schedules WHERE tenant_id IN (SELECT get_my_tenant_ids())))
-- INSERT
WITH CHECK (schedule_id IN (SELECT id FROM schedules WHERE tenant_id IN (SELECT get_my_tenant_ids())))
-- UPDATE
USING ... WITH CHECK ... (entrambe stessa subquery)
-- DELETE
USING ...
```

**Conferma**: RLS esiste (contraddice CLAUDE.md / docs/architecture che dichiarano `no RLS diretta`). Ma il check è **solo tenant-scoped** via JOIN su `schedules`, non activity-scoped.

Letture dal codice (`grep schedule_targets`):

- `src/services/supabase/scheduleResolver.ts:315` — SELECT in resolver competizione (sia frontend sia edge function `_shared`).
- `src/services/supabase/featuredScheduling.ts:313` — INSERT.
- `src/services/supabase/layoutScheduling.ts:633, 1325, 1662, 1677` — INSERT + copy in clone schedule.
- `supabase/functions/_shared/scheduleResolver.ts` — copia gemellata per edge.
- Tests: `src/tests/scheduling/scheduleResolver.contract.test.ts`.
- Cleanup: `supabase/migrations/20260506131400_cleanup_orphan_schedule_targets.sql`.

**Proposta nuova RLS** (richiesta esplicita dal prompt — sezione 2.4):

Opzione A (denormalizzazione minima): aggiungere `tenant_id uuid NOT NULL` a `schedule_targets`, riempire da migrazione (JOIN su `schedules`), e applicare il pattern standard `tenant_id IN get_my_tenant_ids()`. Pro: pattern uniforme. Contro: aggiunge ridondanza ma resolver non cambia.

Opzione B (activity-aware): aggiungere `tenant_id` come in A E modificare la policy in:

```sql
USING (
  tenant_id IN (SELECT get_my_tenant_ids())
  AND (
    -- owner/admin: full access (le 2 ruoli tenant-scoped vedono tutto)
    EXISTS (SELECT 1 FROM tenant_memberships tm
            WHERE tm.tenant_id = schedule_targets.tenant_id
              AND tm.user_id = auth.uid()
              AND tm.role IN ('owner','admin')
              AND tm.status = 'active')
    OR t.owner_user_id = auth.uid()
    -- activity-scoped: visibile se almeno un target è una sede assegnata
    OR (target_type = 'activity'
        AND target_id IN (SELECT get_my_activity_ids()))
    OR (target_type = 'activity_group'
        AND target_id IN (SELECT activity_group_id
                          FROM activity_group_members
                          WHERE activity_id IN (SELECT get_my_activity_ids())))
  )
)
```

Dove `get_my_activity_ids()` è il nuovo helper SQL su `tenant_member_activities` (definito dal contesto decisionale). Per WRITE policy serve restringere ulteriormente a "tutti i target appartengono alle proprie sedi" — logica complessa, candidata a RPC `update_schedule_targets()` con check applicativo.

Nota: opzione B richiede coordinamento con il resolver (`scheduleResolver.ts`) per non rompere la `competizione una-sola-regola-vince`. Da riconfermare in fase implementativa.

### 2.5 Casi speciali: `allergens`

`pg_policies` su `allergens`: una sola policy `Public can read v2_allergens` con `USING true`. Nessuna policy INSERT/UPDATE/DELETE per `authenticated` (write riservato a `service_role`). Cross-tenant globale, immutabile per utenti finali. Coerente con CLAUDE.md ("eccezione: allergens").

---

## 3. Service layer — query activity-scoped

### 3.1 Funzioni che già filtrano per `activity_id`

`src/services/supabase/tables.ts:13` — `listTables(tenantId, activityId)`
`src/services/supabase/tables.ts:33` — `listTablesWithState(tenantId, activityId)`
`src/services/supabase/tables.ts:55` — `clearBillRequest(...)` (per riga, non lista)
`src/services/supabase/tables.ts:78` — `listBillRequestsForTable(...)` (per table)
`src/services/supabase/tables.ts:98` — `getTable(id, tenantId)`
`src/services/supabase/tables.ts:115` — `createTable(...)` (richiede activity_id nel body)
`src/services/supabase/tables.ts:156` — `updateTable(...)`
`src/services/supabase/tables.ts:186` — `deleteTable(id, tenantId)`
`src/services/supabase/tables.ts:205` — `regenerateTableQrToken(...)`

`src/services/supabase/orders.ts:266` — `listOrdersForActivity(activityId, ...)`
`src/services/supabase/orders.ts:325` — `acknowledgeOrder(orderId, ...)` (per riga)
`src/services/supabase/orders.ts:346` — `deliverOrder(...)`
`src/services/supabase/orders.ts:373` — `cancelOrderAdmin(...)`
`src/services/supabase/orders.ts:427` — `rectifyOrder(...)`
`src/services/supabase/orders.ts:600` — `subscribeToSessionOrders(...)` (customer-side)

`activities.ts:183` — `getActivityBySlug(slug)`
`activities.ts:199` — `getActivityBySlugAny(slug)`

Servizi che hanno funzioni `*_for_activity` o accettano `activityId`: `tables.ts`, `orders.ts`, `customerSessions.ts`, `productAvailability.ts`, `analytics.ts`, `reviews.ts` (parzialmente).

### 3.2 Funzioni che NON filtrano per activity ma dovranno (admin-side)

Identificate file:funzione, devono prendere `activityId` opzionale o filtrare automaticamente via RLS attivata dal nuovo modello:

- `src/services/supabase/orders.ts:266` — `listOrdersForActivity` accetta già `activityId`; ma se un manager prova a passare un `activityId` non assegnato, oggi RLS lascia passare (controlla solo `tenant_id`). Deve fallire (via nuova RLS).
- `src/services/supabase/tables.ts:listTables*` — già activity-scoped, ma deve diventare RLS-protetto.
- `src/services/supabase/featuredContents.ts` — featured sono tenant-globali; ruoli activity-scoped non devono scriverle (writes da bloccare via nuova RLS).
- `src/services/supabase/reviews.ts` — `listReviews(tenantId)` se esiste oggi è tenant-wide; manager deve vederle solo per sue sedi.
- `src/services/supabase/customerSessions.ts` — admin lookup deve filtrare per `activity_id`.
- `src/services/supabase/activityHours.ts` — activity-scoped, filtraggio applicativo via parametro `activityId`.
- `src/services/supabase/activityClosures.ts` — stesso.
- `src/services/supabase/activities.ts` — `listActivities(tenantId)` (read-only) deve restituire solo sedi visibili (owner/admin: tutte; manager/staff/viewer: solo `get_my_activity_ids()`).
- `src/services/supabase/scheduleResolver.ts`, `featuredScheduling.ts`, `layoutScheduling.ts` — devono filtrare regole "viste da almeno una mia sede" (lettura) e "modificabili solo se tutte target sono mie" (write).

### 3.3 Inventario `userRole` inline (tech debt — vedi anche §7)

Definizione `userRole` enum: `src/context/TenantContext.ts:8` e `src/types/tenant.ts:14` come `"owner" | "admin" | "member"`.

Sorgente di alimentazione: `src/context/TenantProvider.tsx:28` da `selectedTenant?.user_role`.

Helper esistenti in `src/lib/permissions.ts`:

```ts
export type Role = "owner" | "admin" | "member";
export function isOwner(role): boolean { return role === "owner"; }
export function isAdmin(role): boolean { return role === "admin"; }
export function isMember(role): boolean { return role === "member"; }
export function canManage(role): boolean { return role === "owner" || role === "admin"; }
```

→ NON è dead code (contrariamente a CLAUDE.md "Permissions refactor: centralize `src/lib/permissions.ts` (currently dead code…)"). È *usato* da:

- `src/components/Subscription/SubscriptionBanner.tsx:57, 75, 101` — gating `isOwner`
- `src/pages/Business/SubscriptionPage.tsx:10, 57, 65, 172, 275, 281, 294, 370` — gating `isOwner` + `isAdmin` + `isMember`
- `src/pages/Business/BusinessSettingsPage.tsx:7, …` — `isOwner`
- `src/pages/Business/TeamPage.tsx` — `canManage(userRole)` come `isAdmin`
- `src/components/Businesses/MemberDrawer/MemberDrawer.tsx:10, 35` — `isOwner(member.role)`

Inoltre check inline (NON via helper, candidati al refactor):

- `src/components/layout/Sidebar/Sidebar.tsx:129` — `userRole === "member"` (per nascondere `/subscription`)
- `src/components/Businesses/BusinessCard.tsx:25-27` — label switch `"owner"|"admin"|"member"`
- `src/components/Businesses/MemberDrawer/MemberDrawer.tsx:65-67` — `member?.role === "admin"`, `member?.role === "owner" ? ... : "Member"`
- `src/components/Businesses/InviteModal.tsx:101` — `invite.role === "admin"`
- `src/components/Businesses/InviteMemberDrawer.tsx:12-13, 32, 38` — `setRole("member")` + opzioni hard-coded
- `src/components/Businesses/MemberDrawer/MemberDrawer.tsx:14-17` — `ROLE_OPTIONS` hardcoded `[member, admin]`

→ Helper file `src/lib/permissions.ts` non sarà più `Role = owner|admin|member` ma deve mappare i 5 ruoli del nuovo modello + helper atomici `hasPermission()`.

---

## 4. UI — punti di intervento

### 4.1 Pagine activity-scoped senza selettore sede

Sidebar attuale (`src/components/layout/Sidebar/Sidebar.tsx:48-105`) ha gruppo "Operatività" con voci:

- `/locations` — `src/pages/Operativita/Attivita/ActivityDetailPage.tsx` (drill-down via clic)
- `/tables` — `src/pages/Dashboard/Tables/Tables.tsx` — oggi tenant-wide (mostra TUTTI i tavoli di TUTTE le sedi del tenant). Da introdurre selettore sede o filtraggio via RLS.
- `/orders` — `src/pages/Dashboard/Orders/Orders.tsx` — stesso problema (`listOrdersForActivity` riceve `activityId` come parametro; pagina probabilmente prende il primo o tutti).
- `/scheduling` — `src/pages/Dashboard/Programming/Programming.tsx` + `ProgrammingRuleDetail.tsx` + `FeaturedRuleDetail.tsx` — regole tenant-scoped con target activity multi-select. Visibilità manager-scoped da introdurre.

Sidebar gruppo "Contenuti" (tenant-globale): `/catalogs`, `/products`, `/featured`, `/styles`, `/languages` — nel nuovo modello manager/staff/viewer leggono ma non scrivono. Sidebar non gating il GROUP, gating il bottone d'azione dentro la pagina.

Sidebar gruppo "Insight": `/analytics`, `/reviews` — activity-scoped logicamente. Oggi nessun filtro.

Sidebar gruppo "Sistema": `/team` (manager invita sui suoi siti), `/subscription` (solo owner), `/settings` (sede tenant).

Empty state esistente: `src/components/ui` contiene `EmptyState` (referenziato in `docs/patterns/ui-components.md`). Da riutilizzare per "Nessuna sede assegnata" quando un member non ha row in `tenant_member_activities`.

### 4.2 Drawer Team attuale

File rilevanti:

- `src/pages/Business/TeamPage.tsx` — pagina lista (state `members + loading + refreshKey`, drawer `InviteMemberDrawer` + `MemberDrawer`, conferma rimozione)
- `src/components/Businesses/InviteMemberDrawer.tsx` — form invito (email + select ruolo)
- `src/components/Businesses/MemberDrawer/MemberDrawer.tsx` — edit ruolo membro esistente
- `src/components/Businesses/InviteModal.tsx` — preview invito (lista pending) — verificare se ancora attivo (sembra superato da `MemberDrawer`)
- `src/services/supabase/team.ts` — wrapper RPC `get_tenant_members`, `get_my_pending_invites`

Campi attuali invito form (`InviteMemberDrawer.tsx:117-133`):

- TextInput `email` (required)
- Select ruolo, opzioni hard-coded: `[{ value: "member", label: "Membro" }, { value: "admin", label: "Admin" }]`

Nuovo modello richiede:

- Aggiungere select ruolo con 4 valori UI: Amministratore, Responsabile di sede, Personale, Visualizzatore (no Visualizzatore in v1 ma schema pronto).
- Se ruolo è activity-scoped (manager/staff/viewer): aggiungere multi-select sedi (componente da scegliere).
- Validazione client: se ruolo activity-scoped, almeno 1 sede selezionata.

Multi-select riusabile esistente: cerca in `src/components/ui/Select/`. Da quanto visto in `tables.ts` e `featuredContents.ts`, esiste un pattern `Select.tsx` semplice; non esiste un `MultiSelect`/`Combobox` ufficiale in `src/components/ui/`. **Necessario sviluppare nuovo componente** (o riusare quello già usato in `ScheduleTargetsPicker` se presente in Programming — da verificare).

### 4.3 Sidebar e navigazione

Sola gating attuale (`Sidebar.tsx:128-131`):

```ts
if (item.to.endsWith("/subscription") && userRole === "member") return false;
```

→ Solo nasconde "Abbonamento" ai member. Tutte le altre voci visibili a tutti i ruoli.

Cambiamenti richiesti dal nuovo modello (gating sidebar per ruolo):

- **owner/admin**: tutte le voci visibili (oggi).
- **manager**: nascondere `/subscription` (mai); contenuti (`catalogs`, `products`, `styles`) visibili in sola lettura.
- **staff**: mostrare SOLO `/overview`, `/orders`, `/tables`, `/reviews` (notifiche).
- **viewer**: come staff in sola lettura, ma include `/analytics`.

`MainLayout.tsx` (sezione 1.3 del file via grep): rende `<Sidebar />` + `<Outlet />` + `<SubscriptionBanner />`. Non fa gating diretto. `SubscriptionBanner` usa `isOwner(userRole)`.

### 4.4 Empty state esistenti

Component path: `src/components/ui/EmptyState/EmptyState.tsx` (`docs/patterns/ui-components.md` lo cita). Pattern usato in pagine vuote (Products, Catalogs, ecc.). Riusare per "Nessuna sede assegnata" pre-tutorial onboarding membri activity-scoped.

---

## 5. Edge functions impattate

### 5.1 Funzioni con check ruolo / tenant membership

Esiti `grep -l 'tenant_memberships|owner_user_id|role' supabase/functions/`:

- `supabase/functions/delete-tenant/index.ts` — owner-only via `tenantData.owner_user_id !== userId → 403`.
- `supabase/functions/delete-business/index.ts` — query `tenant_memberships` con check `["owner","admin"].includes(role)` + `status='active'` (`index.ts:89-126`).
- `supabase/functions/stripe-checkout/index.ts` — owner-only (`tenantData.owner_user_id !== userId → 403`).
- `supabase/functions/stripe-portal/index.ts` — verificare (probabile owner-only o admin).
- `supabase/functions/stripe-update-seats/index.ts` — verificare.
- `supabase/functions/restore-tenant/index.ts` — owner-only (recovery soft-delete).
- `supabase/functions/purge-tenant-now/index.ts` — owner-only.
- `supabase/functions/delete-account/index.ts` — self-only.
- `supabase/functions/recover-account/index.ts` — self-only.
- `supabase/functions/generate-menu-pdf/index.ts` — verificare.
- `supabase/functions/menu-ai-import/index.ts` — verificare.

Cosa cambierà:

- `delete-business` oggi accetta `owner|admin`. Nel nuovo modello: tenant-scoped permission `activities.delete` (owner + admin). Manager NON può eliminare sedi. Check resta semantically uguale ma deve diventare permission-based.
- `stripe-*` rimangono owner-only (permission `billing.manage` / `billing.cancel`). Admin guadagna `billing.read` + `billing.manage`. Aggiornare check `admin OR owner` su `stripe-portal`, `stripe-update-seats`.
- `delete-tenant` resta owner-only (permission atomico `tenant.delete`).

### 5.2 send-tenant-invite specifically

Schema input attuale (`send-tenant-invite/index.ts:21-26`):

```ts
interface InvitePayload {
  email: string;
  tenantName: string;
  inviterEmail: string;
  inviteToken: string;
}
```

Da estendere: niente (l'edge function è solo recapito email). La validazione `role + activity_ids` deve stare:

- **Lato RPC `invite_tenant_member`** (DB): aggiungere `p_activity_ids uuid[]` + validazioni (manager può invitare solo manager/staff/viewer; manager può scegliere solo sue sedi; `tenant_member_activities` popolato in transazione con `tenant_memberships`).
- **Lato UI invite drawer**: passare `activity_ids` selezionati alla RPC.

Email può menzionare le sedi assegnate (opzionale, low priority): in tal caso aggiungere `activityNames: string[]` al payload `send-tenant-invite`.

### 5.3 Funzioni customer-side (FUORI SCOPE)

Da `supabase/functions/`:

- `resolve-table` — bootstrap sessione cliente (customer JWT custom).
- `resolve-public-catalog` — fetch catalogo pubblico (anon).
- `submit-order`, `cancel-order`, `get-orders-for-session` — customer JWT.
- `request-bill` — customer JWT (verifica `verifyCustomerJwt`).
- `submit-review` — anon o JWT cliente.
- `log-analytics-event` — anon / cliente.
- `join-waitlist` — anon.
- `send-otp`, `verify-otp`, `status-otp` — auth flow.

**Non vanno toccate dal refactor permessi**. Hanno auth proprio (customer JWT custom o anon rate-limited).

Funzioni ordering admin-side che SÌ vanno toccate (oggi check solo tenant-scoped):

- `acknowledge-order`, `deliver-order`, `cancel-order-admin` — wrapper `performAdminOrderTransition` (`_shared/adminOrderTransition.ts`). Verifica via `supabaseUser.rpc("get_my_tenant_ids")`. Nel nuovo modello deve verificare anche `activity_id ∈ get_my_activity_ids()` (per staff/manager su propria sede).
- `rectify-order` — `index.ts` step 5: "Membership check via supabaseUser.rpc('get_my_tenant_ids')". Stesso fix.
- `close-table` — `index.ts` step 4: "Membership check via supabaseUser.rpc('get_my_tenant_ids')". Stesso fix.
- `generate-table-qrs` — verificare.
- `toggle-product-availability` — verificare (manager/staff può modificare disponibilità delle proprie sedi).
- `cleanup-draft-schedules` — service-role cron, ininfluente.

---

## 6. RLS sui dati realtime / notifiche

### 6.1 Tabella `notifications`

Esiste (confermato via `list_tables`). Schema (`information_schema.columns`):

| column | type | nullable |
|---|---|---|
| `id` | uuid | NO |
| `user_id` | uuid | NO |
| `tenant_id` | uuid | YES |
| `event_type` | text | NO |
| `data` | jsonb | NO |
| `read_at` | timestamptz | YES |
| `created_at` | timestamptz | NO |
| `title` | text | YES |
| `message` | text | YES |
| `type` | text | NO |

→ CLAUDE.md dice "tabella futura"; in realtà esiste già su staging.

Policy attuali (`pg_policies`):

| cmd | qual / with_check |
|---|---|
| SELECT | `user_id = auth.uid()` |
| UPDATE | `user_id = auth.uid()` |
| DELETE | `user_id = auth.uid()` |

Nessuna policy INSERT pubblica → INSERT solo via `service_role` (edge function / trigger DB). Le notifiche sono **per utente**, non per tenant. `tenant_id` è metadata informativo (nullable).

Migration originaria: `supabase/migrations/20260322150000_v2_notifications.sql`.
Schema esteso: `supabase/migrations/20260410140000_extend_notifications_schema.sql` — aggiunge `ALTER PUBLICATION supabase_realtime ADD TABLE public.v2_notifications` (linea 70 della migration).
Trigger `transfer_ownership` aggiunge notifica al nuovo owner (`20260322160000_transfer_ownership_add_notification.sql`).

**Implicazione per il refactor permessi**: la tabella è già user-private. Quando creiamo notifiche operative (ordine arrivato, recensione, conto richiesto, ecc.), dovremo inserire una row per ogni `user_id` destinato a riceverla. La logica di chi-riceve-cosa diventa:

- `owner`, `admin` del tenant → ricevono notifiche operative di QUALSIASI sede del tenant.
- `manager`, `staff` con `tenant_member_activities.activity_id = X` → ricevono notifiche operative solo per sede X.
- `viewer` → no notifiche operative (per definizione).

Da implementare in trigger DB (o nel chiamante edge function) che fa `INSERT INTO notifications` per ogni destinatario.

### 6.2 Tabella `orders` e correlate

Schema confermato esistente (Fase 5 ordering committata).

Policy attuali (`pg_policies`):

| cmd | qual | with_check |
|---|---|---|
| SELECT | `tenant_id IN get_my_tenant_ids()` | — |
| SELECT (customer) | `customer_session_id = get_jwt_customer_session_id()` | — |
| INSERT | — | `tenant_id IN get_my_tenant_ids()` |
| UPDATE | `tenant_id IN get_my_tenant_ids()` | `tenant_id IN get_my_tenant_ids()` |
| DELETE | `tenant_id IN get_my_tenant_ids()` | — |

Stesso pattern su `order_items` (via JOIN orders), `order_groups`, `customer_sessions`. Solo controllo tenant, non activity.

Nel nuovo modello manager/staff devono vedere solo `activity_id IN get_my_activity_ids()`. Owner/admin tutto.

### 6.3 Realtime channels

Canali attivi nel frontend (`grep '.channel('`):

- `src/services/supabase/notifications.ts:81` — `.channel('notifications:${userId}')` listener su `postgres_changes` event `INSERT` per propria notifications. RLS user-private rispettata.
- `src/services/supabase/customerSessions.ts:307` — `.channel('customer-session-' + Date.now())` — customer-side.
- `src/services/supabase/orders.ts:614` — `.channel('session-orders-' + Date.now())` — customer-side (subscribe a propri ordini).

Realtime di Supabase rispetta RLS della tabella sorgente. Quando aggiorneremo RLS su `orders` per includere `activity_id`, il canale `session-orders-*` (customer-side) NON è impattato (filtra via `customer_session_id`). Eventuali canali admin-side futuri (es. `tenant-orders-X` o `activity-orders-X`) erediteranno le nuove policy.

---

## 7. Inventario `userRole` inline (debito tecnico)

Grep ricorsivo riassuntivo. Tabella file:linea | snippet | suggerimento.

| file:linea | snippet | tipo | refactor target |
|---|---|---|---|
| `src/context/TenantContext.ts:8` | `userRole: "owner"\|"admin"\|"member"\|null` | enum | espandere a 5 ruoli + nullable |
| `src/context/TenantContext.ts:18` | `userRole: null,` | default | invariato |
| `src/context/TenantProvider.tsx:28` | `selectedTenant?.user_role ?? null` | derivazione | invariato (alimentato dalla view) |
| `src/types/tenant.ts:14` | `user_role?: "owner"\|"admin"\|"member"` | type | espandere a 5 ruoli |
| `src/components/layout/Sidebar/Sidebar.tsx:124, 129` | `userRole === "member"` | check inline | `hasPermission(perms, "billing.read", activityId)` |
| `src/components/Subscription/SubscriptionBanner.tsx:15, 57, 75, 101` | `isOwner(userRole)` | helper | `hasPermission(perms, "billing.cancel")` |
| `src/pages/Business/SubscriptionPage.tsx:10, 34, 57, 65, 172, 275, 281, 294, 370` | `isOwner / isAdmin / isMember(userRole)` | helper | mappatura → permessi atomici |
| `src/pages/Business/BusinessSettingsPage.tsx:7` | `isOwner` | helper | `hasPermission("tenant.manage")` |
| `src/pages/Business/TeamPage.tsx` | `canManage(userRole)` | helper | `hasPermission("team.invite")` |
| `src/components/Businesses/MemberDrawer/MemberDrawer.tsx:10, 35, 65, 67` | `isOwner(member.role)` / `member?.role === "admin"` | check + label | helper label centralizzato + nuovo enum |
| `src/components/Businesses/MemberDrawer/MemberDrawer.tsx:14-17` | `ROLE_OPTIONS hardcoded [member, admin]` | dropdown | 5 ruoli + activity-scoped check |
| `src/components/Businesses/InviteMemberDrawer.tsx:12-13, 32, 38` | `ROLE_OPTIONS hardcoded [member, admin]` + `setRole("member")` | dropdown | 5 ruoli + multi-select sedi |
| `src/components/Businesses/InviteModal.tsx:101` | `invite.role === "admin"` | label | helper label centralizzato |
| `src/components/Businesses/BusinessCard.tsx:25-27` | `if (role === "owner") return "Owner"` ecc. | label switch | helper `roleLabel(role)` |
| `src/types/orders.ts:149, 324` | `CancelledBy = "customer"\|"admin"` | NON tenant role | invariato (campo dominio diverso) |

→ CLAUDE.md riferimento "Permissions refactor: centralize permissions.ts" è **parzialmente errato**: il file esiste e ha 4 helper attivi. Il refactor non è "creare un nuovo file" ma "espandere helper + sostituire i check inline residui con `hasPermission(permId, activityId?)`".

---

## 8. Migration esistenti che toccano permessi

Estrazione cronologica delle migration che hanno modificato `tenant_memberships`, `get_my_tenant_ids()`, o RLS tenant-wide (ordinata):

| filename | scopo (sintesi) |
|---|---|
| `20260227200000_v2_rls_base.sql` | Template RLS standard `tenant_id IN get_my_tenant_ids()`. |
| `20260227203000_v2_rls_tighten_public_reads.sql` | Restringe SELECT pubblici. |
| `20260309000000_v2_phase1_multi_tenant.sql` | Phase 1: schema multi-tenant. |
| `20260309100000_v2_phase2_rls_multi_tenant.sql` | Phase 2: prima definizione `get_my_tenant_ids()`. |
| `20260312120000_v2_tenant_memberships.sql` | Crea `tenant_memberships`. |
| `20260312123000_v2_tenant_memberships_fix_select_policy.sql` | Fix policy SELECT. |
| `20260312130000_get_my_tenant_ids_team.sql` | Aggiunge branch member a `get_my_tenant_ids`. |
| `20260312140000_get_my_tenant_ids_permissions.sql` | REVOKE/GRANT su helper. |
| `20260312143000_v2_tenant_members_view.sql` | View per team listing (v1). |
| `20260312150000_invite_tenant_member_rpc.sql` | RPC invito. |
| `20260312153000_accept_tenant_invite_rpc.sql` | RPC accept. |
| `20260312160000_remove_tenant_member_rpc.sql` | RPC remove. |
| `20260312170000_v2_user_tenants_view.sql` | View `user_tenants_view`. |
| `20260312190000_v2_tenants_member_read_policy.sql` | Policy SELECT tenants. |
| `20260312200000_..._filter_null_role.sql` | Fix CASE in view. |
| `20260312210000_..._explicit_role_filter.sql` | Fix CASE. |
| `20260312220000_v2_tenant_memberships_self_read_policy.sql` | Policy self-read. |
| `20260312230000_v2_tenant_invite_tokens.sql` | Colonne invite. |
| `20260312250000_v2_invite_guard_constraints.sql` | Constraints invito. |
| `20260313000000_v2_email_only_invites.sql` | Invite by email. |
| `20260313010000_v2_tenant_memberships_nullable_user_id.sql` | `user_id` nullable. |
| `20260313020000_v2_invite_tenant_member_refactor.sql` | Refactor RPC invito. |
| `20260313030000_v2_invite_tenant_member_pg_net.sql` | `net.http_post` → send-tenant-invite. |
| `20260313050000_v2_invite_hardening.sql` | Hardening. |
| `20260313130000_v2_accept_invite_atomic.sql` | Accept atomico. |
| `20260313160000_v2_tenant_members_view_v2.sql` | View v2. |
| `20260313170000_v2_change_member_role_rpc.sql` | RPC cambio ruolo. |
| `20260313180000_v2_resend_invite_rpc.sql` | RPC resend. |
| `20260314120000_v2_tenant_membership_trigger_security_definer.sql` | Trigger `handle_new_tenant_membership`. |
| `20260315120000_v2_fix_get_my_tenant_ids.sql` | Fix helper. |
| `20260317200000_fix_accept_invite_by_token_email_only.sql` | Fix accept. |
| `20260317220000_fix_user_tenants_view_access.sql` | Fix view. |
| `20260317230000_add_my_pending_invites_view.sql` | View invites. |
| `20260317250000_fix_remove_tenant_member_rpc.sql` | Fix remove. |
| `20260317270000_fix_user_tenants_view_role_resolution.sql` | Fix CASE role. |
| `20260317280000_fix_tenant_memberships_member_read_policy.sql` | Fix policy. |
| `20260319144432_add_unique_owner_per_tenant.sql` | Constraint 1 owner attivo per tenant. |
| `20260319150000_transfer_ownership_rpc.sql` | RPC transfer ownership. |
| `20260319160000_harden_invite_tenant_member_role.sql` | Validation `p_role`. |
| `20260322160000_transfer_ownership_add_notification.sql` | Notifica nuovo owner. |
| `20260322170000_transfer_ownership_guard_locked.sql` | Guard tenant locked. |
| `20260322190000_transfer_ownership_add_audit.sql` | Audit. |
| `20260329120000_fix_get_my_tenant_ids_table_names.sql` | Fix riferimento tabelle. |
| `20260427100000_security_advisor_fixes` | (citata in `team.ts` come origine di `get_tenant_members`) |

Il modello attuale è quindi pesantemente iterato (≈40 migration). Il refactor non può semplicemente "rifare" `tenant_memberships` — deve aggiungere `tenant_member_activities` + nuovo `get_my_activity_ids()` senza rompere queste 40 migration.

---

## 9. Dipendenze e ordine logico

Senza prescrivere fasi, ecco i constraint logici:

```
permissions_table_seed
└── tenant_member_activities_schema (FK → tenant_memberships + activities)
    └── helper_get_my_activity_ids()
        └── helper_has_permission(user, permission_id, activity_id?)
            ├── RLS_rewrite_activity_scoped_tables
            │   (orders, order_groups, order_items, tables, customer_sessions,
            │    reviews, activity_hours, activity_closures, activity_media,
            │    activity_product_overrides, product_availability_overrides,
            │    analytics_events, schedule_targets)
            ├── RLS_tighten_tenant_scoped_writes
            │   (products, catalogs, styles, attributes, ingredients,
            │    schedules, featured_contents, schedule_layout, ...)
            └── edge_functions_role_checks_replace
                (delete-business, stripe-*, acknowledge-order, deliver-order,
                 cancel-order-admin, rectify-order, close-table,
                 toggle-product-availability, generate-table-qrs)

permissions_table_seed
└── invite_tenant_member_RPC_extension (accetta p_activity_ids[])
    └── UI_invite_drawer_multiselect_sedi

permissions_table_seed
└── frontend_permissions_lib_expand
    ├── userRole_enum_5_values
    ├── hasPermission_helper
    └── replace_inline_checks (Sidebar, SubscriptionBanner, SubscriptionPage,
                               BusinessSettingsPage, TeamPage, MemberDrawer,
                               InviteMemberDrawer, BusinessCard, InviteModal)

schedule_targets_tenant_id_column
└── schedule_targets_RLS_rewrite (sezione 2.4)
    └── service_layer_scheduling_filters
```

**Indipendenze**:

- Il refactor permessi frontend (`permissions.ts` + check inline) può iniziare in parallelo allo schema DB se i 5 ruoli sono già definiti come enum lato TS.
- `schedule_targets` fix è indipendente dal seed permissions ma dipende da `get_my_activity_ids()` che a sua volta dipende da `tenant_member_activities`.
- Email/edge `send-tenant-invite` può evolvere indipendentemente (payload retro-compatibile).

---

## 10. Rischi e zone d'ombra

1. **`tenant_memberships.role` text libero**: niente CHECK constraint, niente enum. Migrazione che marca `role IN ('owner','admin') OR NULL` deve includere un cleanup dei valori `member` esistenti (su staging 3 righe, tutte `expired|revoked` — non `active`). Decidere se trasformare `member` legacy in `staff`/`viewer` o lasciare lo storico.
2. **6 policy SELECT su `tenant_memberships`** che si sovrappongono — alto rischio di lasciare buchi durante il refactor. Probabile candidato a consolidamento (ma scope debt, non required).
3. **`get_my_tenant_ids()` branch "invited_email"**: attualmente l'helper trova il tenant anche per pending invite via email (riga 12-15 della funzione). Implicazione: un utente con invito pendente vede già il tenant via RLS. Vogliamo mantenere questo comportamento nel nuovo modello? Domanda da chiarire.
4. **`change_member_role` RPC** accetta solo `'admin'|'member'` come p_role. Dovrà accettare i 5 ruoli + (se activity-scoped) richiedere `p_activity_ids[]`. Cambio firma → breaking change.
5. **`invite_tenant_member` RPC** stessa cosa: accetta solo `'admin'|'member'`. Anche `send-tenant-invite` può restare invariato ma RPC va estesa.
6. **Performance**: `get_my_activity_ids()` sarà chiamata in molte policy. Richiede indice su `tenant_member_activities(user_id, activity_id)` o `(user_id) INCLUDE (activity_id)`. La firma `STABLE SECURITY DEFINER SET search_path TO ''` come `get_my_tenant_ids` è obbligatoria.
7. **Cosa fare delle 3 righe legacy `role='member'`** su staging:
   - 1 expired (innocua)
   - 2 revoked (innocue)
   - Decidere se cambiare `member` legacy o se rinominare il valore `member` come alias di `staff`. Strada A del prompt dice `role IN ('owner','admin',NULL)`, quindi probabilmente eliminare `member` da quel campo.
8. **`tenant_member_activities` con stesso utente in due tenant diversi**: il PK (`tenant_member_id`, `activity_id`) è univoco a livello membership, quindi non collide se l'utente ha 2 membership diverse. OK.
9. **Sidebar gating per staff**: nascondere voci di sezione potenzialmente non è banale; il `buildGroups()` attuale fa un solo filter `endsWith("/subscription")`. Servirà rewrite più granulare e probabilmente helper `canSeeRoute(route, role)`.
10. **`activity_media` e `activity_product_overrides`**: niente `tenant_id` diretto. Per il nuovo modello bisogna decidere se aggiungerlo (denormalizzazione) o estendere le policy con check su `tenant_member_activities` via subquery doppia.
11. **Customer-side RLS**: le policy `Customer select own…` su `orders`, `order_items`, `customer_sessions` usano `get_jwt_customer_session_id()`. Devono restare invariate (non legate ai 5 ruoli admin).
12. **`v_tables_with_state`**: è una view. Eredita RLS dalle tabelle base (`tables`, `orders`, ecc.). Aggiornando le base le policy della view restano consistenti.
13. **`scheduleResolver.ts` duplicato in 2 posti** (frontend + edge `_shared`): qualsiasi cambio resolver per gestire visibilità activity-scoped va replicato in entrambi (CLAUDE.md regola esistente).
14. **Helper `canManage(role)`** oggi mappa `owner|admin`. Nel nuovo modello potrebbe diventare ambiguo (manager "gestisce" team della sede ma non tenant). Il nome resta valido se si intende "tenant-level manage"; va comunque rinominato o sostituito da permessi atomici nelle call site.
15. **`SubscriptionBanner.tsx`**: l'attuale banner trial/abbonamento è visibile a tutti i ruoli ma con CTA solo owner. Nel nuovo modello manager/staff/viewer non dovrebbero vedere informazioni billing in dettaglio — solo "Abbonamento attivo" generico. Decidere granularità.
16. **`OrderingSheet.tsx` modificato in staging non committato** (Pista B Fase 6): file in `M` non incluso in audit. Nessun impatto previsto sul refactor permessi (è customer-side).

---

## Domande residue per l'utente

1. Vogliamo mantenere il branch "invited_email" in `get_my_tenant_ids()` come accesso pre-accept? (Vedi rischio 3.)
2. Cosa fare delle 3 righe `role='member'` legacy in `tenant_memberships`? Riassegnare a `staff` o lasciare expired/revoked?
3. `tenant_memberships.role` deve diventare enum con check constraint, o rimanere `text`? CHECK constraint rompe alcune migration storiche; enum richiede CAST.
4. Manager promosso ad admin: devo svuotare la sua row in `tenant_member_activities` o lasciarla? (Strada A del prompt non si pronuncia.)
5. Per `schedule_targets` preferiamo Opzione A (denormalizzazione minima) o Opzione B (RLS activity-aware completa con OR su `get_my_activity_ids()`)?
