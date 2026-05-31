-- ═══════════════════════════════════════════════════════════════
-- Add bill request capability to customer sessions
-- ═══════════════════════════════════════════════════════════════
-- Customer "Chiedi il conto" da OrderingSheet tab Ordini.
-- bill_requested_at NULL = no request, timestamp = staff notificato.
-- Implicit clear via close-table (vedi Edge function close-table).
-- ═══════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.customer_sessions
    ADD COLUMN IF NOT EXISTS bill_requested_at timestamptz;

-- Partial index per ricerca admin "tavoli con conto richiesto"
CREATE INDEX IF NOT EXISTS customer_sessions_bill_pending_idx
    ON public.customer_sessions (current_table_id)
    WHERE bill_requested_at IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════
-- Refresh v_tables_with_state: aggiunge bill_requested_count
-- ═══════════════════════════════════════════════════════════════
-- Drop + Create perchè le view non supportano ALTER ADD COLUMN.
-- Preserva la definizione esistente (vedi 20260519180000), aggiunge
-- bill_requested_count alla fine.

DROP VIEW IF EXISTS public.v_tables_with_state;

CREATE VIEW public.v_tables_with_state
WITH (security_invoker = true)
AS
SELECT
  t.*,
  COUNT(DISTINCT cs.id) FILTER (WHERE cs.expires_at > now())
    AS active_sessions_count,
  COUNT(DISTINCT o.id) FILTER (WHERE o.status IN ('submitted', 'acknowledged'))
    AS pending_orders_count,
  COUNT(DISTINCT og.id) FILTER (WHERE og.status = 'open')
    AS open_groups_count,
  COALESCE(
    SUM(o.total_amount) FILTER (
      WHERE o.status IN ('submitted', 'acknowledged', 'delivered')
        AND o.is_rectification = false
    )
    -
    SUM(o.total_amount) FILTER (
      WHERE o.status IN ('submitted', 'acknowledged', 'delivered')
        AND o.is_rectification = true
    ),
    0
  ) AS current_total,
  -- NUOVO: count sessions attive che hanno chiesto il conto
  COUNT(DISTINCT cs.id) FILTER (
    WHERE cs.expires_at > now() AND cs.bill_requested_at IS NOT NULL
  ) AS bill_requested_count
FROM public.tables t
LEFT JOIN public.customer_sessions cs
  ON cs.current_table_id = t.id
LEFT JOIN public.orders o
  ON o.table_id = t.id
 AND o.cancelled_at IS NULL
LEFT JOIN public.order_groups og
  ON og.table_id = t.id
WHERE t.deleted_at IS NULL
GROUP BY t.id;

GRANT SELECT ON public.v_tables_with_state TO authenticated;

COMMIT;
