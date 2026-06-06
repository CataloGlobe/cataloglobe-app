-- v_tables_with_state: rewrite di `current_total` come sub-query
-- correlata, per chiudere DUE bug rimasti dopo 20260605120000:
--
-- BUG 1 — NULL-propagation:
--   espressione (sum_pos - sum_rect) wrappata in COALESCE esterno.
--   sum() su FILTER vuoto ritorna NULL. Tavolo SENZA rettifiche →
--   sum_rect = NULL → (sum_pos - NULL) = NULL → COALESCE(NULL, 0) = 0.
--   Verificato in staging: T1 di San Pietro
--   (8728ead0-7820-45df-9a35-241c5a643836) con 6 ordini in-filter
--   non-rectification = 192.00 e zero rettifiche → view ritorna 0.
--
-- BUG 2 — fan-out su LEFT JOIN sessioni × gruppi:
--   la view fa LEFT JOIN a customer_sessions e order_groups oltre a
--   orders, tutti su t.id. I count(DISTINCT ...) sono fan-out-safe
--   ma sum(o.total_amount) viene moltiplicato per
--   (n_sessioni × n_gruppi). Su T1 (3 sessioni × 3 gruppi = 9x), una
--   volta fixato il bug 1, il totale sarebbe gonfiato di 9 volte.
--
-- FIX: ricalcolare `current_total` via sub-query correlata sulla
-- tabella orders (fuori dai LEFT JOIN a sessioni/gruppi → no fan-out),
-- con COALESCE su OGNI sum() prima della sottrazione (no NULL-
-- propagation), filtro status include 'ready' (ordine ready = parte
-- del conto), `cancelled_at IS NULL` per escludere annullati. Identica
-- coorte di rectification per sum_pos e sum_rect, sottratti.
--
-- Tutto il resto della view VERBATIM da pg_get_viewdef live:
-- stesse 18 colonne in stesso ordine, count(DISTINCT) invariati,
-- FROM/JOIN/WHERE/GROUP BY invariati. Nessuna reloption (no
-- security_invoker; fix RLS view-as-owner e' task separato).

CREATE OR REPLACE VIEW public.v_tables_with_state AS
 SELECT t.id,
    t.tenant_id,
    t.activity_id,
    t.label,
    t.qr_token,
    t.seats,
    t.zone_id,
    tz.name AS zone_name,
    t.maintenance_mode,
    t.deleted_at,
    t.created_at,
    t.updated_at,
    count(DISTINCT cs.id) FILTER (WHERE cs.expires_at > now()) AS active_sessions_count,
    count(DISTINCT o.id) FILTER (WHERE o.status = ANY (ARRAY['submitted'::text, 'acknowledged'::text])) AS pending_orders_count,
    count(DISTINCT og.id) FILTER (WHERE og.status = 'open'::text) AS open_groups_count,
    (SELECT COALESCE(sum(o2.total_amount) FILTER (WHERE o2.status = ANY (ARRAY['submitted'::text, 'acknowledged'::text, 'ready'::text, 'delivered'::text]) AND o2.is_rectification = false), 0::numeric)
          - COALESCE(sum(o2.total_amount) FILTER (WHERE o2.status = ANY (ARRAY['submitted'::text, 'acknowledged'::text, 'ready'::text, 'delivered'::text]) AND o2.is_rectification = true), 0::numeric)
     FROM public.orders o2
     WHERE o2.table_id = t.id AND o2.cancelled_at IS NULL) AS current_total,
    count(DISTINCT cs.id) FILTER (WHERE cs.expires_at > now() AND cs.bill_requested_at IS NOT NULL) AS bill_requested_count,
    count(DISTINCT o.id) FILTER (WHERE o.status = ANY (ARRAY['submitted'::text, 'acknowledged'::text, 'ready'::text])) AS open_orders_count
   FROM tables t
     LEFT JOIN table_zones tz ON tz.id = t.zone_id
     LEFT JOIN customer_sessions cs ON cs.current_table_id = t.id
     LEFT JOIN orders o ON o.table_id = t.id AND o.cancelled_at IS NULL
     LEFT JOIN order_groups og ON og.table_id = t.id
  WHERE t.deleted_at IS NULL
  GROUP BY t.id, tz.name;

COMMENT ON VIEW public.v_tables_with_state IS
    'Tavoli arricchiti con stato derivato. `pending_orders_count` = '
    'submitted+acknowledged (UI "in cucina"). `open_orders_count` = '
    'submitted+acknowledged+ready (UI "aperti", base per gate di '
    'close-table). `current_total` calcolato via sub-query correlata '
    'su orders (fuori dai LEFT JOIN sessioni/gruppi, no fan-out): '
    'somma `total_amount` su submitted+acknowledged+ready+delivered '
    '(non-rectification) meno la stessa coorte rectification. '
    '`cancelled` escluso. COALESCE su ogni sum() per neutralizzare '
    'NULL-propagation (tavolo senza rettifiche). Non includere '
    '`delivered` ne'' `cancelled` nei conteggi count.';
