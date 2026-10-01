-- =============================================================================
-- CRM interno (Fase 0): collegamento a Telegram
-- =============================================================================
-- crm_start_telegram_link(p_display_name): crea o aggiorna la riga del team
-- di chi chiama e gli dà un token monouso valido 15 minuti. /admin apre
-- `t.me/<bot>?start=<token>`; il webhook del bot salva il chat_id e cancella
-- il token. SECURITY INVOKER: passa dalle RLS di crm_team_members (solo admin
-- di piattaforma). ACL in 20261001130200 (42601).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.crm_start_telegram_link(p_display_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_user   uuid := auth.uid();
    v_name   text := nullif(btrim(p_display_name), '');
    v_token  uuid := gen_random_uuid();
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
    END IF;
    IF v_name IS NULL OR char_length(v_name) > 60 THEN
        RAISE EXCEPTION 'invalid_display_name' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.crm_team_members (user_id, display_name, telegram_link_token, telegram_link_expires_at)
    VALUES (v_user, v_name, v_token, now() + interval '15 minutes')
    ON CONFLICT (user_id) DO UPDATE
    SET display_name             = excluded.display_name,
        telegram_link_token      = excluded.telegram_link_token,
        telegram_link_expires_at = excluded.telegram_link_expires_at;

    RETURN v_token;
END;
$$;
