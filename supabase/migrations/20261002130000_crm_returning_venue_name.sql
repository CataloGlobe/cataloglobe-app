-- =============================================================================
-- CRM interno: lead che torna con un nome di locale diverso
-- =============================================================================
-- Decisione di Alex del 2026-10-02 (prova 2 della #164 su staging: il nome
-- nuovo scritto nel modulo restava solo in public.leads, nel CRM spariva).
--
--   * crm_leads.contact_name_given / venue_name_given: cosa ha scritto la
--     persona in quella richiesta (nome e locale). Prima si perdevano quando
--     il telefono era già nel CRM.
--   * crm_leads.venue_name_match: per un lead tornato che ha scritto un
--     locale, il confronto col nome della carta: 'same' (uguale tolte
--     maiuscole, accenti e spazi), 'typo' (simile: pg_trgm >= 0.6, tarata
--     su staging, «Pizzeria Gino»/«Pizzeria Ginno» 0,81, «Pizzeria
--     Napoli» 0,43), 'other' (diverso). Cambia solo la frase del bot, i
--     tasti sono gli stessi. NULL se non ha scritto un locale, se la carta è
--     ancora «Locale da completare» o se è il primo ingresso.
--   * crm_leads.venue_name_check: la scelta su quel lead, 'same' («È lo
--     stesso locale») o 'later' («Decido dopo»).
--   * crm_venues.name_to_verify: il nome alternativo finché qualcuno non
--     decide. Non nullo = etichetta «Locale da verificare». Lo azzerano
--     «È lo stesso locale» e crm_rename_venue.
--   * crm_resolve_venue_name: i due tasti, da Telegram (service role, attore
--     passato) e da /admin (attore = auth.uid()).
--   * Dati vecchi: le richieste della landing riprendono nome e locale da
--     public.leads (solo lettura); il primo ingresso delle altre fonti li
--     prende da contatto e carta. I lead tornati non della landing restano
--     senza: quel dato non c'è più.
--
-- «È un altro locale» arriva dopo le ADV: oggi un telefono sta su una sola
-- carta (crm_contacts.phone_e164 UNIQUE).
--
-- crm_ingest_lead e crm_rename_venue: ricreate dal testo di 20261001170000
-- (non ancora applicata su staging quando questa è stata scritta, 2026-10-02).
-- Se nel frattempo il live è cambiato, ripartire da pg_get_functiondef.
-- Tutte SECURITY INVOKER; ACL in 20261002130100 (42601 con db push).
-- =============================================================================

BEGIN;

-- pg_trgm c'è su staging (schema extensions); idempotente se c'è anche altrove.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

ALTER TABLE public.crm_leads
    ADD COLUMN IF NOT EXISTS contact_name_given text
        CHECK (contact_name_given IS NULL OR char_length(contact_name_given) <= 120),
    ADD COLUMN IF NOT EXISTS venue_name_given text
        CHECK (venue_name_given IS NULL OR char_length(venue_name_given) <= 160),
    ADD COLUMN IF NOT EXISTS venue_name_match text
        CHECK (venue_name_match IS NULL OR venue_name_match IN ('same', 'typo', 'other')),
    ADD COLUMN IF NOT EXISTS venue_name_check text
        CHECK (venue_name_check IS NULL OR venue_name_check IN ('same', 'later'));

ALTER TABLE public.crm_venues
    ADD COLUMN IF NOT EXISTS name_to_verify text
        CHECK (name_to_verify IS NULL OR char_length(name_to_verify) <= 160);

ALTER TABLE public.crm_events DROP CONSTRAINT IF EXISTS crm_events_type_check;
ALTER TABLE public.crm_events ADD CONSTRAINT crm_events_type_check CHECK (type IN (
    'lead_in', 'lead_returned', 'assigned', 'stage_changed',
    'whatsapp_opened', 'note', 'account_linked', 'escalated',
    'stage_locked', 'stage_unlocked', 'subscription_changed',
    'venue_renamed', 'venue_name_confirmed', 'venue_name_deferred'
));

-- -----------------------------------------------------------------------------
-- Dati vecchi
-- -----------------------------------------------------------------------------
UPDATE public.crm_leads cl
SET contact_name_given = left(nullif(btrim(l.name), ''), 120),
    venue_name_given = left(nullif(btrim(l.venue_name), ''), 160)
FROM public.leads l
WHERE cl.source = 'landing'
  AND cl.source_ref = l.id::text
  AND cl.contact_name_given IS NULL
  AND cl.venue_name_given IS NULL;

UPDATE public.crm_leads cl
SET contact_name_given = c.name,
    venue_name_given = CASE WHEN v.name_pending THEN NULL ELSE v.name END
FROM public.crm_events e, public.crm_venues v, public.crm_contacts c
WHERE e.lead_id = cl.id
  AND e.type = 'lead_in'
  AND v.id = cl.venue_id
  AND c.id = cl.contact_id
  AND cl.source <> 'landing'
  AND cl.contact_name_given IS NULL
  AND cl.venue_name_given IS NULL;

-- -----------------------------------------------------------------------------
-- crm_venue_name_match: 'same' | 'typo' | 'other'
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_venue_name_match(p_known text, p_given text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
    WITH n AS (
        SELECT
            regexp_replace(
                translate(lower(btrim(coalesce(p_known, ''))),
                          'àáâäãåèéêëìíîïòóôöõùúûüçñ', 'aaaaaaeeeeiiiiooooouuuucn'),
                '\s+', ' ', 'g') AS known,
            regexp_replace(
                translate(lower(btrim(coalesce(p_given, ''))),
                          'àáâäãåèéêëìíîïòóôöõùúûüçñ', 'aaaaaaeeeeiiiiooooouuuucn'),
                '\s+', ' ', 'g') AS given
    )
    SELECT CASE
        WHEN n.known = n.given THEN 'same'
        WHEN extensions.similarity(n.known, n.given) >= 0.6 THEN 'typo'
        ELSE 'other'
    END
    FROM n;
$$;

-- -----------------------------------------------------------------------------
-- crm_ingest_lead (regole invariate; in più nome e locale scritti e confronto)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_ingest_lead(
    p_source        text,
    p_source_ref    text,
    p_name          text,
    p_venue_name    text,
    p_phone_e164    text,
    p_email         text        DEFAULT NULL,
    p_city          text        DEFAULT NULL,
    p_interests     text[]      DEFAULT '{}',
    p_form_answers  jsonb       DEFAULT '{}'::jsonb,
    p_ad_id         text        DEFAULT NULL,
    p_ad_name       text        DEFAULT NULL,
    p_campaign      text        DEFAULT NULL,
    p_consent_at    timestamptz DEFAULT NULL,
    p_consent_text  text        DEFAULT NULL,
    p_received_at   timestamptz DEFAULT NULL,
    p_silent        boolean     DEFAULT false
)
RETURNS TABLE (r_lead_id uuid, r_venue_id uuid, r_outcome text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_phone       text := nullif(btrim(p_phone_e164), '');
    v_email       text := nullif(btrim(p_email), '');
    v_name        text := coalesce(nullif(btrim(p_name), ''), 'Senza nome');
    v_venue_given text := nullif(btrim(p_venue_name), '');
    v_venue_name  text := coalesce(v_venue_given, v_name);
    v_name_given  text := left(nullif(btrim(p_name), ''), 120);
    v_known_name  text;
    v_known_pend  boolean;
    v_match       text;
    v_received    timestamptz := coalesce(p_received_at, now());
    v_silent_at   timestamptz := CASE WHEN p_silent THEN now() END;
    v_actor       uuid := auth.uid();
    v_contact_id  uuid;
    v_venue_id    uuid;
    v_lead_id     uuid;
    v_stage       text;
    v_lost_kind   text;
    v_assignee    uuid;
BEGIN
    IF v_phone IS NOT NULL AND v_phone !~ '^\+[1-9][0-9]{6,14}$' THEN
        RAISE EXCEPTION 'invalid_phone' USING ERRCODE = '22023';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('crm_ingest_lead'));

    IF p_source_ref IS NOT NULL THEN
        SELECT l.id, l.venue_id INTO v_lead_id, v_venue_id
        FROM public.crm_leads l
        WHERE l.source = p_source AND l.source_ref = p_source_ref;
        IF FOUND THEN
            RETURN QUERY SELECT v_lead_id, v_venue_id, 'duplicate'::text;
            RETURN;
        END IF;
        IF EXISTS (
            SELECT 1 FROM public.crm_imported_refs ir
            WHERE ir.source = p_source AND ir.source_ref = p_source_ref
        ) THEN
            RETURN QUERY SELECT NULL::uuid, NULL::uuid, 'duplicate'::text;
            RETURN;
        END IF;
    END IF;

    IF v_phone IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.crm_suppressions s
            WHERE s.phone_fingerprint = public.crm_phone_fingerprint(v_phone)
        ) THEN
            RETURN QUERY SELECT NULL::uuid, NULL::uuid, 'suppressed'::text;
            RETURN;
        END IF;

        SELECT c.id, c.venue_id INTO v_contact_id, v_venue_id
        FROM public.crm_contacts c
        WHERE c.phone_e164 = v_phone;
    END IF;

    IF v_venue_id IS NOT NULL THEN
        -- Doppione per telefono: stesso locale.
        SELECT v.stage, v.lost_kind, v.name, v.name_pending
        INTO v_stage, v_lost_kind, v_known_name, v_known_pend
        FROM public.crm_venues v WHERE v.id = v_venue_id;

        IF v_stage = 'perso' AND v_lost_kind = 'stop' THEN
            RETURN QUERY SELECT NULL::uuid, v_venue_id, 'suppressed'::text;
            RETURN;
        END IF;

        -- Confronto col locale che conosciamo (solo se ce l'ha scritto e la
        -- carta ha già un nome vero).
        IF v_venue_given IS NOT NULL AND NOT v_known_pend THEN
            v_match := public.crm_venue_name_match(v_known_name, v_venue_given);
        END IF;

        INSERT INTO public.crm_leads (
            venue_id, contact_id, source, source_ref, ad_id, ad_name, campaign,
            form_answers, interests, consent_at, consent_text, received_at,
            notified_at, escalated_at,
            contact_name_given, venue_name_given, venue_name_match
        ) VALUES (
            v_venue_id, v_contact_id, p_source, p_source_ref, p_ad_id, p_ad_name, p_campaign,
            coalesce(p_form_answers, '{}'::jsonb)
                || CASE WHEN v_email IS NOT NULL THEN jsonb_build_object('email', v_email)
                        ELSE '{}'::jsonb END,
            coalesce(p_interests, '{}'),
            p_consent_at, p_consent_text, v_received,
            v_silent_at, v_silent_at,
            v_name_given, left(v_venue_given, 160), v_match
        ) RETURNING id INTO v_lead_id;

        INSERT INTO public.crm_events (venue_id, lead_id, type, actor_user_id, payload)
        VALUES (v_venue_id, v_lead_id, 'lead_returned', v_actor,
                jsonb_strip_nulls(jsonb_build_object(
                    'source', p_source, 'stage', v_stage, 'lost_kind', v_lost_kind,
                    'venue_name_given', left(v_venue_given, 160),
                    'venue_name_match', v_match
                )));

        IF v_stage = 'perso' AND v_lost_kind = 'obiezione' THEN
            UPDATE public.crm_venues v
            SET stage = 'nuovo', lost_kind = NULL, lost_reason = NULL,
                stage_changed_at = now(), last_activity_at = now()
            WHERE v.id = v_venue_id;

            INSERT INTO public.crm_events (venue_id, lead_id, type, actor_user_id, payload)
            VALUES (v_venue_id, v_lead_id, 'stage_changed', NULL,
                    jsonb_build_object('from', 'perso', 'to', 'nuovo', 'reason', 'lead_returned'));
        ELSE
            UPDATE public.crm_venues v SET last_activity_at = now() WHERE v.id = v_venue_id;
        END IF;

        RETURN QUERY SELECT v_lead_id, v_venue_id, 'returned'::text;
        RETURN;
    END IF;

    -- Locale nuovo.
    SELECT m.user_id INTO v_assignee
    FROM public.crm_team_members m
    WHERE m.is_default_assignee;

    INSERT INTO public.crm_venues (name, name_pending, city, assigned_to)
    VALUES (left(v_venue_name, 160), v_venue_given IS NULL,
            left(nullif(btrim(p_city), ''), 120), v_assignee)
    RETURNING id INTO v_venue_id;

    INSERT INTO public.crm_contacts (venue_id, name, phone_e164, email)
    VALUES (v_venue_id, left(v_name, 120), v_phone, v_email)
    RETURNING id INTO v_contact_id;

    INSERT INTO public.crm_leads (
        venue_id, contact_id, source, source_ref, ad_id, ad_name, campaign,
        form_answers, interests, consent_at, consent_text, received_at,
        notified_at, escalated_at,
        contact_name_given, venue_name_given
    ) VALUES (
        v_venue_id, v_contact_id, p_source, p_source_ref, p_ad_id, p_ad_name, p_campaign,
        coalesce(p_form_answers, '{}'::jsonb), coalesce(p_interests, '{}'),
        p_consent_at, p_consent_text, v_received,
        v_silent_at, v_silent_at,
        v_name_given, left(v_venue_given, 160)
    ) RETURNING id INTO v_lead_id;

    INSERT INTO public.crm_events (venue_id, lead_id, type, actor_user_id, payload)
    VALUES (v_venue_id, v_lead_id, 'lead_in', v_actor,
            jsonb_build_object('source', p_source, 'assigned_to', v_assignee));

    RETURN QUERY SELECT v_lead_id, v_venue_id, 'created'::text;
END;
$$;

-- -----------------------------------------------------------------------------
-- crm_rename_venue (in più: azzera name_to_verify)
-- -----------------------------------------------------------------------------
-- p_city NULL = città invariata; stringa vuota = città tolta.
CREATE OR REPLACE FUNCTION public.crm_rename_venue(
    p_venue_id  uuid,
    p_name      text,
    p_city      text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_name      text := nullif(btrim(p_name), '');
    v_city      text := nullif(btrim(p_city), '');
    v_old_name  text;
    v_old_city  text;
BEGIN
    IF v_name IS NULL OR char_length(v_name) > 160 THEN
        RAISE EXCEPTION 'invalid_venue_name' USING ERRCODE = '22023';
    END IF;
    IF v_city IS NOT NULL AND char_length(v_city) > 120 THEN
        RAISE EXCEPTION 'invalid_city' USING ERRCODE = '22023';
    END IF;

    SELECT v.name, v.city INTO v_old_name, v_old_city
    FROM public.crm_venues v
    WHERE v.id = p_venue_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'venue_not_found' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.crm_venues v
    SET name = v_name,
        city = CASE WHEN p_city IS NULL THEN v.city ELSE v_city END,
        name_pending = false,
        name_to_verify = NULL,
        last_activity_at = now()
    WHERE v.id = p_venue_id;

    INSERT INTO public.crm_events (venue_id, type, actor_user_id, payload)
    VALUES (p_venue_id, 'venue_renamed', auth.uid(),
            jsonb_build_object(
                'from', v_old_name, 'to', v_name,
                'city_from', v_old_city,
                'city_to', CASE WHEN p_city IS NULL THEN v_old_city ELSE v_city END
            ));
END;
$$;

-- -----------------------------------------------------------------------------
-- crm_resolve_venue_name
-- -----------------------------------------------------------------------------
-- p_choice 'same': il locale resta quello della carta, la variante va nella
--   storia, l'etichetta sparisce.
-- p_choice 'later': etichetta «Locale da verificare» col nome scritto.
-- Ritorna false se quel lead aveva già quella scelta (doppio tocco).
-- p_actor_user_id serve solo al bot (service role); da /admin vale auth.uid().
CREATE OR REPLACE FUNCTION public.crm_resolve_venue_name(
    p_lead_id        uuid,
    p_choice         text,
    p_actor_user_id  uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_actor     uuid := coalesce(auth.uid(), p_actor_user_id);
    v_venue_id  uuid;
    v_given     text;
    v_match     text;
    v_check     text;
    v_known     text;
BEGIN
    IF p_choice IS NULL OR p_choice NOT IN ('same', 'later') THEN
        RAISE EXCEPTION 'invalid_choice' USING ERRCODE = '22023';
    END IF;

    SELECT l.venue_id, l.venue_name_given, l.venue_name_match, l.venue_name_check
    INTO v_venue_id, v_given, v_match, v_check
    FROM public.crm_leads l
    WHERE l.id = p_lead_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lead_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF v_match IS NULL OR v_match = 'same' THEN
        RAISE EXCEPTION 'nothing_to_verify' USING ERRCODE = '22023';
    END IF;
    IF v_check IS NOT DISTINCT FROM p_choice THEN
        RETURN false;
    END IF;

    SELECT v.name INTO v_known
    FROM public.crm_venues v WHERE v.id = v_venue_id
    FOR UPDATE;

    UPDATE public.crm_leads l SET venue_name_check = p_choice WHERE l.id = p_lead_id;

    UPDATE public.crm_venues v
    SET name_to_verify = CASE WHEN p_choice = 'later' THEN v_given ELSE NULL END,
        last_activity_at = now()
    WHERE v.id = v_venue_id;

    INSERT INTO public.crm_events (venue_id, lead_id, type, actor_user_id, payload)
    VALUES (v_venue_id, p_lead_id,
            CASE WHEN p_choice = 'same' THEN 'venue_name_confirmed' ELSE 'venue_name_deferred' END,
            v_actor,
            jsonb_build_object('kept', v_known, 'given', v_given));

    RETURN true;
END;
$$;

COMMIT;
