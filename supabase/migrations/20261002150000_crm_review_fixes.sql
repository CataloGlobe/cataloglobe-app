-- =============================================================================
-- CRM interno (Fase 0): correzioni dalla review di Lorenzo del 2026-10-02
-- =============================================================================
--   * Lead Meta senza id (#175): la chiave `csv:<telefono>[:<created_time>]`
--     teneva il numero in chiaro per sempre in crm_leads e crm_imported_refs.
--     Il browser ora scrive `csv:<impronta>[:<created_time>]` (sha256 come
--     crm_phone_fingerprint, ⚠️ SYNC con src/utils/crm/phoneFingerprint.ts);
--     qui si convertono le righe già scritte, così il reimport dello stesso
--     file resta un doppione.
--   * «Locale da verificare» (#179): l'etichetta è una per locale, le scelte
--     sono per lead. Prima ogni scelta scriveva il suo nome e l'ultima vinceva,
--     anche su un lead più vecchio. Ora l'etichetta si ricalcola con la regola
--     della scheda (⚠️ SYNC con leadToVerify in src/utils/crm/venueNameCheck.ts):
--     il lead aperto è l'ultimo tornato con un altro nome, senza «È lo stesso
--     locale», arrivato dopo l'ultimo «È lo stesso locale» ed entrato dopo
--     l'ultima rinomina; l'etichetta c'è solo se su quel lead si è scelto
--     «Decido dopo». Un lead entrato prima di una rinomina non si decide più:
--     `nothing_to_verify` (chi ha rinominato ha già deciso).
--
-- crm_resolve_venue_name ricreata dal live (pg_get_functiondef su staging il
-- 2026-10-02), stessa firma: GRANT invariati. crm_refresh_name_to_verify è
-- nuova, ACL in 20261002150100 (42601 con `supabase db push`).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Chiavi dei lead Meta senza id: impronta al posto del telefono
-- -----------------------------------------------------------------------------
UPDATE public.crm_leads l
SET source_ref = 'csv:' || public.crm_phone_fingerprint(m.parts[1]) || coalesce(m.parts[2], '')
FROM (
    SELECT cl.id, regexp_match(cl.source_ref, '^csv:(\+[0-9]+)(:.*)?$') AS parts
    FROM public.crm_leads cl
    WHERE cl.source = 'meta_form' AND cl.source_ref ~ '^csv:\+[0-9]+'
) m
WHERE l.id = m.id AND m.parts IS NOT NULL;

UPDATE public.crm_imported_refs ir
SET source_ref = 'csv:' || public.crm_phone_fingerprint(m.parts[1]) || coalesce(m.parts[2], '')
FROM (
    SELECT r.source_ref AS old_ref, regexp_match(r.source_ref, '^csv:(\+[0-9]+)(:.*)?$') AS parts
    FROM public.crm_imported_refs r
    WHERE r.source = 'meta_form' AND r.source_ref ~ '^csv:\+[0-9]+'
) m
WHERE ir.source = 'meta_form' AND ir.source_ref = m.old_ref AND m.parts IS NOT NULL;

-- -----------------------------------------------------------------------------
-- crm_refresh_name_to_verify: l'etichetta dal lead aperto
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_refresh_name_to_verify(p_venue_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_last_same    timestamptz;
    v_last_rename  timestamptz;
    v_given        text;
    v_check        text;
BEGIN
    SELECT max(s.received_at) INTO v_last_same
    FROM public.crm_leads s
    WHERE s.venue_id = p_venue_id AND s.venue_name_check = 'same';

    SELECT max(e.created_at) INTO v_last_rename
    FROM public.crm_events e
    WHERE e.venue_id = p_venue_id AND e.type = 'venue_renamed';

    SELECT l.venue_name_given, l.venue_name_check INTO v_given, v_check
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
    SET name_to_verify = CASE WHEN v_check = 'later' THEN left(v_given, 160) END
    WHERE v.id = p_venue_id
      AND v.name_to_verify IS DISTINCT FROM CASE WHEN v_check = 'later' THEN left(v_given, 160) END;
END;
$$;

-- -----------------------------------------------------------------------------
-- crm_resolve_venue_name
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
BEGIN
    IF p_choice IS NULL OR p_choice NOT IN ('same', 'later') THEN
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
        RAISE EXCEPTION 'nothing_to_verify' USING ERRCODE = '22023';
    END IF;

    SELECT v.name INTO v_known
    FROM public.crm_venues v WHERE v.id = v_venue_id
    FOR UPDATE;

    -- Dopo il lock del locale: una rinomina concorrente è già scritta.
    SELECT max(e.created_at) INTO v_last_rename
    FROM public.crm_events e
    WHERE e.venue_id = v_venue_id AND e.type = 'venue_renamed';
    IF v_created <= coalesce(v_last_rename, '-infinity'::timestamptz) THEN
        RAISE EXCEPTION 'nothing_to_verify' USING ERRCODE = '22023';
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

-- Etichette già scritte con la regola vecchia.
SELECT public.crm_refresh_name_to_verify(v.id)
FROM public.crm_venues v
WHERE v.name_to_verify IS NOT NULL
   OR EXISTS (
       SELECT 1 FROM public.crm_leads l
       WHERE l.venue_id = v.id AND l.venue_name_check = 'later'
   );

COMMIT;
