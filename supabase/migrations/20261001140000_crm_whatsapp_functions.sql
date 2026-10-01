-- =============================================================================
-- CRM interno (Fase 0): pulsante WhatsApp
-- =============================================================================
-- crm_log_whatsapp_opened: chi tocca «Scrivi su WhatsApp» (da /admin o dal
-- link firmato su Telegram, edge `crm-wa`) lascia l'evento nella storia e, se
-- la carta è ancora in Nuovo, la sposta in Contattato (automatismo P1).
-- Rifiuta i locali Perso per stop: hanno chiesto di non essere contattati.
--
-- SECURITY INVOKER: da /admin passa dalle RLS (solo admin di piattaforma); il
-- service role dell'edge passa l'attore in p_actor_user_id, ignorato quando
-- c'è una sessione. ACL in 20261001140100 (42601).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.crm_log_whatsapp_opened(
    p_venue_id       uuid,
    p_lead_id        uuid DEFAULT NULL,
    p_actor_user_id  uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_actor      uuid := coalesce(auth.uid(), p_actor_user_id);
    v_stage      text;
    v_lost_kind  text;
BEGIN
    SELECT v.stage, v.lost_kind INTO v_stage, v_lost_kind
    FROM public.crm_venues v WHERE v.id = p_venue_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'venue_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF v_stage = 'perso' AND v_lost_kind = 'stop' THEN
        RAISE EXCEPTION 'contact_stopped' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.crm_events (venue_id, lead_id, type, actor_user_id)
    VALUES (p_venue_id, p_lead_id, 'whatsapp_opened', v_actor);

    UPDATE public.crm_venues v SET last_activity_at = now() WHERE v.id = p_venue_id;

    RETURN public.crm_move_stage(
        p_venue_id       := p_venue_id,
        p_stage          := 'contattato',
        p_expected_stage := 'nuovo',
        p_actor_user_id  := v_actor
    );
END;
$$;
