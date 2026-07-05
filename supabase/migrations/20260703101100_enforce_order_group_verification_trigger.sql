-- BEFORE UPDATE gate on orders. Single statement, no wrapper (db-push rule).
-- CREATE OR REPLACE TRIGGER (PG14+) → idempotent without a separate DROP.
-- WHEN clause: fire only on real status transitions, so updated_at-only touches
-- / version bumps never invoke the gate function.
CREATE OR REPLACE TRIGGER orders_enforce_group_verification
    BEFORE UPDATE ON public.orders
    FOR EACH ROW
    WHEN (NEW.status IS DISTINCT FROM OLD.status)
    EXECUTE FUNCTION public.enforce_order_group_verification();
