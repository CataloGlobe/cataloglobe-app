-- AFTER UPDATE cleanup on orders. Single statement, no wrapper (db-push rule).
CREATE OR REPLACE TRIGGER orders_close_empty_unverified_group
    AFTER UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.close_empty_unverified_group();
