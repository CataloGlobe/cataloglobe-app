-- =============================================================================
-- CRM interno (Fase 0): seguito della review della #185, prima della produzione
-- =============================================================================
--
-- 1. Impronta del telefono: caso noto. `crm_phone_fingerprint('+393331234567')`
--    deve dare l'impronta che si aspetta anche il browser
--    (src/tests/crmPhoneFingerprint.test.ts, ⚠️ SYNC). Se la formula di uno dei
--    due cambiasse, questa migration si ferma invece di scrivere chiavi che
--    non si confrontano più.
--
-- 2. «Locale da verificare» quando arriva un lead tornato più recente. Prima
--    l'etichetta si ricalcolava solo alla scelta («È lo stesso locale» /
--    «Decido dopo»): un lead più recente con un altro nome lasciava sulla carta
--    l'etichetta del lead vecchio, mentre la scheda chiedeva del nuovo. Il
--    trigger `crm_leads_refresh_name_to_verify` la ricalcola a ogni lead
--    tornato con un altro nome, con la stessa regola
--    (crm_refresh_name_to_verify, ⚠️ SYNC con leadToVerify in
--    src/utils/crm/venueNameCheck.ts). La regola resta quella decisa:
--    l'etichetta compare solo sul lead più recente con «Decido dopo», quindi
--    finché nessuno sceglie sul lead nuovo l'etichetta non c'è.
--
-- 3. Codice di errore dedicato a «niente da verificare»: `crm_resolve_venue_name`
--    (ricreata da pg_get_functiondef su staging, 2026-10-02) lo alza con
--    SQLSTATE 'VN001' invece del generico 22023, e il webhook Telegram
--    riconosce il caso dal codice, non dal testo. Il messaggio resta
--    `nothing_to_verify`. Stessa firma: GRANT invariati.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Impronta: caso noto
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF public.crm_phone_fingerprint('+393331234567')
       IS DISTINCT FROM '78f00e1ca317fb2af02c89b17b8b07382ff70336aba0997ad1f3ef3645b4e682' THEN
        RAISE EXCEPTION 'crm_phone_fingerprint non dà l''impronta attesa per il caso noto';
    END IF;
END;
$$;

COMMENT ON FUNCTION public.crm_phone_fingerprint(text) IS
    '⚠️ SYNC con phoneFingerprint (src/utils/crm/phoneFingerprint.ts). Caso noto: +393331234567 → 78f00e1c…e682 (src/tests/crmPhoneFingerprint.test.ts).';

-- -----------------------------------------------------------------------------
-- 2. Trigger: etichetta ricalcolata all'arrivo di un lead tornato
-- -----------------------------------------------------------------------------
-- SECURITY INVOKER: i lead li scrivono il service role (edge, cron) e gli
-- admin della piattaforma, che possono aggiornare crm_venues.
CREATE OR REPLACE FUNCTION public.crm_leads_refresh_name_to_verify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
BEGIN
    PERFORM public.crm_refresh_name_to_verify(NEW.venue_id);
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS crm_leads_refresh_name_to_verify ON public.crm_leads;
CREATE TRIGGER crm_leads_refresh_name_to_verify
    AFTER INSERT ON public.crm_leads
    FOR EACH ROW
    WHEN (NEW.venue_name_match IN ('typo', 'other') AND NEW.venue_id IS NOT NULL)
    EXECUTE FUNCTION public.crm_leads_refresh_name_to_verify();

-- -----------------------------------------------------------------------------
-- 3. crm_resolve_venue_name: SQLSTATE dedicato per nothing_to_verify
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

-- Etichette scritte prima del trigger: un lead tornato più recente senza
-- scelta può aver lasciato quella del lead vecchio.
SELECT public.crm_refresh_name_to_verify(v.id)
FROM public.crm_venues v
WHERE v.name_to_verify IS NOT NULL;
