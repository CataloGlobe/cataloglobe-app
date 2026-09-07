-- ============================================================================
-- v_tables_with_state — espone i campi prenotazione aggiunti su `tables`
-- ============================================================================
-- La view elenca le colonne una per una (non `t.*`), quindi le colonne nuove
-- non comparirebbero mai. Aggiunte IN CODA per non spostare quelle esistenti.
-- Nuovo LEFT JOIN su table_combination_groups per il nome del gruppo, stesso
-- trattamento gia' riservato a table_zones.
-- security_invoker = true ribadito esplicitamente (vedi 20260614114151): la
-- view non deve mai bypassare la RLS di `tables`.
-- ============================================================================

CREATE OR REPLACE VIEW public.v_tables_with_state
WITH (security_invoker = true) AS
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
           FROM public.orders o2
             JOIN public.order_groups og2 ON og2.id = o2.order_group_id AND og2.status = 'open'::text
          WHERE o2.table_id = t.id AND o2.cancelled_at IS NULL) AS current_total,
    count(DISTINCT cs.id) FILTER (WHERE cs.expires_at > now() AND cs.bill_requested_at IS NOT NULL) AS bill_requested_count,
    count(DISTINCT o.id) FILTER (WHERE o.status = ANY (ARRAY['submitted'::text, 'acknowledged'::text, 'ready'::text])) AS open_orders_count,
    ( SELECT COALESCE(json_agg(json_build_object('id', o2.id, 'status', o2.status, 'total_amount', o2.total_amount, 'submitted_at', o2.submitted_at) ORDER BY o2.submitted_at), '[]'::json)
           FROM public.orders o2
          WHERE o2.table_id = t.id AND o2.cancelled_at IS NULL AND (o2.status = ANY (ARRAY['submitted'::text, 'acknowledged'::text, 'ready'::text]))) AS active_orders,
    ( SELECT min(o2.submitted_at)
           FROM public.orders o2
             JOIN public.order_groups og2 ON og2.id = o2.order_group_id AND og2.status = 'open'::text
          WHERE o2.table_id = t.id AND o2.cancelled_at IS NULL) AS session_opened_at,
    count(DISTINCT cs.id) FILTER (WHERE cs.expires_at > now() AND cs.waiter_called_at IS NOT NULL) AS waiter_called_count,
    -- Campi prenotazione (migration 20260907120100).
    t.min_seats,
    t.max_seats,
    t.combination_group_id,
    cg.name AS combination_group_name,
    t.assignment_priority,
    t.bookable_online
   FROM public.tables t
     LEFT JOIN public.table_zones tz ON tz.id = t.zone_id
     LEFT JOIN public.table_combination_groups cg ON cg.id = t.combination_group_id
     LEFT JOIN public.customer_sessions cs ON cs.current_table_id = t.id
     LEFT JOIN public.orders o ON o.table_id = t.id AND o.cancelled_at IS NULL
     LEFT JOIN public.order_groups og ON og.table_id = t.id
  WHERE t.deleted_at IS NULL
  GROUP BY t.id, tz.name, cg.name;
