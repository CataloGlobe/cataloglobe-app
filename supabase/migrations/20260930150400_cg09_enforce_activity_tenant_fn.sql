-- =============================================================================
-- CG-09: tenant_id delle tabelle di sede uguale al tenant della sede (funzione).
-- =============================================================================
--
-- Problema: le policy INSERT/UPDATE delle tabelle di sede guardano solo
-- has_permission('<perm>', activity_id). La riga può dichiarare un tenant_id
-- diverso da quello della sede. Con reservations il trigger SECURITY DEFINER
-- reservations_link_guest scrive nella rubrica del tenant indicato da
-- NEW.tenant_id: chi gestisce una sede propria scrive nella rubrica clienti di
-- un'altra azienda.
--
-- Fix: trigger BEFORE INSERT OR UPDATE OF activity_id, tenant_id che rifiuta
-- (42501) una riga il cui tenant_id non è quello della sede. Una sola funzione
-- per tutte le tabelle (file successivo). activity_id NULL (support_tickets)
-- passa: nessuna sede, niente da confrontare. Sede inesistente → rifiuto
-- (la FK lo farebbe comunque).
--
-- Perché trigger e non FK composta (activity_id, tenant_id) come stories:
-- sostituire la FK semplice di 24 tabelle cambia le relazioni che PostgREST
-- usa per gli embed (hint `!<tabella>_activity_id_fkey`, ambiguità PGRST201);
-- il trigger non tocca lo schema delle relazioni e copre anche service_role e
-- le funzioni SECURITY DEFINER.
--
-- SECURITY DEFINER: la lettura di activities non deve dipendere dalla RLS del
-- chiamante (sessioni cliente, edge con JWT custom). Legge una riga per PK.
-- SET search_path TO '' con nomi qualificati (public.<tabella>).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enforce_activity_tenant_match()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_tenant_id uuid;
BEGIN
    IF NEW.activity_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT a.tenant_id INTO v_tenant_id
      FROM public.activities a
     WHERE a.id = NEW.activity_id;

    IF v_tenant_id IS DISTINCT FROM NEW.tenant_id THEN
        RAISE EXCEPTION 'activity_tenant_mismatch'
            USING ERRCODE = '42501',
                  DETAIL  = format('%I.tenant_id deve essere il tenant della sede %s',
                                   TG_TABLE_NAME, NEW.activity_id);
    END IF;

    RETURN NEW;
END;
$function$;
