# Maintenance Mode Audit — CataloGlobe staging

Data: 2026-05-28
Modalita: read-only. Nessuna modifica al codice / DB / deploy.
Scope: capire cosa controllano oggi le Edge functions dell'epic Ordinazioni rispetto a stati che potrebbero bloccare un ordine in arrivo, prima di implementare maintenance mode mid-session.

---

## Area 1 — Schema DB stati attuali

### `tenants` (colonne rilevanti)

| Campo | Tipo | Nullable | Default | Note |
|---|---|---|---|---|
| `subscription_status` | text | NO | `'trialing'` | NON enum, NO check vincolo DB. Valori in uso (mappati da `stripe-webhook`): `trialing` / `active` / `past_due` / `suspended` / `canceled`. |
| `deleted_at` | timestamptz | YES | NULL | Soft-delete tenant (30 giorni recovery). |
| `trial_until` | timestamptz | YES | NULL | Fine periodo trial (informativo). |
| `locked_at` | timestamptz | YES | NULL | Lock tenant. |
| `stripe_subscription_id` | text | YES | NULL | — |
| `plan` | text | NO | `'pro'` | — |

NESSUN flag `is_active` globale tenant — derivato da `subscription_status` + `deleted_at`.

### `activities` (colonne rilevanti)

| Campo | Tipo | Nullable | Default | Note |
|---|---|---|---|---|
| `status` | text | NO | `'active'` | NON enum. UI usa `active` / `inactive` (label "Pubblicata"/"Sospesa"). |
| `inactive_reason` | text | YES | NULL | Mappato via `formatInactiveReason()`. |
| **`deleted_at`** | **NON ESISTE** | — | — | Activity NON ha soft-delete (eliminazione fisica via `delete-business`). |
| `is_ordering_enabled` | **NON ESISTE** | — | — | Nessun flag dedicato ordinazioni a livello sede. |

### `tables` (colonne rilevanti)

| Campo | Tipo | Nullable | Default | Note |
|---|---|---|---|---|
| `maintenance_mode` | boolean | NO | `false` | **Flag esistente per-tavolo** (manuale, admin Tables page). |
| `deleted_at` | timestamptz | YES | NULL | Soft-delete tavolo. |
| `qr_token` | uuid | NO | `gen_random_uuid()` | — |

### `customer_sessions`

Nessun campo `paused`/`maintenance`. `expires_at` + `bill_requested_at` gia presenti.

### Risposta diretta

- **`is_ordering_enabled` esiste?** NO. Esiste solo `tables.maintenance_mode` per-tavolo (granularita troppo fine per scenari tenant/activity).
- **Campo equivalente per sede?** NESSUNO. Da introdurre: o `activities.ordering_enabled boolean DEFAULT true` o `activities.ordering_status text` (es. `live|paused|disabled`).
- **Campo equivalente per tenant?** Derivabile da `tenants.subscription_status IN ('active','trialing')` + `tenants.deleted_at IS NULL`. Sufficiente per maintenance mode automatico billing-driven. Per pause manuale tenant → flag aggiuntivo.

---

## Area 2 — `resolve-table` check attuali

File: `supabase/functions/resolve-table/index.ts` + RPC `public.resolve_table_by_token`.

### Cosa controlla

RPC `resolve_table_by_token(p_token uuid)`:

```sql
WHERE t.qr_token = p_token
  AND t.deleted_at IS NULL
  AND a.status = 'active'
```

→ filtra **table soft-deleted** + **activity inactive**. **NESSUN check** su `tenants.subscription_status` o `tenants.deleted_at`.

Edge `resolve-table`:
1. Rate-limit per qr_token (10/min).
2. Chiama RPC sopra → se 0 righe = `TableNotFoundError`.
3. Check `table.maintenance_mode` → `TableMaintenanceError`.
4. Resolve / create `customer_sessions` row → sign customer JWT.

### Errori restituiti

| Caso | HTTP | code | message |
|---|---|---|---|
| `qr_token` non UUID | 400 | `INVALID_REQUEST` | "qr_token non valido" |
| Token inesistente / table deleted / activity inactive | 404 | `TABLE_NOT_FOUND` | "Tavolo non trovato o non più attivo." |
| Tavolo in manutenzione | **423** | `TABLE_MAINTENANCE` | dinamico con label/zone |
| Rate limit | 429 | `RATE_LIMITED` | + `retry_after_seconds` |
| Server error | 500 | `INTERNAL_ERROR` | generico |

### Gap rispetto a maintenance mode

- **Tenant scaduto / soft-deleted**: 0 controllo. Cliente passa, ottiene JWT, puo iniziare ordine. Activity con `status='active'` su tenant con `subscription_status='canceled'` → resolve-table risponde 200 OK.
- **Distinzione 404**: 4 cause diverse collassate in stesso codice (token inesistente, table deleted, activity inactive, tenant canceled). Customer UI non puo differenziare.

### UI customer

`src/pages/TableEntryPage/TableEntryPage.tsx`:
- Stati: `loading` / `error`.
- Su errore mostra `<h1>Ops</h1><p>{state.message}</p>` — nessun mapping per code specifico, nessun branding per "abbonamento scaduto", "tavolo in manutenzione", "sede chiusa". Tutto = stesso fallback.
- Su successo: `saveCustomerSession()` + `navigate("/<slug>")`.

---

## Area 3 — `submit-order` check attuali

File: `supabase/functions/submit-order/index.ts` + RPC `public.submit_order_atomic` + shared `_shared/validateOrderItems.ts`.

### Cosa controlla Edge + RPC

Pipeline Edge:
1. Parse + validate body (`activity_id`, `table_id`, `items` UUID/shape).
2. `verifyCustomerJwt` → estrai `customer_session_id`.
3. Pre-fetch session → discriminate 404 `SESSION_NOT_FOUND` / 409 `SESSION_EXPIRED`.
4. Rate-limit per `customer_session_id` (10/min).
5. **`validateAndSnapshotOrderItems`**: ri-deriva tenant_id / activity_id / table_id dalla session, risolve catalogo attivo, valida options/availability prodotti, ricalcola prezzi server-side. Trust boundary: `tenant_id` / `activity_id` / `table_id` MAI dal client.
6. Invoke `submit_order_atomic`: defensive param validation (NOT NULL, total > 0, items non-empty array), group conflict check (group esiste / open / same table / same tenant), INSERT `order_groups` (lazy) → INSERT `orders` → INSERT batch `order_items` → UPDATE `customer_sessions.last_activity_at`.

### Check ESPLICITI mancanti

| Check | Edge | Validator | RPC |
|---|---|---|---|
| `tenants.subscription_status` | NO | NO | NO |
| `tenants.deleted_at` | NO | NO | NO |
| `activities.status` | NO | NO (validator non legge `activities.status`) | NO |
| `tables.deleted_at` | NO | NO | NO |
| `tables.maintenance_mode` | NO | NO | NO |
| `tables.activity_id == session.activity_id` | (validator ri-deriva da session, non legge tables.status) | — | NO |

### Errori restituiti

`SESSION_NOT_FOUND` 404, `SESSION_EXPIRED` 409, `INVALID_ITEMS` 422, `GROUP_CONFLICT` 409, `RATE_LIMITED` 429, `INTERNAL_ERROR` 500. **Nessun codice maintenance / ordering disabled / subscription inactive**.

### Gap rispetto a maintenance mode

Cliente con sessione attiva (resolved 10 min fa, JWT 12h valido) puo inviare ordine anche se:
- Tenant nel frattempo `subscription_status='canceled'`.
- Tenant nel frattempo `deleted_at IS NOT NULL` (soft-deleted).
- Activity nel frattempo `status='inactive'`.
- Tavolo nel frattempo `maintenance_mode=true` o `deleted_at IS NOT NULL`.
- Admin attivasse "ordering paused" sull'activity (campo non esistente).

→ Maintenance mode mid-session = **completamente non gestito**.

---

## Area 4 — Altre Edge ordering — bloccanti vs accessibili

| Edge | Auth | Check stati attuali | In maintenance mode |
|---|---|---|---|
| `resolve-table` | nessuna (pubblico) | activity.status, table.deleted_at, table.maintenance_mode | **BLOCCANTE** (entry point nuova sessione) |
| `submit-order` | customer JWT | session valida + items validi | **BLOCCANTE** (write nuovo ordine) |
| `get-orders-for-session` | customer JWT | session valida | **ACCESSIBILE** (lettura ordini pregressi) |
| `request-bill` | customer JWT | session valida + bill not yet requested | **ACCESSIBILE** (richiesta verso staff, va consegnata anche se ordering paused) |
| `cancel-order` (customer) | customer JWT | session valida + order owned + status='submitted' | **ACCESSIBILE** (cliente puo annullare ordine appena inviato, anche se nel mentre admin ha sospeso) |
| `acknowledge-order` / `deliver-order` / `cancel-order-admin` / `rectify-order` | admin user JWT + membership | optimistic lock + state transition | **ACCESSIBILE** (admin gestisce ordini gia entrati) |
| `close-table` | admin user JWT + membership | tavolo + group open | **ACCESSIBILE** (admin chiude tavolo) |
| `toggle-product-availability` | admin user JWT + membership | activity exists + product cross-tenant coherence | **ACCESSIBILE** (admin scope) |
| `generate-table-qrs` | admin user JWT + membership + rate-limit | activity exists | **ACCESSIBILE** (admin scope) |

**Bloccanti = 2** (`resolve-table` + `submit-order`). Le altre devono restare disponibili per non rompere flusso ordini in flight.

---

## Area 5 — UI customer error handling

### Pattern attuale

`src/pages/TableEntryPage/TableEntryPage.tsx`:
- Toast: NO.
- Full-page error: SI ma generico (`<h1>Ops</h1><p>{message}</p>`).
- NO mapping codici (`TABLE_NOT_FOUND`, `TABLE_MAINTENANCE`, ecc.).
- NO icone, NO CTA "Riprova" / "Chiama lo staff".

`src/components/PublicCollectionView/CollectionView/CollectionView.tsx` (linea 1003):
- Su submit-order error: solo discrimination su `SESSION_EXPIRED` (toast + redirect). Tutti gli altri errori → toast generico.

`src/services/supabase/orders.ts` (linee 99-235):
- Mapping i18n italiano per `SESSION_EXPIRED`, `SESSION_NOT_FOUND`, 429, 500. **Niente per maintenance / subscription / activity inactive**.

### Componenti dedicati

- **NON ESISTE** componente "ordering disabled".
- **NON ESISTE** componente "abbonamento scaduto" public-facing.
- **NON ESISTE** componente "sede in chiusura".

Si appoggiano tutti al fallback `<h1>Ops</h1>` di TableEntryPage o a toast generico.

---

## Area 6 — UI admin ordering toggle

### Stato attuale

`src/pages/Dashboard/Tables/Tables.tsx`:
- Drawer create/edit tavolo ha gia switch `formMaintenanceMode` (campo wired su `tables.maintenance_mode`).
- Filter `statusFilter='maintenance'` per vedere tavoli in manutenzione.
- Visualizzazione: cell mostra badge "maintenance" se `row.maintenance_mode`.

→ **Granularita per-tavolo OK**. Pattern UI/wiring gia esistente.

### Manca

- **Toggle per-attivita** ("disabilita ordinazioni per questa sede"): NESSUNO. Posizione naturale: `src/pages/Business/Location/ActivitySettingsTab.tsx` (gia esistente, draft-unsaved-bar pattern). Nuovo campo `activities.ordering_enabled` + switch.
- **Toggle per-tenant** ("disabilita ordinazioni globalmente"): NESSUNO. Probabilmente non necessario per MVP — automatico via `subscription_status`.
- **Banner admin** "abbonamento scaduto, customer side bloccato": NESSUNO. Da aggiungere su `MainLayout` se `subscription_status NOT IN ('active','trialing')`.

---

## SINTESI

### Cosa serve aggiungere PRIMA del maintenance mode

| # | Item | Layer | Effort |
|---|---|---|---|
| 1 | Migration: `activities.ordering_enabled boolean NOT NULL DEFAULT true` | DB | LOW (1 file migration) |
| 2 | Nuovi error code Edge: `ORDERING_DISABLED_TENANT`, `ORDERING_DISABLED_ACTIVITY`, `TENANT_SUSPENDED` | shared `_shared/errors.ts` o costanti dedicate | LOW |
| 3 | Funzione helper `_checkTenantActivityOrderingState(supabase, tenantId, activityId)` — restituisce `{ok}` o `{kind: 'tenant_suspended'|'tenant_deleted'|'activity_inactive'|'ordering_disabled'}` | `_shared/orderingState.ts` (nuovo) | MEDIUM |

### Cosa serve modificare in Edge esistenti

| Edge | Modifica | Effort |
|---|---|---|
| `resolve-table` | + check helper sopra → restituisci 423 con codice specifico (anziché collassare in 404) | LOW |
| `submit-order` | + check helper sopra prima di `validateAndSnapshotOrderItems` → 423 specifico | LOW |
| `request-bill` / `cancel-order` / `get-orders-for-session` | **nessuna modifica** (devono restare accessibili) | — |
| `validateAndSnapshotOrderItems` | opzionale: anche qui per defense-in-depth | LOW |

### Cosa serve aggiungere lato UI customer

| Item | File | Effort |
|---|---|---|
| Map nuovi codici → messaggio i18n | `src/services/supabase/orders.ts` + `customerSessions.ts` | LOW |
| Componente full-page "Ordinazioni non disponibili" con CTA "Chiama lo staff" | `src/pages/TableEntryPage/` o nuovo `src/components/PublicCollectionView/OrderingDisabledScreen.tsx` | MEDIUM |
| Branch render in TableEntryPage su codice specifico | `TableEntryPage.tsx` | LOW |
| Toast su CollectionView se ordering disabilitato mid-session (post submit-order error) → forzato redirect | `CollectionView.tsx` | LOW |

### Cosa serve aggiungere lato UI admin

| Item | File | Effort |
|---|---|---|
| Switch "Abilita ordinazioni" su settings sede | `src/pages/Business/Location/ActivitySettingsTab.tsx` (draft-unsaved-bar pattern) | LOW |
| Service helper: `updateActivityOrderingEnabled(id, tenantId, enabled)` | `src/services/supabase/activities.ts` | LOW |
| Banner globale tenant `subscription_status NOT IN ('active','trialing')` | `MainLayout` / `SubscriptionBanner` esistente (estendere) | LOW |

### Effort totale stimato

| Blocco | Effort |
|---|---|
| DB migration + Edge changes | 4-6h |
| Helper shared orderingState | 2-3h |
| UI customer screen + i18n | 4-6h |
| UI admin switch + banner | 3-4h |
| Test + verifica regression | 3-4h |
| **TOTALE** | **16-23h** (2-3 giornate) |

### Decisioni di design aperte

1. **Granularita campo nuovo**: `activities.ordering_enabled boolean` (binario) vs `activities.ordering_state text` (`live|paused|maintenance` per future estensioni). Suggerimento: boolean ora, refactor a text se servira piu stati.
2. **Maintenance vs disabled in 423 response**: usare un solo codice generico `ORDERING_UNAVAILABLE` con `reason` payload, oppure codici separati per ogni causa? Suggerimento: codici separati (frontend puo customizzare messaggi/cta).
3. **Visibilita catalogo se ordering disabled**: cliente vede ancora menu (read-only) o blocco totale? Suggerimento: read-only (la pagina pubblica `/:slug` resta accessibile via `resolve-public-catalog`, che NON e influenzato da questo flag).
4. **Behavior cliente con sessione attiva mid-disable**: forzare logout (resolve nuovo richiede nuovo scan) o lasciare visualizzazione ordini + request-bill funzionanti? Suggerimento: secondo (sessione resta utile per request-bill + status ordini pregressi).
5. **Comportamento se tenant `subscription_status='trialing'`**: ordering ABILITATO (memoria progetto: trial = full access). Confermare.

---

### Decisioni ad-hoc (turno corrente)

1. Skipped lettura completa `validateAndSnapshotOrderItems` body (~400 righe) — grep su keyword status/subscription/deleted ha restituito vuoto, sufficiente per confermare gap.
2. Non testato comportamento attuale su staging (es. fake tenant canceled + tentativo submit) — analisi solo statica codice + schema.
3. Assunto che `subscription_status='trialing'` debba essere considerato "ordering ENABLED" come `active` (memoria progetto: trial = full features).
4. Non disegnato wireframe screen "Ordinazioni non disponibili" — fuori scope audit.
5. `tables.maintenance_mode` esistente NON va deprecato — utile per "tavolo singolo fuori uso" indipendente da maintenance globale.

### Anomalie

1. `resolve_table_by_token` filtra `activities.status='active'` ma RIBALTA il check in 404 generico `TABLE_NOT_FOUND` — UX confusionaria: cliente con QR valido su sede chiusa vede "tavolo non trovato".
2. `activities` NON ha `deleted_at` (al contrario di tenants/tables). Eliminazione hard via `delete-business`. Inconsistenza schema soft-delete.
3. `tenants.subscription_status` e text libero senza CHECK constraint — qualunque stringa puo essere salvata. Defense-in-depth assente.
4. Pattern doppio: `tables.maintenance_mode` per-tavolo (boolean) coesiste con assenza totale di flag analogo per `activities` — coerenza schema da rivedere quando si introduce `ordering_enabled`.

---

**Stato**: audit completo. Pronto per turno implementativo (migration + Edge + UI) come blocchi sequenziali.
