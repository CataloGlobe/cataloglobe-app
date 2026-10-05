-- =============================================================================
-- CG-02: activities.plan_override scrivibile solo dalla piattaforma (funzione).
-- =============================================================================
--
-- Problema: activity_has_feature risolve il piano come
-- COALESCE(a.plan_override, t.plan) e tutti i gate delle funzioni a pagamento
-- (trigger check_activity_feature_flags, trigger su orders/reservations, edge
-- checkOrderingState, submit-reservation, reservation-availability,
-- resolve-public-catalog) passano da lì. La policy UPDATE di activities
-- (has_permission('activity.manage', id)) non restringe colonne e
-- authenticated ha UPDATE/INSERT su plan_override: owner, admin e manager di
-- una sede di un tenant Base scrivono plan_override = 'pro', poi accendono
-- ordering_enabled / enable_reservations e hanno le funzioni Pro senza pagare.
--
-- Nessun percorso legittimo scrive plan_override (grep su src/ e
-- supabase/functions il 2026-10-03; 0 righe valorizzate su staging). La
-- colonna resta per i piani per sede futuri, scrivibile solo da service_role
-- e dai ruoli di amministrazione del database.
--
-- Il REVOKE a livello di colonna non basta: authenticated ha UPDATE a livello
-- di tabella, che lo scavalca.
--
-- SECURITY INVOKER: legge solo OLD/NEW e current_user (il ruolo della
-- richiesta, come in protect_tenant_subscription_columns).
-- Trigger nel file successivo (20261003160100), separato per il 42601 di
-- `supabase db push`.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.protect_activity_plan_override()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
BEGIN
    IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.plan_override IS NOT NULL THEN
            RAISE EXCEPTION 'permission_denied: activities.plan_override is set only by the platform (current_user: %)',
                current_user
                USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.plan_override IS DISTINCT FROM OLD.plan_override THEN
        RAISE EXCEPTION 'permission_denied: activities.plan_override is set only by the platform (current_user: %)',
            current_user
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$function$;
