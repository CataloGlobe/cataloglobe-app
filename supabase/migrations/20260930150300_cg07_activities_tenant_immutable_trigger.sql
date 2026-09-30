-- =============================================================================
-- CG-07: activities.id e activities.tenant_id immutabili (trigger).
-- =============================================================================
--
-- Funzione e motivazione: 20260930150200_cg07_activities_tenant_immutable_fn.
--
-- UPDATE OF id, tenant_id: scatta solo se lo statement nomina una delle due
-- colonne; gli altri update della sede non pagano nulla. La policy UPDATE di
-- activities resta invariata.
--
-- La funzione è solo di trigger: nessun EXECUTE per i ruoli client.
-- Idempotente: DROP TRIGGER IF EXISTS prima del CREATE.
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.prevent_activity_reparent() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_prevent_activity_reparent ON public.activities;

CREATE TRIGGER trg_prevent_activity_reparent
    BEFORE UPDATE OF id, tenant_id ON public.activities
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_activity_reparent();
