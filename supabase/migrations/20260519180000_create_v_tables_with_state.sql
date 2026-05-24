-- =========================================
-- ORDERS EPIC — Phase 1.8: view v_tables_with_state
-- =========================================
-- Authoritative source for the admin "Tavoli attivi" dashboard at
-- /business/:businessId/orders/:activityId. Joins each `tables` row with
-- live aggregates derived from `customer_sessions`, `orders`, and
-- `order_groups` — there is intentionally no `status` column on
-- `public.tables`; "free vs occupied" is always recomputed here so that
-- the dashboard cannot drift out of sync with the underlying state.
--
-- Derived columns:
--   - active_sessions_count : guests whose JWT/session is still alive
--                             (`expires_at > now()`).
--   - pending_orders_count  : orders awaiting admin action
--                             (status IN submitted / acknowledged).
--   - open_groups_count     : open shared-bill groups (typically 0 or 1).
--   - current_total         : table bill so far, excluding cancellations
--                             and netting rectifications.
--
-- `current_total` rationale (combines architecture §4.5 and §9.2):
--   The simplified formula in §4.5 (SUM of total_amount for non-cancelled
--   orders) would *add* rectification tickets, inflating the bill.
--   Rectifications carry a positive `total_amount` that semantically
--   represents "how much to subtract from the parent order" — so the bill
--   computation must split orders by `is_rectification` and subtract the
--   second sum from the first:
--
--     SUM(total_amount) WHERE NOT is_rectification
--     - SUM(total_amount) WHERE is_rectification
--
--   `COALESCE(... , 0)` keeps the column non-NULL for tables with no orders.
--
-- Filters applied at JOIN time:
--   - `t.deleted_at IS NULL`     → soft-deleted tables are hidden entirely.
--   - `o.cancelled_at IS NULL`   → cancelled orders do not contribute to
--                                   any metric (counts or sums).
--
-- Security model:
--   - `WITH (security_invoker = true)` → the view runs under the caller's
--     privileges, so the per-tenant RLS on the underlying tables
--     (`public.tables`, `public.customer_sessions`, `public.orders`,
--     `public.order_groups`) is enforced as if the caller queried them
--     directly. No separate RLS / policies are defined on the view itself.
--   - SELECT is granted only to `authenticated`; the guest (`anon`) role
--     never reads this view — admin-only by design.

BEGIN;

CREATE OR REPLACE VIEW public.v_tables_with_state
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
  ) AS current_total
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

-- Admin-only access. Anon (guest) never reads this view.
GRANT SELECT ON public.v_tables_with_state TO authenticated;

COMMIT;
