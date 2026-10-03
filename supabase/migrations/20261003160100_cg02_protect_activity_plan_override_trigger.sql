-- =============================================================================
-- CG-02: activities.plan_override scrivibile solo dalla piattaforma (trigger).
-- =============================================================================
--
-- Funzione e motivazione: 20261003160000_cg02_protect_activity_plan_override_fn.
--
-- INSERT: ogni nuova sede (plan_override deve restare NULL).
-- UPDATE OF plan_override: scatta solo se lo statement nomina la colonna; gli
-- altri update della sede non pagano nulla. La policy UPDATE di activities
-- resta invariata.
--
-- La funzione è solo di trigger: nessun EXECUTE per i ruoli client.
-- Idempotente: DROP TRIGGER IF EXISTS prima del CREATE.
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.protect_activity_plan_override() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_protect_activity_plan_override ON public.activities;

CREATE TRIGGER trg_protect_activity_plan_override
    BEFORE INSERT OR UPDATE OF plan_override ON public.activities
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_activity_plan_override();
