-- =============================================================================
-- CRM interno (Fase 0): locale da completare e nuovo testo WhatsApp
-- =============================================================================
-- Decisioni di Alex del 2026-10-01 (call con Ferdinando): il form Meta chiede
-- solo nome, cognome, telefono ed email, niente nome del locale.
--
--   * crm_venues.name_pending: il locale è entrato senza nome (form Meta, CSV
--     senza colonna del locale, aggiunta a mano senza locale). La carta porta
--     il nome della persona e l'etichetta «Locale da completare» finché un
--     admin non scrive il nome vero con crm_rename_venue.
--   * crm_ingest_lead: unica modifica, name_pending all'inserimento del locale
--     nuovo. Ricreata dal testo di 20261001120100 e non da pg_get_functiondef:
--     le migration CRM non erano ancora applicate su staging quando è stata
--     scritta (2026-10-01). Se nel frattempo la funzione live è cambiata,
--     ripartire dal live.
--   * crm_rename_venue: nome (e città, se data) del locale; toglie l'etichetta
--     e scrive l'evento venue_renamed nella storia.
--   * crm_settings.whatsapp_template: il testo nuovo, solo se c'è ancora quello
--     della 20261001140200 o nessun testo (un testo cambiato da /admin resta).
--     ⚠️ SYNC con DEFAULT_WHATSAPP_TEMPLATE in _shared/crmWhatsapp.ts.
--
-- SECURITY INVOKER; ACL in 20261001170100 (42601 con `supabase db push`).
-- =============================================================================

BEGIN;

ALTER TABLE public.crm_venues
    ADD COLUMN IF NOT EXISTS name_pending boolean NOT NULL DEFAULT false;

ALTER TABLE public.crm_events DROP CONSTRAINT IF EXISTS crm_events_type_check;
ALTER TABLE public.crm_events ADD CONSTRAINT crm_events_type_check CHECK (type IN (
    'lead_in', 'lead_returned', 'assigned', 'stage_changed',
    'whatsapp_opened', 'note', 'account_linked', 'escalated',
    'stage_locked', 'stage_unlocked', 'subscription_changed',
    'venue_renamed'
));

-- -----------------------------------------------------------------------------
-- crm_ingest_lead (regole invariate, vedi 20261001120100)
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
        SELECT v.stage, v.lost_kind INTO v_stage, v_lost_kind
        FROM public.crm_venues v WHERE v.id = v_venue_id;

        IF v_stage = 'perso' AND v_lost_kind = 'stop' THEN
            RETURN QUERY SELECT NULL::uuid, v_venue_id, 'suppressed'::text;
            RETURN;
        END IF;

        INSERT INTO public.crm_leads (
            venue_id, contact_id, source, source_ref, ad_id, ad_name, campaign,
            form_answers, interests, consent_at, consent_text, received_at,
            notified_at, escalated_at
        ) VALUES (
            v_venue_id, v_contact_id, p_source, p_source_ref, p_ad_id, p_ad_name, p_campaign,
            coalesce(p_form_answers, '{}'::jsonb)
                || CASE WHEN v_email IS NOT NULL THEN jsonb_build_object('email', v_email)
                        ELSE '{}'::jsonb END,
            coalesce(p_interests, '{}'),
            p_consent_at, p_consent_text, v_received,
            v_silent_at, v_silent_at
        ) RETURNING id INTO v_lead_id;

        INSERT INTO public.crm_events (venue_id, lead_id, type, actor_user_id, payload)
        VALUES (v_venue_id, v_lead_id, 'lead_returned', v_actor,
                jsonb_build_object('source', p_source, 'stage', v_stage, 'lost_kind', v_lost_kind));

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
        notified_at, escalated_at
    ) VALUES (
        v_venue_id, v_contact_id, p_source, p_source_ref, p_ad_id, p_ad_name, p_campaign,
        coalesce(p_form_answers, '{}'::jsonb), coalesce(p_interests, '{}'),
        p_consent_at, p_consent_text, v_received,
        v_silent_at, v_silent_at
    ) RETURNING id INTO v_lead_id;

    INSERT INTO public.crm_events (venue_id, lead_id, type, actor_user_id, payload)
    VALUES (v_venue_id, v_lead_id, 'lead_in', v_actor,
            jsonb_build_object('source', p_source, 'assigned_to', v_assignee));

    RETURN QUERY SELECT v_lead_id, v_venue_id, 'created'::text;
END;
$$;

-- -----------------------------------------------------------------------------
-- crm_rename_venue
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
-- Testo WhatsApp (approvato da Alex il 2026-10-01; {mittente} chiesto da
-- Lorenzo il 2026-10-01: firma chi invia)
-- -----------------------------------------------------------------------------
UPDATE public.crm_settings
SET whatsapp_template = 'Ciao {nome}, sono {mittente} di CataloGlobe. Ho visto che hai lasciato i contatti per il tuo locale. Quando hai 10 minuti per sentirci al telefono?'
WHERE id = true
  AND (whatsapp_template IS NULL
       OR whatsapp_template = E'Ciao {nome}, sono Alessandro di CataloGlobe.\nHo visto la richiesta che hai lasciato per {locale}, grazie!\n\nTi scrivo per capire cosa ti serve (menù digitale, prenotazioni, ordini al tavolo) e mostrarti come funziona in una breve chiamata.\n\nQuando ti è più comodo sentirci?');

COMMIT;
