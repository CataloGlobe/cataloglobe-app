-- =============================================================================
-- CRM: decidere una bozza dell'agente da /admin (grafica finale, 2026-10-05)
-- =============================================================================
-- «Inviala così», «Modifica» e «Scarta» nella Home e nella scheda del lead.
-- `crm_agent_decide_draft` resta com'è (solo service_role, la usa Telegram):
-- questa funzione nuova la chiama per conto di chi è in /admin, con gli stessi
-- controlli che Telegram fa dal service role (admin di piattaforma e persona
-- del team del CRM). Dal web servono solo le tre decisioni sulla bozza; le
-- altre (fissa la telefonata, lead perso…) restano ai pulsanti già esistenti.
--
-- SECURITY DEFINER perché `crm_agent_decide_draft` non è concessa agli
-- authenticated. L'attore è sempre auth.uid(): il chiamante non può
-- sceglierlo. Grant nel file 150100.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.crm_admin_decide_draft(
    p_draft_id  uuid,
    p_decision  text,
    p_text      text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_user uuid := auth.uid();
BEGIN
    IF v_user IS NULL OR NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.crm_team_members tm WHERE tm.user_id = v_user) THEN
        RAISE EXCEPTION 'not_a_team_member' USING ERRCODE = '42501';
    END IF;
    IF p_decision IS NULL OR p_decision NOT IN ('send', 'edit', 'discard') THEN
        RAISE EXCEPTION 'invalid_decision' USING ERRCODE = '22023';
    END IF;
    RETURN public.crm_agent_decide_draft(p_draft_id, p_decision, p_text, v_user);
END;
$$;
