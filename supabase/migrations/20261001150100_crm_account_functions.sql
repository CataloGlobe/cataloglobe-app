-- =============================================================================
-- CRM interno (Fase 0): collegare e scollegare un account CataloGlobe
-- =============================================================================
-- crm_link_account: scrive tenant_id e link_source sul locale + evento
-- `account_linked`. Da /admin (link_source 'manual', proposta confermata o
-- scelta a mano) o dall'edge crm-sync-accounts ('phone_auto', service role,
-- attore NULL = sistema). La fase la porta avanti il job dopo, dallo stato
-- dell'abbonamento: qui non si tocca.
-- crm_unlink_account: per un collegamento sbagliato; la fase resta com'è,
-- lo stato dell'abbonamento copiato si azzera.
-- crm_sync_account_state: il job copia lo stato dell'abbonamento; se cambia,
-- evento `subscription_changed` (anche sulle carte bloccate a mano).
-- crm_move_stage_locked / crm_unlock_stage: «Fase bloccata a mano».
-- SECURITY INVOKER; ACL in 20261001150200 (42601).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.crm_link_account(
    p_venue_id       uuid,
    p_tenant_id      uuid,
    p_link_source    text DEFAULT 'manual',
    p_actor_user_id  uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_actor    uuid := coalesce(auth.uid(), p_actor_user_id);
    v_current  uuid;
BEGIN
    IF p_link_source NOT IN ('manual', 'phone_auto') THEN
        RAISE EXCEPTION 'invalid_link_source' USING ERRCODE = '22023';
    END IF;

    SELECT v.tenant_id INTO v_current
    FROM public.crm_venues v WHERE v.id = p_venue_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'venue_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF v_current IS NOT DISTINCT FROM p_tenant_id THEN
        RETURN false;
    END IF;

    UPDATE public.crm_venues v
    SET tenant_id = p_tenant_id, link_source = p_link_source, last_activity_at = now()
    WHERE v.id = p_venue_id;

    UPDATE public.crm_account_suggestions s
    SET dismissed_at = now()
    WHERE s.venue_id = p_venue_id AND s.dismissed_at IS NULL;

    INSERT INTO public.crm_events (venue_id, type, actor_user_id, payload)
    VALUES (p_venue_id, 'account_linked', v_actor,
            jsonb_build_object('tenant_id', p_tenant_id, 'source', p_link_source, 'previous', v_current));

    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_unlink_account(p_venue_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_current  uuid;
BEGIN
    SELECT v.tenant_id INTO v_current
    FROM public.crm_venues v WHERE v.id = p_venue_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'venue_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF v_current IS NULL THEN
        RETURN false;
    END IF;

    UPDATE public.crm_venues v
    SET tenant_id = NULL, link_source = NULL, last_activity_at = now(),
        account_state = NULL, trial_kind = NULL, trial_ends_at = NULL
    WHERE v.id = p_venue_id;

    -- Il job non deve ricollegarlo per telefono: la proposta resta scartata.
    INSERT INTO public.crm_account_suggestions (venue_id, tenant_id, reason, dismissed_at)
    VALUES (p_venue_id, v_current, 'name', now())
    ON CONFLICT (venue_id, tenant_id) DO UPDATE SET dismissed_at = now();

    INSERT INTO public.crm_events (venue_id, type, actor_user_id, payload)
    VALUES (p_venue_id, 'account_linked', auth.uid(),
            jsonb_build_object('tenant_id', NULL, 'previous', v_current, 'unlinked', true));

    RETURN true;
END;
$$;

-- -----------------------------------------------------------------------------
-- crm_sync_account_state (solo service role: crm-sync-accounts)
-- -----------------------------------------------------------------------------
-- p_trial_kind NULL = non saputo in questo giro (Stripe non ha risposto):
-- si tiene quello già scritto, senza contarlo come cambio.
CREATE OR REPLACE FUNCTION public.crm_sync_account_state(
    p_venue_id       uuid,
    p_account_state  text,
    p_trial_kind     text,
    p_trial_ends_at  timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_state  text;
    v_kind   text;
    v_ends   timestamptz;
    v_new_kind text;
BEGIN
    SELECT v.account_state, v.trial_kind, v.trial_ends_at INTO v_state, v_kind, v_ends
    FROM public.crm_venues v WHERE v.id = p_venue_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'venue_not_found' USING ERRCODE = 'P0002';
    END IF;

    v_new_kind := coalesce(p_trial_kind, v_kind);

    IF v_state IS NOT DISTINCT FROM p_account_state
       AND v_kind IS NOT DISTINCT FROM v_new_kind
       AND v_ends IS NOT DISTINCT FROM p_trial_ends_at THEN
        RETURN false;
    END IF;

    UPDATE public.crm_venues v
    SET account_state = p_account_state, trial_kind = v_new_kind, trial_ends_at = p_trial_ends_at
    WHERE v.id = p_venue_id;

    INSERT INTO public.crm_events (venue_id, type, actor_user_id, payload)
    VALUES (p_venue_id, 'subscription_changed', NULL,
            jsonb_build_object(
                'from', jsonb_build_object('state', v_state, 'trial_kind', v_kind, 'trial_ends_at', v_ends),
                'to',   jsonb_build_object('state', p_account_state, 'trial_kind', v_new_kind,
                                           'trial_ends_at', p_trial_ends_at)));
    RETURN true;
END;
$$;

-- -----------------------------------------------------------------------------
-- crm_move_stage_locked
-- -----------------------------------------------------------------------------
-- Spostamento a mano dentro o fuori da In prova o Cliente pagante: la carta
-- si sposta e si blocca, con nota obbligatoria, in una transazione. Perso
-- passa da crm_move_stage (tipo e motivo) e il job non lo tocca comunque.
CREATE OR REPLACE FUNCTION public.crm_move_stage_locked(
    p_venue_id  uuid,
    p_stage     text,
    p_note      text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_note  text := nullif(btrim(p_note), '');
    v_from  text;
BEGIN
    IF v_note IS NULL OR char_length(v_note) > 500 THEN
        RAISE EXCEPTION 'lock_note_required' USING ERRCODE = '22023';
    END IF;
    IF p_stage = 'perso' THEN
        RAISE EXCEPTION 'lost_reason_required' USING ERRCODE = '22023';
    END IF;

    SELECT v.stage INTO v_from FROM public.crm_venues v WHERE v.id = p_venue_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'venue_not_found' USING ERRCODE = 'P0002';
    END IF;

    PERFORM public.crm_move_stage(p_venue_id, p_stage);

    UPDATE public.crm_venues v
    SET stage_locked_at = now(), stage_locked_by = auth.uid(), stage_lock_note = v_note
    WHERE v.id = p_venue_id;

    INSERT INTO public.crm_events (venue_id, type, actor_user_id, payload)
    VALUES (p_venue_id, 'stage_locked', auth.uid(),
            jsonb_build_object('from', v_from, 'to', p_stage, 'note', v_note));
    RETURN true;
END;
$$;

-- -----------------------------------------------------------------------------
-- crm_unlock_stage: «Sblocca», la carta torna a seguire l'abbonamento
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_unlock_stage(p_venue_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
BEGIN
    UPDATE public.crm_venues v
    SET stage_locked_at = NULL, stage_locked_by = NULL, stage_lock_note = NULL,
        last_activity_at = now()
    WHERE v.id = p_venue_id AND v.stage_locked_at IS NOT NULL;
    IF NOT FOUND THEN
        RETURN false;
    END IF;

    INSERT INTO public.crm_events (venue_id, type, actor_user_id, payload)
    VALUES (p_venue_id, 'stage_unlocked', auth.uid(), '{}'::jsonb);
    RETURN true;
END;
$$;
