-- =============================================================================
-- CRM interno: «Locale da verificare» subito e «Usa il nome nuovo»
-- =============================================================================
-- Risposte di Alex del 2026-10-02 sera.
--
-- 1. L'etichetta «Locale da verificare» compare appena arriva un lead tornato
--    con un altro nome del locale, senza aspettare «Decido dopo». La regola
--    del lead aperto resta la stessa (l'ultimo tornato con un altro nome,
--    dopo l'ultimo «È lo stesso locale» e l'ultima rinomina); cambia solo che
--    l'etichetta non chiede più la scelta 'later'. ⚠️ SYNC con leadToVerify
--    (src/utils/crm/venueNameCheck.ts), che non cambia.
--    «Decido dopo» non si offre più (Telegram, /admin); se arriva da un
--    messaggio vecchio resta accettato e non cambia niente.
--
-- 2. Nuova scelta 'rename' in crm_resolve_venue_name: è lo stesso locale, ma
--    il nome giusto è quello nuovo. Rinomina la carta col nome scritto nel
--    lead, segna il lead 'same', toglie l'etichetta e scrive l'evento
--    'venue_renamed' con l'attore (anche da Telegram, dove auth.uid() è
--    nullo: per questo non passa da crm_rename_venue).
--
-- Entrambe ricreate da pg_get_functiondef su staging (2026-10-02 notte),
-- stessa firma e stesso SECURITY INVOKER: GRANT invariati, niente file ACL.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. crm_refresh_name_to_verify: etichetta dal lead aperto, senza scelta
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_refresh_name_to_verify(p_venue_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    v_last_same    timestamptz;
    v_last_rename  timestamptz;
    v_given        text;
BEGIN
    SELECT max(s.received_at) INTO v_last_same
    FROM public.crm_leads s
    WHERE s.venue_id = p_venue_id AND s.venue_name_check = 'same';

    SELECT max(e.created_at) INTO v_last_rename
    FROM public.crm_events e
    WHERE e.venue_id = p_venue_id AND e.type = 'venue_renamed';

    SELECT l.venue_name_given INTO v_given
    FROM public.crm_leads l
    WHERE l.venue_id = p_venue_id
      AND l.venue_name_match IN ('typo', 'other')
      AND l.venue_name_check IS DISTINCT FROM 'same'
      AND l.venue_name_given IS NOT NULL
      AND l.received_at > coalesce(v_last_same, '-infinity'::timestamptz)
      AND l.created_at > coalesce(v_last_rename, '-infinity'::timestamptz)
    ORDER BY l.received_at DESC, l.created_at DESC
    LIMIT 1;

    UPDATE public.crm_venues v
    SET name_to_verify = left(v_given, 160)
    WHERE v.id = p_venue_id
      AND v.name_to_verify IS DISTINCT FROM left(v_given, 160);
END;
$function$;

-- -----------------------------------------------------------------------------
-- 2. crm_resolve_venue_name: scelta 'rename'
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_resolve_venue_name(p_lead_id uuid, p_choice text, p_actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    v_actor       uuid := coalesce(auth.uid(), p_actor_user_id);
    v_venue_id    uuid;
    v_given       text;
    v_match       text;
    v_check       text;
    v_created     timestamptz;
    v_known       text;
    v_last_rename timestamptz;
    v_new_name    text;
BEGIN
    IF p_choice IS NULL OR p_choice NOT IN ('same', 'later', 'rename') THEN
        RAISE EXCEPTION 'invalid_choice' USING ERRCODE = '22023';
    END IF;

    SELECT l.venue_id, l.venue_name_given, l.venue_name_match, l.venue_name_check, l.created_at
    INTO v_venue_id, v_given, v_match, v_check, v_created
    FROM public.crm_leads l
    WHERE l.id = p_lead_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lead_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF v_match IS NULL OR v_match = 'same' THEN
        RAISE EXCEPTION 'nothing_to_verify' USING ERRCODE = 'VN001';
    END IF;

    SELECT v.name INTO v_known
    FROM public.crm_venues v WHERE v.id = v_venue_id
    FOR UPDATE;

    -- Dopo il lock del locale: una rinomina concorrente è già scritta.
    SELECT max(e.created_at) INTO v_last_rename
    FROM public.crm_events e
    WHERE e.venue_id = v_venue_id AND e.type = 'venue_renamed';
    IF v_created <= coalesce(v_last_rename, '-infinity'::timestamptz) THEN
        RAISE EXCEPTION 'nothing_to_verify' USING ERRCODE = 'VN001';
    END IF;

    IF p_choice = 'rename' THEN
        v_new_name := nullif(btrim(v_given), '');
        IF v_new_name IS NULL OR char_length(v_new_name) > 160 THEN
            RAISE EXCEPTION 'invalid_venue_name' USING ERRCODE = '22023';
        END IF;

        UPDATE public.crm_leads l SET venue_name_check = 'same' WHERE l.id = p_lead_id;

        UPDATE public.crm_venues v
        SET name = v_new_name,
            name_pending = false,
            name_to_verify = NULL,
            last_activity_at = now()
        WHERE v.id = v_venue_id;

        INSERT INTO public.crm_events (venue_id, lead_id, type, actor_user_id, payload)
        VALUES (v_venue_id, p_lead_id, 'venue_renamed', v_actor,
                jsonb_build_object('from', v_known, 'to', v_new_name, 'via', 'returned_lead'));

        -- Un lead tornato ancora più recente con un terzo nome resta aperto.
        PERFORM public.crm_refresh_name_to_verify(v_venue_id);
        RETURN true;
    END IF;

    IF v_check IS NOT DISTINCT FROM p_choice THEN
        RETURN false;
    END IF;

    UPDATE public.crm_leads l SET venue_name_check = p_choice WHERE l.id = p_lead_id;

    PERFORM public.crm_refresh_name_to_verify(v_venue_id);
    UPDATE public.crm_venues v SET last_activity_at = now() WHERE v.id = v_venue_id;

    INSERT INTO public.crm_events (venue_id, lead_id, type, actor_user_id, payload)
    VALUES (v_venue_id, p_lead_id,
            CASE WHEN p_choice = 'same' THEN 'venue_name_confirmed' ELSE 'venue_name_deferred' END,
            v_actor,
            jsonb_build_object('kept', v_known, 'given', v_given));

    RETURN true;
END;
$function$;

-- Etichette dei lead tornati già in attesa di una scelta: compaiono subito.
SELECT public.crm_refresh_name_to_verify(v.id)
FROM public.crm_venues v
WHERE EXISTS (
    SELECT 1 FROM public.crm_leads l
    WHERE l.venue_id = v.id AND l.venue_name_match IN ('typo', 'other')
);

COMMIT;
