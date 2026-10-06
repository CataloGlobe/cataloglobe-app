-- =============================================================================
-- CRM: assegnatario di default cambiato in un colpo solo
-- =============================================================================
--
-- Prima il client faceva due UPDATE separati (togli il vecchio, metti il
-- nuovo): se il secondo falliva, nessuno riceveva più i lead nuovi. Qui i due
-- passi stanno nella stessa transazione. Due UPDATE e non uno: l'indice unico
-- parziale crm_team_members_one_default_idx non è differibile e un solo
-- UPDATE potrebbe vedere due true a metà.
-- SECURITY INVOKER: valgono le policy di crm_team_members (solo admin).
-- Permessi in 20261006200500.
-- =============================================================================

CREATE FUNCTION public.crm_set_default_assignee(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'not_platform_admin' USING ERRCODE = '42501';
    END IF;

    PERFORM 1 FROM public.crm_team_members m WHERE m.user_id = p_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'team_member_not_found' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.crm_team_members m
    SET is_default_assignee = false
    WHERE m.is_default_assignee AND m.user_id <> p_user_id;

    UPDATE public.crm_team_members m
    SET is_default_assignee = true
    WHERE m.user_id = p_user_id;
END
$$;
