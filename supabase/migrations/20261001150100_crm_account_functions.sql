-- =============================================================================
-- CRM interno (Fase 0): collegare e scollegare un account CataloGlobe
-- =============================================================================
-- crm_link_account: scrive tenant_id e link_source sul locale + evento
-- `account_linked`. Da /admin (link_source 'manual', proposta confermata o
-- scelta a mano) o dall'edge crm-sync-accounts ('phone_auto', service role,
-- attore NULL = sistema). La fase la porta avanti il job dopo, dallo stato
-- dell'abbonamento: qui non si tocca.
-- crm_unlink_account: per un collegamento sbagliato; la fase resta com'è.
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
    SET tenant_id = NULL, link_source = NULL, last_activity_at = now()
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
