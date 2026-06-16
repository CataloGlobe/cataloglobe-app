-- v_tables_with_state: aggiunta colonna waiter_called_count in coda.
-- Analogo a bill_requested_count (introdotto in 20260603120000).
-- Pattern identico: count(DISTINCT cs.id) FILTER (WHERE expires_at > now() AND waiter_called_at IS NOT NULL).
--
-- IMPORTANTE: include WITH (security_invoker = on) per preservare la fix 20260614114151.
-- Tutte le colonne esistenti riemesse verbatim dall'ultima definizione completa
-- (20260610150000_extend_v_tables_with_state.sql), solo waiter_called_count aggiunta in coda.

CREATE OR REPLACE VIEW public.v_tables_with_state
    WITH (security_invoker = on)
AS
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
    ( SELECT COALESCE(sum(o2.total_amount) FILTER (WHERE (o2.status = ANY (ARRAY['submitted'::text, 'acknowledged'::text, 'ready'::text, 'delivered'::text])) AND o2.is_rectification = false), 0::numeric) - COALESCE(sum(o2.total_amount) FILTER (WHERE (o2.status = ANY (ARRAY['submitted'::text, 'acknowledged'::text, 'ready'::text, 'delivered'::text])) AND o2.is_rectification = true), 0::numeric)
           FROM orders o2
          WHERE o2.table_id = t.id AND o2.cancelled_at IS NULL) AS current_total,
    count(DISTINCT cs.id) FILTER (WHERE cs.expires_at > now() AND cs.bill_requested_at IS NOT NULL) AS bill_requested_count,
    count(DISTINCT o.id) FILTER (WHERE o.status = ANY (ARRAY['submitted'::text, 'acknowledged'::text, 'ready'::text])) AS open_orders_count,
    ( SELECT COALESCE(
          json_agg(
              json_build_object(
                  'id',           o2.id,
                  'status',       o2.status,
                  'total_amount', o2.total_amount,
                  'submitted_at', o2.submitted_at
              )
              ORDER BY o2.submitted_at
          ),
          '[]'::json
      )
      FROM orders o2
      WHERE o2.table_id = t.id
        AND o2.cancelled_at IS NULL
        AND o2.status = ANY (ARRAY['submitted'::text, 'acknowledged'::text, 'ready'::text])
    ) AS active_orders,
    ( SELECT min(cs2.first_seen_at)
      FROM customer_sessions cs2
      WHERE cs2.current_table_id = t.id
        AND cs2.expires_at > now()
    ) AS session_opened_at,
    count(DISTINCT cs.id) FILTER (WHERE cs.expires_at > now() AND cs.waiter_called_at IS NOT NULL) AS waiter_called_count
   FROM tables t
     LEFT JOIN table_zones tz ON tz.id = t.zone_id
     LEFT JOIN customer_sessions cs ON cs.current_table_id = t.id
     LEFT JOIN orders o ON o.table_id = t.id AND o.cancelled_at IS NULL
     LEFT JOIN order_groups og ON og.table_id = t.id
  WHERE t.deleted_at IS NULL
  GROUP BY t.id, tz.name;

COMMENT ON VIEW public.v_tables_with_state IS
    'Stato live per tavolo: sessioni attive, ordini pendenti, totale corrente, richieste conto, chiamate cameriere. Security invoker: RLS delle tabelle sottostanti applicata al chiamante.';
