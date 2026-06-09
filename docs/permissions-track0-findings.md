# Track 0 — Diagnostica permessi: Findings

Sessione READ-ONLY. Niente fix, niente migration. Solo osservazioni.

Fonti primarie: query `pg_get_functiondef` live su DB staging + grep codebase +
`docs/permissions-audit-raw.md` per dati già estratti.

---

## TASK 1 — Meccanismo owner

### 1a. Permission mancanti a owner in `role_permissions`

Query:
```sql
SELECT id FROM public.permissions
WHERE id NOT IN (SELECT permission_id FROM public.role_permissions WHERE role='owner');
```

**Risultato: zero righe.** Owner ha TUTTE le 40 permission in `role_permissions`.

Nota: `docs/permissions-audit-raw.md` §B.2 riportava "39 righe per owner" e ipotizzava una
permission mancante. La query diretta smentisce questa ricostruzione — erano 40.

### 1b. Definizioni funzioni helper

**`has_permission(text, uuid DEFAULT NULL)`** — SECURITY DEFINER, SQL, 4 branch:

| Branch | Meccanismo | Gestisce owner? |
|---|---|---|
| 1 | `tenants.owner_user_id = auth.uid()` + lookup `role_permissions WHERE role='owner'` | ✓ |
| 2 | `tenant_memberships.role = 'admin'` + lookup `role_permissions WHERE role='admin'` | — |
| 3 | `tenant_membership_activities` (scope=tenant) + `role_permissions` | — |
| 4 | `tenant_membership_activities` (scope=activity, per `p_activity_id`) + `role_permissions` | — |

Owner è cortocircuitato in Branch 1 PRIMA di qualsiasi JOIN su `tenant_memberships`.

---

**`has_permission_any_activity(text, uuid)`** — SECURITY DEFINER, plpgsql, 3 branch:

| Branch | Meccanismo | Gestisce owner? |
|---|---|---|
| 1 | `tenants.owner_user_id = auth.uid()` + `role_permissions WHERE role='owner'` | ✓ |
| 2 | `tenant_memberships.role = 'admin'` + `role_permissions` | — |
| 3 | `tenant_membership_activities` + `role_permissions` | — |

---

**`get_my_permissions(uuid)`** — SECURITY DEFINER, plpgsql:

```sql
v_caller_is_owner := EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id = p_tenant_id
      AND t.owner_user_id = v_uid
      AND t.deleted_at IS NULL
);
IF v_caller_is_owner THEN v_resolved_role := 'owner'; END IF;
```

Step 3: `SELECT ARRAY_AGG(rp.permission_id) FROM role_permissions WHERE role = v_resolved_role`

Owner risolto via `owner_user_id`. Poi permission estratti da `role_permissions WHERE role='owner'`
(che ha tutte 40). ✓

---

**`get_my_activity_ids()`** — SECURITY DEFINER, SQL:

Branch A include owner via `tenants.owner_user_id = auth.uid()` → ritorna tutte le activities
del tenant. Branch B: `tenant_membership_activities` per ruoli scoped. ✓

---

**`get_my_tenant_ids()`** — SECURITY DEFINER, SQL:

Branch A: `tenants.owner_user_id = auth.uid()`. Branch B: `tenant_memberships.user_id`. ✓

### 1c. Conclusione owner

**Owner è grant-based**, NON hardcoded superuser. Il cortocircuito owner:
1. Verifica `tenants.owner_user_id = auth.uid()` → risolve role='owner'
2. Poi legge le permission da `role_permissions WHERE role='owner'` (tutte 40)

Il caso-speciale owner è **COERENTE** in tutti e 5 gli helper DB. Nessun helper DB nega
silenziosamente l'owner.

---

## TASK 2 — Audit risoluzione canonica (tutti i percorsi)

Estende `docs/permissions-audit-raw.md` §C.2 con edge functions e path frontend.

### Percorso A — DB helpers via RLS e RPC pre-check

Già mappato in §C.2 del raw. Helper: `has_permission`, `has_permission_any_activity`.

**Owner gestito: ✓** (Branch 1 in entrambe le funzioni, come da TASK 1.)

### Percorso B — `get_my_permissions` RPC + `src/lib/permissions.ts` (frontend)

`PermissionsContext` chiama `get_my_permissions(tenantId)` → ritorna `{ role, activity_ids, permissions[] }`.
Per owner: `role='owner'`, `activity_ids=[]` (vuoto = tenant-wide), `permissions=` tutte 40.

Frontend (`src/lib/permissions.ts`):
- `isOwner(perms)`: `perms.role === 'owner'` ✓
- `isTenantWide(perms)`: `role=owner || role=admin` ✓
- `canDoOnActivity/canDoOnAnyActivity`: check `permissions.has(id)` poi `isTenantWide` → owner passa sempre se ha la permission (ce l'ha) ✓

**Owner gestito: ✓**

### Percorso C — `_isMemberOfTenant` nelle edge functions

Quattro edge functions definiscono localmente `_isMemberOfTenant` (non in `_shared/`):

| File | Implementazione |
|---|---|
| `_shared/adminOrderTransition.ts` | `supabaseUser.rpc("get_my_tenant_ids")` |
| `submit-order-admin/index.ts` | `supabaseUser.rpc("get_my_tenant_ids")` |
| `close-table/index.ts` | `supabaseUser.rpc("get_my_tenant_ids")` |
| `toggle-product-availability/index.ts` | `supabaseUser.rpc("get_my_tenant_ids")` |
| `generate-table-qrs/index.ts` | `supabaseUser.rpc("get_my_tenant_ids")` |

Tutte usano `get_my_tenant_ids()` che gestisce owner via Branch A. ✓

**Owner gestito: ✓** in tutte le istanze di `_isMemberOfTenant` che usano il pattern RPC.

### **🔴 Percorso D — `menu-ai-import`: query inline su `tenant_memberships` SENZA fallback owner**

`supabase/functions/menu-ai-import/index.ts` NON usa `_isMemberOfTenant`. Usa una query inline:

```ts
const { data: membership, error: memberError } = await supabase
    .from("tenant_memberships")
    .select("id")
    .eq("user_id", user.id)
    .eq("tenant_id", tenant_id)
    .limit(1)
    .maybeSingle();

if (!membership) {
    return jsonError("Accesso al tenant non autorizzato", 403);
}
```

`supabase` qui è un client con `SUPABASE_SERVICE_ROLE_KEY` — bypassa RLS e legge direttamente
`tenant_memberships`. Owner non ha riga in `tenant_memberships` post-Fase 5.B.2 cleanup
(esiste solo via `tenants.owner_user_id`). Query ritorna `null` → **owner riceve 403**.

Admin ha riga in `tenant_memberships` con `role='admin'` → passa.

**🔴 Owner NEGATO silenziosamente. Percorso che risolve via `tenant_memberships` direct query SENZA owner_user_id fallback.**

### Percorso E — `generate-menu-pdf`: check owner-only esplicito

```ts
if (businessRow.tenants.owner_user_id !== authData.user.id) {
    return json(403, { error: "forbidden" });
}
```

Questo è il CONTRARIO del bug in Percorso D: `generate-menu-pdf` accetta SOLO owner.
Admin riceve 403 da questa funzione.

**Owner gestito: ✓ (solo owner, admin escluso — probabile bug separato)**

---

## TASK 3 — Percorso generazione menu AI (il bug) + creazione sede

### Menu AI (`menu-ai-import`)

Flusso autorizzativo completo:

1. Header `Authorization: Bearer <JWT>` estratto
2. `supabase.auth.getUser(token)` con client service-role → verifica JWT Supabase standard
3. Body parsing: estrae `tenant_id`, `images`, `language_hint`
4. **Tenant access check (linea ~528-540 circa):**
   ```ts
   supabase.from("tenant_memberships").select("id")
     .eq("user_id", user.id).eq("tenant_id", tenant_id).maybeSingle()
   ```
   `supabase` = service-role client → legge senza RLS → owner non trovato → **403**

**Conclusione: owner viene negato. Admin viene ammesso. Conforme al bug report.**

La fix richiederebbe aggiungere un secondo check `OR EXISTS (tenants WHERE owner_user_id = user.id)`
oppure sostituire la query inline con `get_my_tenant_ids()` RPC via client user-JWT (come
negli altri edge functions). Non è in scope questa sessione.

### Creazione sede (`activities.create`)

Percorso: `Businesses.tsx` → `src/services/supabase/activities.ts:createActivity(tenantId, params)`
→ `supabase.from("activities").insert(...)` con client user-JWT → RLS attivo.

RLS INSERT su `activities` (da `20260528120000_rls_activity_scoped.sql:176`):
```sql
has_permission_any_activity('activities.create', tenant_id)
```

`has_permission_any_activity` — Branch 1 = owner via `owner_user_id` ✓.

**Owner NON viene negato nella creazione sede.** Il percorso di creazione sede usa
l'RLS tramite client user-JWT → passa correttamente.

Nota: audit-raw §D.2 riportava la creazione sede come UNGATED permission-wise, ma si riferiva
al check FE (nessun pre-check `usePermissions`). Il check BE via RLS funziona correttamente
per owner.

---

## TASK 4 — Select sede (ActivitySelectorCombobox)

### Come si popolano le opzioni

`getActivities(tenantId)` in `src/services/supabase/activities.ts`:
```ts
supabase.from("activities").select("*").eq("tenant_id", tenantId).order("created_at")
```

Client user-JWT → RLS su `activities` SELECT filtra per `has_permission('activity.read', id)`.
Owner/admin → tutte le activities del tenant.
Manager/staff/viewer → solo le activities assegnate in `tenant_membership_activities`.

La combobox mostra ciò che RLS restituisce — non ha un filtro client-side aggiuntivo.

### Uso nelle pagine

- `/tables`, `/orders`, `/scheduling`, `/analytics`, `/reviews`, `/featured`: `ActivitySelectorCombobox` usa `getActivities(tenantId)` → lista filtrata da RLS per ruolo.
- La sede selezionata viene passata come parametro alle query di dati della pagina (es. `listTablesWithState(tenantId, activityId)`) e ai check permessi activity-scoped.
- NON c'è un pre-filtro FE basato su `perms.activityIds` prima di popolare la combobox. Il filtro passa solo dal backend.

### La sede selezionata scopa i check permessi?

Sì, ma solo nelle pagine che usano `usePermissions`:
- `Reservations.tsx`: `canDoOnActivity(permissions, 'reservations.manage', activityId)` per ogni sede
- Per le altre pagine (`/orders`, `/tables`, ecc.): nessun pre-check FE, enforcement solo da RLS

---

## TASK 5 — Plan-gating (Base/Pro)

### Dove è memorizzato il piano

- `tenants.plan` (text, default `'free'`): piano effective del tenant (valori: `'free'`, `'base'`, `'pro'`)
- `activities.plan_override` (text nullable, FK → `public.plans(code)`): override per-sede
- Piano effective per attività: `COALESCE(activities.plan_override, tenants.plan)`
- Tabella `public.plans`: contiene i codici piano e i feature set associati

### Come viene controllato

Helper `public.activity_has_feature(p_activity_id uuid, p_feature_id text)`:
- SECURITY INVOKER, STABLE
- Risolve `COALESCE(a.plan_override, t.plan)` → lookup in `public.plans` → ritorna boolean

Feature rilevanti:
- `table_ordering` → gate per ordini
- `table_reservation` → gate per prenotazioni

### Dove vengono applicati i check

**Backend (non bypassabile):** BEFORE INSERT triggers su `orders` e `reservations`
(`20260608200606_feature_enforcement_triggers.sql`):
- `enforce_feature_table_ordering_on_orders`: `activity_has_feature(NEW.activity_id, 'table_ordering') IS NOT TRUE` → RAISE EXCEPTION `FEATURE_NOT_AVAILABLE`
- `enforce_feature_table_reservation_on_reservations`: stessa logica per `table_reservation`

**Sidebar UI (best-effort):** `requiresFeature: "table_reservation"` sulla voce "Prenotazioni"
(`Sidebar.tsx:87`).

### Separazione da `useSubscriptionGuard`

`useSubscriptionGuard` (`src/hooks/useSubscriptionGuard.ts`):
```ts
const canEdit = status === "trialing" || status === "active";
```
Controlla SOLO `subscription_status` (billing attivo/trialing). Non legge `tenants.plan`.

**I due gate sono ortogonali e NON confusi:**
- `useSubscriptionGuard.canEdit` = gate billing (abbonamento attivo/trial)
- `activity_has_feature` = gate piano (quale feature è inclusa nel piano)

Nessun codice frontend mescola i due check per lo stesso gating.

---

## TASK 6 — Superficie admin prenotazioni

### Route e componente

- Route: `src/App.tsx:209` → `/business/:businessId/reservations` → `<Reservations />`
- Componente: `src/pages/Dashboard/Reservations/Reservations.tsx`
- Montato dentro `MainLayout` + `PermissionsProvider` (route `/business/:businessId/*`)

### Gate permessi sul componente

```ts
const { permissions, loading: permissionsLoading } = usePermissions();

const canRead = canDoOnAnyActivity(permissions, "reservations.read");
const canManage = canDoOnAnyActivity(permissions, "reservations.manage");

// Locked state:
if (!permissionsLoading && permissions && !canRead) { /* Locked block */ }

// Per-activity manage check:
const canManageActivity = (activityId) =>
    canDoOnActivity(permissions, "reservations.manage", activityId);
```

Usa `usePermissions()` → `get_my_permissions` RPC → owner riceve `role='owner'` + permissions →
`canRead`/`canManage` = true per owner. ✓

### Sidebar gate

`Sidebar.tsx:85-87`:
```ts
{ requiresFeature: "table_reservation" }
```
La voce "Prenotazioni" sparisce dalla sidebar se il piano non include `table_reservation`.
Il gate permesso (`reservations.read`) non è nella `permission` prop della sidebar —
la pagina stessa renderizza il Locked block se `!canRead`.

### Relazione con pagina pubblica prenotazioni

- `/:slug/prenota` → `src/pages/ReservationPage/` — pagina pubblica customer-facing (fuori scope)
- `respond-reservation` edge function → autorizzazione commentata come "RLS-enforced" via `reservations.manage`

---

## Riepilogo percorsi e copertura owner

| Percorso | Meccanismo | Owner gestito |
|---|---|:---:|
| A: RLS + RPC pre-check | `has_permission` / `has_permission_any_activity` via `owner_user_id` Branch 1 | ✓ |
| B: Frontend via `get_my_permissions` | RPC risolve role='owner' → lib helper | ✓ |
| C: Edge fn `_isMemberOfTenant` (5 impl.) | `get_my_tenant_ids()` RPC → Branch A owner | ✓ |
| **D: `menu-ai-import` inline** | **Direct query `tenant_memberships` senza fallback** | **🔴 NO** |
| E: `generate-menu-pdf` check esplicito | `owner_user_id === user.id` — solo owner | ✓ (owner) / 🔴 (admin escluso) |

---

## Fonti divergenti dalla matrice Fase 0

`docs/permissions-matrix.md` non esiste nel repository — il task di questa sessione lo
identifica come reference ma il file è assente. Unica fonte pre-esistente è
`docs/permissions-audit-raw.md`.

Divergenze rilevate rispetto ai dati del raw:

1. **Owner permissions count**: raw ipotizzava 39 (1 mancante), query diretta conferma 40. Il
   file raw annotava l'anomalia come "da verificare" — ora verificata: nessuna mancanza.

2. **Percorso `menu-ai-import` non era mappato in §C.2** del raw (che copriva solo RLS + RPC
   pre-check). Il raw non analizzava edge functions — questa sessione ha trovato il bug in quel
   percorso non coperto.

3. **`generate-menu-pdf` owner-only check** non era mappato. Comportamento inverso rispetto al
   bug principale: blocca admin invece di owner.
