-- =============================================================================
-- CG-03: enforce_seat_limit serializzato per tenant.
-- =============================================================================
--
-- Problema: il trigger contava le sedi e poi leggeva paid_seats senza lock.
-- Due INSERT concorrenti sullo stesso tenant leggevano lo stesso conteggio e
-- passavano entrambi, superando paid_seats.
--
-- Fix: prima legge paid_seats con FOR UPDATE sulla riga del tenant, poi
-- conta. Gli INSERT di sedi dello stesso tenant si mettono in fila fino al
-- commit; un webhook che aggiorna il tenant nel frattempo aspetta pochi ms.
-- Tenant non trovato: nessun limite da applicare, l'INSERT fallisce comunque
-- sulla FK activities.tenant_id.
--
-- Base: pg_get_functiondef su staging il 2026-10-03 (ultima definizione:
-- 20260430100000). Cambia solo l'ordine e il FOR UPDATE; messaggio, codice
-- e semantica di paid_seats NULL restano gli stessi. SECURITY DEFINER
-- invariato (serve per FOR UPDATE su tenants e per contare tutte le sedi a
-- prescindere dalla RLS del chiamante). CREATE OR REPLACE conserva owner e
-- grant.
-- =============================================================================

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
    SELECT paid_seats INTO max_seats
    FROM public.tenants
    WHERE id = NEW.tenant_id
    FOR UPDATE;

    IF max_seats IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT COUNT(*) INTO current_count
    FROM public.activities
    WHERE tenant_id = NEW.tenant_id;

    IF current_count >= max_seats THEN
        RAISE EXCEPTION 'Limite sedi raggiunto: % di % sedi utilizzate',
            current_count, max_seats
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$function$;
