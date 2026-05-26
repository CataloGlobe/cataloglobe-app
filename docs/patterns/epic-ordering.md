# Epic Ordinazioni dal tavolo — pattern dettaglio

Riferimento spec autoritativa: `docs/orders-architecture.md` v1.2.
Catalogo 11 Edge Functions: `docs/edge-functions.md`.

## Stato attuale

- **Fase 1** (DB foundations): completata e applicata staging + prod. 10 tabelle, RPC, view, cron setup.
- **Fase 2** (Edge Functions): 11 funzioni deployate, smoke testing OK.
- **Fase 3** (service layer): completata, tsc clean. 4 file service + tipi.
- **Fase 4** (UI admin): da iniziare. Pagina "Tavoli", dashboard ordini live, drawer chiudi tavolo, drawer rettifica, drawer disabilita prodotto, generazione QR PDF.
- **Fase 5** (UI cliente): da iniziare. Pagina pubblica `/t/:qrToken` → menu → cart → submit + lista ordini sessione.
- **Fase 6** (QA + iterazione).

## Dual-auth — pattern fondamentale

L'epic gestisce DUE contesti di autenticazione paralleli:

- **Customer-side** (pagina pubblica ordering): il cliente NON è un Supabase auth user. Riceve un JWT custom firmato HMAC-SHA256 con env `CUSTOMER_JWT_SECRET` (NON `SUPABASE_JWT_SECRET` — prefisso riservato). Il JWT è generato dall'Edge Function `resolve-table` quando il cliente scansiona il QR. Payload contiene `customer_session_id`, `exp` (default 12h).
- **Admin-side** (backoffice tenant): membri del team usano Supabase auth user standard. Auth flow via `supabase.auth`.

Pattern di propagazione del customer JWT al backend:

- **Edge Function customer-side**: `supabase.functions.invoke(name, { body, headers: { Authorization: ` + "`Bearer ${customerJwt}`" + ` } })`. L'Edge ha `verify_jwt = false` in `config.toml`, validation custom via `_shared/customerJwt.ts:verifyCustomerJwt()`.
- **SELECT diretto DB customer-side** (es. `getCurrentCustomerSession`): client transient via `createClient(URL, ANON_KEY, { global: { headers: { Authorization: 'Bearer ' + customerJwt } } })`. RLS anon policies usano `get_jwt_customer_session_id()` helper SQL per filtrare per claim.

## Optimistic locking — transition admin

Le transition state lato admin (`acknowledge-order`, `deliver-order`, `cancel-order-admin`) richiedono `expected_version` nel body. Pattern UPDATE con guard `WHERE id = ? AND version = ? AND status IN (...)` + `version = version + 1`. Se 0 rows aggiornate → 409 `INVALID_STATE_TRANSITION` con `details.reason: "OPTIMISTIC_LOCK_CONFLICT"`.

`orders.version` NON ha trigger DB. Va incrementata esplicitamente nell'UPDATE.

## Error code naming convention

Distinguibili lato UI senza guess:

- `OPTIMISTIC_LOCK_CONFLICT` — race su transition, UI fa toast + re-fetch
- `INVALID_STATE_TRANSITION` — mismatch stato puro (es. deliver su cancelled), UI mostra toast informativo (current_status su `(err as Error & { details }).details`)
- `INVALID_ITEMS` (submitOrder) vs `INVALID_RECTIFICATION_ITEMS` (rectifyOrder) — naming distinto per UI branching
- `TABLE_LABEL_CONFLICT`, `CUSTOMER_NAME_TOO_LONG`, `REASON_TOO_LONG`, `EMPTY_CART`, `EMPTY_RECTIFICATION`, `INVALID_RECTIFICATION_QUANTITY`, `SCOPE_REQUIRED` — validation client-side, fail-fast prima del network

Pattern Error: `throw new Error("CODE")` raw + extension property `(err as Error & { details? }).details = ...` per casi con info aggiuntiva. Tipi `InvalidItemsErrorDetails` e `InvalidStateTransitionErrorDetails` esportati da `orders.ts` per type-safety lato consumer.

## Service layer (`src/services/supabase/`)

- `tables.ts` — 8 funzioni (CRUD soft-delete + regenerate qr_token + generate QR PDF via Edge)
- `customerSessions.ts` — 6 funzioni dual-auth (3 customer + 2 admin + helper privato `buildCustomerClient`)
- `productAvailability.ts` — 3 funzioni (list, count, toggle via Edge)
- `orders.ts` — 8 funzioni dual-auth + helper privati `parseInvokeError`, `throwMappedTransitionError`

Tutti i tipi in `src/types/orders.ts` (single file per coesione dominio ordering).

## Schema facts critici epic ordering

- `tables.qr_token` UUID, DEFAULT `gen_random_uuid()` DB-side. Non fornito dal client su create.
- `tables` soft-delete via `deleted_at timestamptz`. Unique partial `(activity_id, label) WHERE deleted_at IS NULL` (label riusabile dopo soft-delete).
- `tables.maintenance_mode boolean DEFAULT false` (NON `is_active`). Logica invertita: `true` = bloccato per manutenzione.
- `customer_sessions` lifecycle via `expires_at` + cron TTL sweep. NO `deleted_at`, NO trigger expire.
- `customer_sessions` RLS anon: SELECT `id = get_jwt_customer_session_id()`, UPDATE solo su colonna `customer_name` (column-level GRANT).
- `product_availability_overrides` UNIQUE `(activity_id, product_id)` — un override per coppia. NO `variant_product_id`.
- `product_availability_overrides` UPSERT lato Edge, righe leftover con `available=true` post auto-reset cron (funzionalmente equivalenti a "nessuna riga").
- `orders.version int NOT NULL DEFAULT 1` per optimistic locking. Increment applicativo, no trigger.
- `orders.status` CHECK constraint (`submitted` | `acknowledged` | `delivered` | `cancelled`), NON enum DB.
- `order_items.options_snapshot jsonb` shape: `{ primary_option: { group_id, group_name, value_id, value_name } | null, addons: Array<{ ..., price_delta: number }> }`.
- `order_items` immutable (NO `updated_at`, NO trigger). Edge Function `submit-order` è SOLE writer (rettifiche creano nuovo `orders` row).
- `numeric` Postgres serializzato come `string` da supabase-js per SELECT diretti → normalizzazione `Number(x)` nei service `list*WithItems` / `listOrdersForActivity` / `listTablesWithState`. Edge responses sono già JSON con number nativo.
- View `v_tables_with_state` espone: `tables.* + active_sessions_count + pending_orders_count + open_groups_count + current_total` (admin only).
