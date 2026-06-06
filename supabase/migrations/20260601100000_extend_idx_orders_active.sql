-- Step 4a: extend the partial index idx_orders_active to cover the new
-- 'ready' status (Step 3.5). The admin kanban (Step 4b) will query
-- "active" orders as status IN ('submitted','acknowledged','ready'), so
-- the index needs to match the new predicate to stay useful.
--
-- Plain DROP + CREATE at current scale (low row count, dev/staging). At
-- production scale this should be done with `CREATE INDEX CONCURRENTLY`
-- outside a transaction to avoid locking writes — switch the pattern
-- before promoting to prod if order volume grows significantly.

DROP INDEX IF EXISTS public.idx_orders_active;

CREATE INDEX idx_orders_active
    ON public.orders USING btree (activity_id, status)
    WHERE (status = ANY (ARRAY['submitted'::text, 'acknowledged'::text, 'ready'::text]));
