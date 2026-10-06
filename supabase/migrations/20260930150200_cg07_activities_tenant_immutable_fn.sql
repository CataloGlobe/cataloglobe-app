-- =============================================================================
-- CG-07: activities.id e activities.tenant_id immutabili (funzione).
-- =============================================================================
--
-- Problema: la policy UPDATE di activities valuta solo
-- has_permission('activity.manage', id). Un manager della sede S (azienda V)
-- crea un proprio tenant X (INSERT libero su tenants) e fa
-- UPDATE activities SET tenant_id = X WHERE id = S: la sede passa a X, l'owner
-- di V perde prenotazioni/ordini/tavoli/recensioni della sede, il manager ne
-- diventa owner. Anche un owner che sposta una sede tra due tenant propri
-- aggira il limite sedi (trg_enforce_seat_limit scatta solo su INSERT) e lascia
-- i figli col vecchio tenant_id.
--
-- Nessun percorso legittimo cambia tenant o id di una sede (grep su src/ e
-- supabase/functions il 2026-09-30; il service omette tenant_id dagli update).
-- Il divieto vale per ogni ruolo, service_role compreso: una correzione
-- manuale richiede di disabilitare il trigger in modo esplicito.
--
-- SECURITY INVOKER: legge solo OLD/NEW.
-- Trigger nel file successivo (20260930150300), separato per il 42601 di
-- `supabase db push`.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.prevent_activity_reparent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
BEGIN
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
        RAISE EXCEPTION 'activity_tenant_immutable'
            USING ERRCODE = '42501',
                  DETAIL  = 'Una sede non può essere spostata in un''altra azienda.';
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'activity_id_immutable'
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$function$;
