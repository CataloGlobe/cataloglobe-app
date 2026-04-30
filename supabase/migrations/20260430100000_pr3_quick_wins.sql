-- =============================================================================
-- PR3: Quick wins residui Security Advisor
-- =============================================================================
-- 1. enforce_seat_limit() — fix search_path mutable (esclusa da PR1).
-- 2. qr_scans — DROP TABLE: tabella morta.
--    Evidenze:
--      - 0 righe in DB
--      - Nessun INSERT da nessuna parte (frontend, Edge Functions, DB triggers)
--      - Nessuna FK in entrata
--      - Solo SELECT da src/services/supabase/qrScans.ts (chiamato da
--        Analytics page che è uno stub, vedi CLAUDE.md "Aree in sviluppo")
--    Rimossa per coerenza con cleanup v2_audit_events/v2_notifications.
--    Quando Analytics verrà implementato, il modello dati sarà progettato
--    da zero con FK e RLS adeguate.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Parte 1: enforce_seat_limit con search_path hardened + qualifiche schema
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_seat_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    current_count INTEGER;
    max_seats     INTEGER;
BEGIN
    SELECT COUNT(*) INTO current_count
    FROM public.activities
    WHERE tenant_id = NEW.tenant_id;

    SELECT paid_seats INTO max_seats
    FROM public.tenants
    WHERE id = NEW.tenant_id;

    IF max_seats IS NULL THEN
        RETURN NEW;
    END IF;

    IF current_count >= max_seats THEN
        RAISE EXCEPTION 'Limite sedi raggiunto: % di % sedi utilizzate',
            current_count, max_seats
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$function$;

-- -----------------------------------------------------------------------------
-- Parte 2: DROP qr_scans (dead code)
-- -----------------------------------------------------------------------------

DROP TABLE IF EXISTS public.qr_scans CASCADE;

COMMIT;
