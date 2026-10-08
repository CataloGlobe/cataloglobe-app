# Orders — pagina Comande

Regole epic in root `CLAUDE.md` (`## Epic Ordinazioni dal tavolo`), spec `docs/orders-architecture.md`.

Pagina Ordini (`src/pages/Dashboard/Orders/`):
- Solo la board a 3 colonne Nuove/In lavorazione/Pronte, con «Tutti i tavoli» in testata (lotto B-a). `?tab=storico` reindirizza alla voce Storico della sede (delivered + cancelled della giornata operativa, Ripristina sui delivered — Step 5b, `OrdersHistory.tsx`), `?tab=tavoli` alla Mappa di Servizio (`servizio?modo=mappa`).
- Rotta di sede `/locations/:activityId/comande` (sede dal path, §46.1); `/orders` reindirizza all'ultima sede usata. Nessun selettore di sede in pagina.
- Niente auto-refresh: aggiornamento via realtime (`useActiveOrdersRealtime`) + bottone «Aggiorna» manuale.
- Service helper `orders.ts:listOrdersHistoryToday` — boundary "giornata operativa" calcolata server-side via RPC `get_operative_day_start()` (migration `20260601150000`). Formula `date_trunc('day', now() AT TIME ZONE 'Europe/Rome') AT TIME ZONE 'Europe/Rome'` — DST-aware, no off-by-1h ai cambi stagionali (29/3 + 25/10). Funzione `SECURITY INVOKER`, `SET search_path TO ''`, GRANT solo `authenticated`. `listOrdersHistoryToday` (Step 5b): `.eq('tenant_id') + .eq('activity_id')` esplicito (defense in depth oltre RLS) + `.or(and(status.eq.delivered,delivered_at.gte.X),and(status.eq.cancelled,cancelled_at.gte.X))` per la disgiunzione del filtro temporale; sort `updated_at DESC` (coincide con `delivered_at`/`cancelled_at` come exit-timestamp; rectify-order non muta il parent). TODO multi-region: parametrizzare il timezone via `activities.iana_timezone` quando arriveranno tenant non-IT.

## Realtime

**Realtime su `orders`** (Step 4b): tabella `orders` in publication `supabase_realtime` (insieme a `customer_sessions`, `order_groups`, `notifications`). RLS SELECT su `orders` filtra automaticamente i `postgres_changes` per il subscriber autenticato:
- Customer JWT custom: policy `customer_session_id = get_jwt_customer_session_id()`
- Admin user JWT: policy `has_permission('orders.read', activity_id)`

Nessun leak cross-tenant: il server realtime non emette eventi per righe non visibili via RLS SELECT del subscriber.

Hook admin: `src/pages/Dashboard/Orders/hooks/useActiveOrdersRealtime.ts`. Subscribe con filter `activity_id=eq.<id>` (volume reduction; RLS è la security boundary). Pattern: initial fetch via REST (`listOrdersForActivity` con status `['submitted','acknowledged','ready']`) + subscribe `postgres_changes` event=`*`. UPDATE applica patch con **version-max gate** (`new.version > local.version`) — scarta echi della propria azione e update stale. Se nuovo status non-attivo (`delivered`/`cancelled`) → drop dalla board + callback `onOrderLeftBoard` (parent refresha KPI). INSERT triggera silent refetch (postgres_changes NON delivera `items[]`). Re-SUBSCRIBED → refetch (colma eventi persi durante disconnect, wifi sala flaky). Cleanup canale on unmount/activityId-change.

Hook customer: `subscribeToSessionOrders` (in `orders.ts`), già pre-Step 4b. RLS via JWT custom `customer_session_id`. Pattern singleton `supabase.realtime.setAuth(jwt)` (no riconnessione WS, swap auth contesto).

Transition: bottone loading durante invoke (NO optimistic-move). Post-success: `applyLocalPatch(response)` con `(status, version, timestamp)` — realtime echo deduplicato dal version-max. Errori discriminati: `OPTIMISTIC_LOCK_CONFLICT` → toast warning + refetch silenzioso. `INVALID_STATE_TRANSITION` → toast error con `details.current_status` + refetch.
