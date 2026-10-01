-- =============================================================================
-- CRM interno (Fase 0): funzioni
-- =============================================================================
-- Tutte SECURITY INVOKER: chi le chiama passa dalle RLS di 20261001120000
-- (solo admin di piattaforma). Il service role (edge) e postgres (pg_cron)
-- bypassano RLS come sempre. Nessuna funzione esistente viene toccata.
--
-- ACL in file separato (20261001120200): CREATE FUNCTION + REVOKE/GRANT nello
-- stesso file fanno fallire `supabase db push` con 42601.
--
--   crm_phone_fingerprint  impronta di un telefono E.164 (lista di esclusione)
--   crm_ingest_lead        un ingresso, con regola dei doppioni sul telefono
--   crm_sync_landing_leads copia nel CRM i nuovi `public.leads` (pg_cron)
--   crm_suppress_stop_on_venue_delete
--                          trigger: cancellando un locale in stop, le impronte
--                          dei suoi telefoni entrano in crm_suppressions
--   crm_move_stage         cambio di colonna + evento
--   crm_assign             assegnazione + evento
--   crm_add_note           nota nella storia
-- =============================================================================

-- -----------------------------------------------------------------------------
-- crm_phone_fingerprint
-- -----------------------------------------------------------------------------
-- sha256 esadecimale del telefono E.164. È una pseudonimizzazione, non
-- un'anonimizzazione (i numeri sono pochi e si possono provare tutti): basta
-- per non tenere il numero in chiaro, la verifica GDPR dirà se è ammessa.
-- sha256() è di pg_catalog (PG 11+), nessuna estensione.
CREATE OR REPLACE FUNCTION public.crm_phone_fingerprint(p_phone_e164 text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SECURITY INVOKER
SET search_path TO ''
AS $$
    SELECT encode(pg_catalog.sha256(pg_catalog.convert_to(p_phone_e164, 'UTF8')), 'hex');
$$;

-- -----------------------------------------------------------------------------
-- crm_ingest_lead
-- -----------------------------------------------------------------------------
-- Regola dei doppioni:
--   * (source, source_ref) già visto           → 'duplicate', nessuna scrittura;
--   * telefono nella lista di esclusione, o di un locale Perso per stop
--                                              → 'suppressed', nessuna
--     scrittura: chi ha chiesto lo stop non rientra da nessuna fonte;
--   * telefono E.164 già di un contatto        → 'returned': il lead si attacca
--     a quel locale, nessuna carta nuova, nessuna riassegnazione; se il locale
--     era Perso per obiezione torna in Nuovo. L'email arrivata col lead va nel
--     lead (form_answers.email), mai nel contatto esistente: chi conosce un
--     telefono non deve poter scrivere i dati di un contatto del CRM;
--   * altrimenti                               → 'created': locale + contatto,
--     assegnato a chi ha is_default_assignee.
-- Un lock di transazione serializza gli ingressi: due arrivi simultanei con lo
-- stesso telefono non creano due carte.
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
    p_received_at   timestamptz DEFAULT NULL
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
    v_venue_name  text := coalesce(nullif(btrim(p_venue_name), ''), v_name);
    v_received    timestamptz := coalesce(p_received_at, now());
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
            form_answers, interests, consent_at, consent_text, received_at
        ) VALUES (
            v_venue_id, v_contact_id, p_source, p_source_ref, p_ad_id, p_ad_name, p_campaign,
            coalesce(p_form_answers, '{}'::jsonb)
                || CASE WHEN v_email IS NOT NULL THEN jsonb_build_object('email', v_email)
                        ELSE '{}'::jsonb END,
            coalesce(p_interests, '{}'),
            p_consent_at, p_consent_text, v_received
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

    INSERT INTO public.crm_venues (name, city, assigned_to)
    VALUES (left(v_venue_name, 160), left(nullif(btrim(p_city), ''), 120), v_assignee)
    RETURNING id INTO v_venue_id;

    INSERT INTO public.crm_contacts (venue_id, name, phone_e164, email)
    VALUES (v_venue_id, left(v_name, 120), v_phone, v_email)
    RETURNING id INTO v_contact_id;

    INSERT INTO public.crm_leads (
        venue_id, contact_id, source, source_ref, ad_id, ad_name, campaign,
        form_answers, interests, consent_at, consent_text, received_at
    ) VALUES (
        v_venue_id, v_contact_id, p_source, p_source_ref, p_ad_id, p_ad_name, p_campaign,
        coalesce(p_form_answers, '{}'::jsonb), coalesce(p_interests, '{}'),
        p_consent_at, p_consent_text, v_received
    ) RETURNING id INTO v_lead_id;

    INSERT INTO public.crm_events (venue_id, lead_id, type, actor_user_id, payload)
    VALUES (v_venue_id, v_lead_id, 'lead_in', v_actor,
            jsonb_build_object('source', p_source, 'assigned_to', v_assignee));

    RETURN QUERY SELECT v_lead_id, v_venue_id, 'created'::text;
END;
$$;

-- -----------------------------------------------------------------------------
-- crm_sync_landing_leads
-- -----------------------------------------------------------------------------
-- Copia nel CRM i contatti della landing (`public.leads`, scritta da
-- submit-lead) non ancora copiati. Solo lettura su `leads`, che resta com'è.
-- Gira da pg_cron come postgres (unico ruolo con SELECT su `leads`); da
-- authenticated fallirebbe sui privilegi di `leads` ed è comunque revocata.
--
-- "Già copiato" = riga in crm_landing_imported, scritta per ogni esito
-- (entrato, doppione, escluso). Non si guarda crm_leads: se un admin cancella
-- il locale (cascata su contatti e lead), la riga in `leads` resta fino a 12
-- mesi e la copia lo ricreerebbe al minuto dopo.
--
-- `leads.phone` ha solo un CHECK di lunghezza: il formato E.164 lo garantisce
-- submit-lead, non il database. Un telefono fuori formato non blocca: il lead
-- entra senza telefono e il valore originale resta in form_answers.phone_raw.
-- Un contatto che non entra per altri motivi viene saltato con un WARNING,
-- senza marcatore, e riprovato al giro dopo senza fermare gli altri.
CREATE OR REPLACE FUNCTION public.crm_sync_landing_leads()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    r          record;
    v_count    integer := 0;
    v_phone_ok boolean;
BEGIN
    FOR r IN
        SELECT l.*
        FROM public.leads l
        WHERE l.status <> 'spam'
          AND NOT EXISTS (
              SELECT 1 FROM public.crm_landing_imported li
              WHERE li.lead_id = l.id
          )
        ORDER BY l.created_at
        LIMIT 200
    LOOP
        v_phone_ok := r.phone ~ '^\+[1-9][0-9]{6,14}$';
        BEGIN
            PERFORM public.crm_ingest_lead(
                p_source       := 'landing',
                p_source_ref   := r.id::text,
                p_name         := r.name,
                p_venue_name   := r.venue_name,
                p_phone_e164   := CASE WHEN v_phone_ok THEN r.phone END,
                p_email        := r.email,
                p_interests    := r.interests,
                p_form_answers := jsonb_strip_nulls(jsonb_build_object(
                    'variant',      r.variant,
                    'utm_source',   r.utm_source,
                    'utm_medium',   r.utm_medium,
                    'utm_campaign', r.utm_campaign,
                    'utm_content',  r.utm_content,
                    'utm_term',     r.utm_term,
                    'referrer',     r.referrer,
                    'landing_path', r.landing_path,
                    'phone_raw',    CASE WHEN v_phone_ok THEN NULL ELSE r.phone END
                )),
                -- Con un annuncio Meta verso la landing, utm_content porta il
                -- nome dell'annuncio (convenzione da concordare con Ferdinando).
                p_ad_name      := r.utm_content,
                p_campaign     := r.utm_campaign,
                p_consent_at   := r.consent_at,
                p_consent_text := r.consent_text,
                p_received_at  := r.created_at
            );
            INSERT INTO public.crm_landing_imported (lead_id) VALUES (r.id)
            ON CONFLICT (lead_id) DO NOTHING;
            v_count := v_count + 1;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'crm_sync_landing_leads: lead % saltato (%: %)', r.id, SQLSTATE, SQLERRM;
        END;
    END LOOP;

    RETURN v_count;
END;
$$;

-- -----------------------------------------------------------------------------
-- crm_suppress_stop_on_venue_delete (trigger BEFORE DELETE su crm_venues)
-- -----------------------------------------------------------------------------
-- Cancellando un locale Perso per stop (a mano o dal job dei 12 mesi), le
-- impronte dei telefoni dei suoi contatti entrano in crm_suppressions prima
-- che la cascata tolga i contatti. SECURITY DEFINER perché nessun ruolo client
-- scrive su crm_suppressions; non ha argomenti e gira solo come trigger.
CREATE OR REPLACE FUNCTION public.crm_suppress_stop_on_venue_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
    IF OLD.stage = 'perso' AND OLD.lost_kind = 'stop' THEN
        INSERT INTO public.crm_suppressions (phone_fingerprint)
        SELECT public.crm_phone_fingerprint(c.phone_e164)
        FROM public.crm_contacts c
        WHERE c.venue_id = OLD.id AND c.phone_e164 IS NOT NULL
        ON CONFLICT (phone_fingerprint) DO NOTHING;
    END IF;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS crm_venues_suppress_stop ON public.crm_venues;
CREATE TRIGGER crm_venues_suppress_stop
    BEFORE DELETE ON public.crm_venues
    FOR EACH ROW EXECUTE FUNCTION public.crm_suppress_stop_on_venue_delete();

-- -----------------------------------------------------------------------------
-- crm_move_stage
-- -----------------------------------------------------------------------------
-- Ritorna false (senza errore) se p_expected_stage è dato e la carta non è più
-- lì: il pulsante WhatsApp sposta in Contattato solo da Nuovo.
CREATE OR REPLACE FUNCTION public.crm_move_stage(
    p_venue_id        uuid,
    p_stage           text,
    p_lost_kind       text DEFAULT NULL,
    p_lost_reason     text DEFAULT NULL,
    p_expected_stage  text DEFAULT NULL,
    p_actor_user_id   uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    -- Un utente parla per sé; p_actor_user_id vale solo senza sessione
    -- (service role dalle edge: webhook Telegram, redirect WhatsApp).
    v_actor   uuid := coalesce(auth.uid(), p_actor_user_id);
    v_from    text;
    v_reason  text := nullif(btrim(p_lost_reason), '');
BEGIN
    SELECT v.stage INTO v_from
    FROM public.crm_venues v WHERE v.id = p_venue_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'venue_not_found' USING ERRCODE = 'P0002';
    END IF;

    IF p_expected_stage IS NOT NULL AND v_from <> p_expected_stage THEN
        RETURN false;
    END IF;

    IF p_stage = 'perso' AND (p_lost_kind IS NULL OR v_reason IS NULL) THEN
        RAISE EXCEPTION 'lost_reason_required' USING ERRCODE = '22023';
    END IF;

    IF v_from = p_stage AND p_stage <> 'perso' THEN
        RETURN false;
    END IF;

    UPDATE public.crm_venues v
    SET stage              = p_stage,
        lost_kind          = CASE WHEN p_stage = 'perso' THEN p_lost_kind END,
        lost_reason        = CASE WHEN p_stage = 'perso' THEN v_reason END,
        stage_changed_at   = now(),
        last_activity_at   = now(),
        first_contacted_at = CASE
            WHEN v.first_contacted_at IS NULL AND p_stage <> 'nuovo' AND p_stage <> 'perso' THEN now()
            ELSE v.first_contacted_at
        END
    WHERE v.id = p_venue_id;

    INSERT INTO public.crm_events (venue_id, type, actor_user_id, payload)
    VALUES (p_venue_id, 'stage_changed', v_actor,
            jsonb_strip_nulls(jsonb_build_object(
                'from', v_from, 'to', p_stage,
                'lost_kind', CASE WHEN p_stage = 'perso' THEN p_lost_kind END,
                'lost_reason', CASE WHEN p_stage = 'perso' THEN v_reason END)));

    RETURN true;
END;
$$;

-- -----------------------------------------------------------------------------
-- crm_assign
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_assign(
    p_venue_id       uuid,
    p_user_id        uuid,
    p_actor_user_id  uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_actor  uuid := coalesce(auth.uid(), p_actor_user_id);
    v_from   uuid;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.crm_team_members m WHERE m.user_id = p_user_id) THEN
        RAISE EXCEPTION 'not_a_team_member' USING ERRCODE = '22023';
    END IF;

    SELECT v.assigned_to INTO v_from
    FROM public.crm_venues v WHERE v.id = p_venue_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'venue_not_found' USING ERRCODE = 'P0002';
    END IF;

    IF v_from IS NOT DISTINCT FROM p_user_id THEN
        RETURN false;
    END IF;

    UPDATE public.crm_venues v
    SET assigned_to = p_user_id, last_activity_at = now()
    WHERE v.id = p_venue_id;

    INSERT INTO public.crm_events (venue_id, type, actor_user_id, payload)
    VALUES (p_venue_id, 'assigned', v_actor,
            jsonb_build_object('from', v_from, 'to', p_user_id));

    RETURN true;
END;
$$;

-- -----------------------------------------------------------------------------
-- crm_add_note
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_add_note(
    p_venue_id  uuid,
    p_text      text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_text  text := nullif(btrim(p_text), '');
    v_id    uuid;
BEGIN
    IF v_text IS NULL OR char_length(v_text) > 4000 THEN
        RAISE EXCEPTION 'invalid_note' USING ERRCODE = '22023';
    END IF;

    UPDATE public.crm_venues v SET last_activity_at = now() WHERE v.id = p_venue_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'venue_not_found' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.crm_events (venue_id, type, actor_user_id, payload)
    VALUES (p_venue_id, 'note', auth.uid(), jsonb_build_object('text', v_text))
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;
