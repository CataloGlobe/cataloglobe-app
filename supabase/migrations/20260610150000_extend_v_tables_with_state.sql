-- Extend v_tables_with_state with two new columns appended in-place (non-breaking):
--   active_orders      — JSON array ({ id, status, total_amount, submitted_at }) of orders in
--                        active states (submitted|acknowledged|ready), ordered by submitted_at.
--                        Returns '[]'::json (never NULL) when no active orders exist.
--   session_opened_at  — earliest first_seen_at of active sessions (expires_at > now()) for
--                        the table; NULL when no active session. Used by card overview "da N min".
--
-- Both new columns use correlated subqueries (same pattern as current_total) to avoid row
-- duplication from the multi-way LEFT JOIN in the outer query.
-- Active-order criterion: same as open_orders_count  → status IN ('submitted','acknowledged','ready') + cancelled_at IS NULL
-- Active-session criterion: same as active_sessions_count → expires_at > now()

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
    ) AS session_opened_at
   FROM tables t
     LEFT JOIN table_zones tz ON tz.id = t.zone_id
     LEFT JOIN customer_sessions cs ON cs.current_table_id = t.id
     LEFT JOIN orders o ON o.table_id = t.id AND o.cancelled_at IS NULL
     LEFT JOIN order_groups og ON og.table_id = t.id
  WHERE t.deleted_at IS NULL
  GROUP BY t.id, tz.name;
