-- =============================================================================
-- CG-09: il gruppo ordini deve appartenere alla stessa sede della riga (trigger).
-- =============================================================================
--
-- Funzione e motivazione: 20260930150600_cg09_order_group_same_activity_fn.
--
-- UPDATE OF order_group_id, activity_id: i cambi di stato degli ordini non
-- pagano la lettura. Se uno stesso UPDATE cambia gruppo e stato, un rifiuto
-- di questo trigger annulla l'intero statement, compresi gli effetti dei
-- trigger di verifica del gruppo.
--
-- La funzione è solo di trigger: nessun EXECUTE per i ruoli client.
-- Idempotente: DROP TRIGGER IF EXISTS prima di ogni CREATE.
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.enforce_order_group_same_activity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_order_group_same_activity ON public.orders;
CREATE TRIGGER trg_enforce_order_group_same_activity
    BEFORE INSERT OR UPDATE OF order_group_id, activity_id ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.enforce_order_group_same_activity();

DROP TRIGGER IF EXISTS trg_enforce_order_group_same_activity ON public.customer_sessions;
CREATE TRIGGER trg_enforce_order_group_same_activity
    BEFORE INSERT OR UPDATE OF order_group_id, activity_id ON public.customer_sessions
    FOR EACH ROW EXECUTE FUNCTION public.enforce_order_group_same_activity();
