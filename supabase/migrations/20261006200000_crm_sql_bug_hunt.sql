-- =============================================================================
-- CRM: correzioni SQL dalla caccia ai bug del 2026-10-06 (parte 1)
-- =============================================================================
--
-- Ogni funzione parte da pg_get_functiondef sul live di staging (2026-10-06).
--
-- 1. crm_purge_venues: i 12 mesi contano dall'ultima attività (lead, eventi,
--    messaggi, fase), non solo dall'ultimo lead (D49, deciso da Alex).
-- 2. crm_move_stage: uscire da Perso (stop) chiede p_confirm_stop (D50,
--    deciso da Alex). Firma nuova: la vecchia si toglie, niente overload
--    ambigui coi parametri di default. Permessi nella migration _grants.
-- 3. crm_gea_mask: telefoni con parentesi («+39(333)1234567») mascherati;
--    date e orari («12/10/2026», «2026-10-05 10:30», «10.30 - 12.30») no.
-- 4. crm_e164_list_ok: un elemento NULL non è un numero valido.
-- 5. crm_call_windows_ok: il giorno «1.0» vale come 1, come in
--    parseCallWindows (_shared/crmCallSlots.ts).
-- 6. crm_settings_agent_guard: agent_replies_on_since lo scrive solo il
--    trigger dell'interruttore, non un UPDATE diretto.
-- 7. crm_gea_agenda: oltre 62 giorni un errore, non un elenco vuoto.
-- 8. crm_schedule_call: il contatto di riserva scelto con un ordine fisso.
-- =============================================================================

-- 1. ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_purge_venues(p_cutoff timestamp with time zone, p_dry_run boolean DEFAULT true)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    v_count integer;
BEGIN
    IF p_cutoff IS NULL OR p_cutoff > now() - interval '11 months' THEN
        -- Difesa contro una soglia sbagliata passata dall'edge.
        RAISE EXCEPTION 'invalid_cutoff' USING ERRCODE = '22023';
    END IF;

    -- Un solo statement: il DELETE (CTE che modifica) gira anche se non
    -- letto, e salta tutto in dry-run.
    -- I 12 mesi contano dall'ultima cosa successa al locale: lead, eventi
    -- (note, fasi, telefonate), messaggi. Un locale con una conversazione
    -- recente e l'ultimo lead vecchio non si cancella.
    WITH targets AS (
        SELECT v.id
        FROM public.crm_venues v
        WHERE v.tenant_id IS NULL
          AND v.stage NOT IN ('in_prova', 'cliente_pagante')
          AND greatest(
                  coalesce(
                      (SELECT max(l.received_at) FROM public.crm_leads l WHERE l.venue_id = v.id),
                      v.created_at
                  ),
                  v.last_activity_at,
                  v.stage_changed_at,
                  (SELECT max(e.created_at) FROM public.crm_events e WHERE e.venue_id = v.id),
                  (SELECT max(m.created_at) FROM public.crm_messages m WHERE m.venue_id = v.id)
              ) < p_cutoff
    ),
    deleted AS (
        DELETE FROM public.crm_venues v
        USING targets t
        WHERE v.id = t.id
          AND NOT p_dry_run
        RETURNING v.id
    )
    SELECT count(*) INTO v_count FROM targets;

    -- Solo la landing: le altre fonti (lead Meta, WhatsApp, manuale) non
    -- hanno una copia da cui ricontrollare, il marcatore resta per sempre.
    IF NOT p_dry_run THEN
        DELETE FROM public.crm_imported_refs ir
        WHERE ir.source = 'landing'
          AND NOT EXISTS (SELECT 1 FROM public.leads l WHERE l.id::text = ir.source_ref);
    END IF;

    RETURN v_count;
END;
$function$;

-- 2. ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.crm_move_stage(uuid, text, text, text, text, uuid);

CREATE FUNCTION public.crm_move_stage(p_venue_id uuid, p_stage text, p_lost_kind text DEFAULT NULL::text, p_lost_reason text DEFAULT NULL::text, p_expected_stage text DEFAULT NULL::text, p_actor_user_id uuid DEFAULT NULL::uuid, p_confirm_stop boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    -- Un utente parla per sé; p_actor_user_id vale solo senza sessione
    -- (service role dalle edge: webhook Telegram, redirect WhatsApp).
    v_actor     uuid := coalesce(auth.uid(), p_actor_user_id);
    v_from      text;
    v_from_kind text;
    v_reason    text := nullif(btrim(p_lost_reason), '');
BEGIN
    SELECT v.stage, v.lost_kind INTO v_from, v_from_kind
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

    -- Ha chiesto di non essere contattato: si esce da Perso (stop) solo con
    -- un gesto esplicito di una persona che lo conferma (D50). Le edge, Gea e
    -- i giri automatici non passano mai la conferma.
    IF v_from = 'perso' AND v_from_kind = 'stop'
       AND NOT (p_stage = 'perso' AND p_lost_kind = 'stop')
       AND NOT p_confirm_stop THEN
        RAISE EXCEPTION 'stop_confirm_required' USING ERRCODE = '22023';
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
                'lost_reason', CASE WHEN p_stage = 'perso' THEN v_reason END,
                'stop_left', CASE WHEN v_from = 'perso' AND v_from_kind = 'stop' AND p_confirm_stop THEN true END)));

    RETURN true;
END;
$function$;

-- 3. ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_gea_mask(p_text text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE
    v_out text;
    m     text;
BEGIN
    v_out := regexp_replace(p_text, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[email]', 'g');
    -- Candidati: cifre con spazi, punti, trattini, barre e parentesi. Restano
    -- date, orari e numeri corti (meno di 7 cifre). I più lunghi per primi:
    -- un candidato può contenerne un altro.
    FOR m IN
        SELECT s.m FROM (
            SELECT DISTINCT (regexp_matches(v_out, '\+?\(?[0-9][0-9 .\-/()]{5,}[0-9]', 'g'))[1] AS m
        ) s
        ORDER BY length(s.m) DESC
    LOOP
        CONTINUE WHEN m ~ '^(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4})( \d{1,2})?$';
        CONTINUE WHEN m ~ '^\d{1,2}[.:]\d{2}( ?- ?\d{1,2}[.:]\d{2})?$';
        CONTINUE WHEN length(regexp_replace(m, '\D', '', 'g')) < 7;
        v_out := replace(v_out, m, '[numero]');
    END LOOP;
    RETURN v_out;
END;
$function$;

-- 4. ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_e164_list_ok(p_numbers text[])
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
    SELECT coalesce(bool_and(n IS NOT NULL AND n ~ '^\+[1-9][0-9]{6,14}$'), true) FROM unnest(p_numbers) AS n;
$function$;

-- 5. ---------------------------------------------------------------------------
-- ⚠️ SYNC con parseCallWindows (_shared/crmCallSlots.ts).
CREATE OR REPLACE FUNCTION public.crm_call_windows_ok(p_windows jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE
    w jsonb;
    d jsonb;
    v_day numeric;
    v_days integer[];
BEGIN
    IF jsonb_typeof(p_windows) <> 'array' OR jsonb_array_length(p_windows) > 12 THEN
        RETURN false;
    END IF;
    FOR w IN SELECT value FROM jsonb_array_elements(p_windows) LOOP
        IF jsonb_typeof(w) <> 'object'
           OR jsonb_typeof(w->'days') <> 'array'
           OR jsonb_typeof(w->'start') <> 'string'
           OR jsonb_typeof(w->'end') <> 'string' THEN
            RETURN false;
        END IF;
        IF jsonb_array_length(w->'days') NOT BETWEEN 1 AND 7 THEN
            RETURN false;
        END IF;
        v_days := '{}';
        FOR d IN SELECT value FROM jsonb_array_elements(w->'days') LOOP
            IF jsonb_typeof(d) <> 'number' THEN
                RETURN false;
            END IF;
            -- Intero da 1 a 7 anche scritto «1.0» (Number.isInteger in TS).
            v_day := (d::text)::numeric;
            IF v_day <> trunc(v_day) OR v_day NOT BETWEEN 1 AND 7 OR v_day::integer = ANY (v_days) THEN
                RETURN false;
            END IF;
            v_days := v_days || v_day::integer;
        END LOOP;
        IF (w->>'start') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
           OR (w->>'end') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
           OR (w->>'start') >= (w->>'end') THEN
            RETURN false;
        END IF;
    END LOOP;
    RETURN true;
END;
$function$;

-- 6. ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_settings_agent_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    v_actor uuid := public.crm_agent_actor();
BEGIN
    IF NEW.brake_on IS DISTINCT FROM OLD.brake_on THEN
        IF NOT NEW.brake_on AND v_actor IS NULL THEN
            RAISE EXCEPTION 'brake_release_needs_person' USING ERRCODE = '42501';
        END IF;
        NEW.brake_changed_at := now();
        NEW.brake_changed_by := v_actor;
        NEW.brake_reason := nullif(btrim(NEW.brake_reason), '');
        -- Una persona dal client agisce sempre da /admin: la fonte non si dichiara
        -- ('telegram', 'spend_cap', 'channel' solo dal service role).
        IF auth.uid() IS NOT NULL THEN
            NEW.brake_source := 'admin';
        END IF;
    ELSE
        NEW.brake_reason := OLD.brake_reason;
        NEW.brake_source := OLD.brake_source;
        NEW.brake_changed_at := OLD.brake_changed_at;
        NEW.brake_changed_by := OLD.brake_changed_by;
    END IF;
    -- Da quando l'agente risponde: lo scrive crm_settings_agent_trial_since
    -- (gira dopo, ordine alfabetico) quando cambia l'interruttore. Spostarlo
    -- indietro a mano farebbe rispondere l'agente a messaggi vecchi.
    IF NEW.agent_replies_on IS NOT DISTINCT FROM OLD.agent_replies_on THEN
        NEW.agent_replies_on_since := OLD.agent_replies_on_since;
    END IF;
    RETURN NEW;
END;
$function$;

-- 7. ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_gea_agenda(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
BEGIN
    -- Oltre il limite un errore: «niente in agenda» sarebbe falso.
    IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > interval '62 days' THEN
        RAISE EXCEPTION 'agenda_range_too_long' USING ERRCODE = '22023';
    END IF;
    RETURN (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'starts_at', a.starts_at,
                   'status', a.status,
                   'venue_id', v.id,
                   'venue', v.name,
                   'city', v.city,
                   'caller', m.display_name,
                   'note', public.crm_gea_mask(a.note)
               ) ORDER BY a.starts_at), '[]'::jsonb)
        FROM public.crm_appointments a
        JOIN public.crm_venues v ON v.id = a.venue_id
        LEFT JOIN public.crm_team_members m ON m.user_id = a.caller_user_id
        WHERE a.starts_at >= p_from AND a.starts_at < p_to
          AND a.status IN ('proposed', 'confirmed', 'done', 'no_show', 'postponed')
    );
END;
$function$;

-- 8. ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_schedule_call(p_venue_id uuid, p_starts_at timestamp with time zone, p_duration_minutes integer, p_caller_user_id uuid, p_note text DEFAULT NULL::text, p_allow_overlap boolean DEFAULT false, p_actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    v_actor    uuid := public.crm_agenda_begin(p_actor_user_id);
    v_stage    text;
    v_lead     uuid;
    v_contact  uuid;
    v_ends     timestamptz;
    v_status   text;
    v_id       uuid;
BEGIN
    IF p_duration_minutes IS NULL OR p_duration_minutes NOT BETWEEN 5 AND 120 THEN
        RAISE EXCEPTION 'invalid_duration' USING ERRCODE = '22023';
    END IF;
    v_ends := p_starts_at + make_interval(mins => p_duration_minutes);

    SELECT v.stage INTO v_stage FROM public.crm_venues v WHERE v.id = p_venue_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'venue_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF v_stage = 'perso' THEN
        RAISE EXCEPTION 'venue_lost' USING ERRCODE = 'CL005';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.crm_appointments a
        WHERE a.venue_id = p_venue_id AND a.status IN ('proposed', 'confirmed')
    ) THEN
        RAISE EXCEPTION 'call_already_scheduled' USING ERRCODE = 'CL002';
    END IF;
    PERFORM public.crm_agenda_check_slot(p_starts_at, v_ends, p_caller_user_id, NULL, p_allow_overlap);

    -- Il contatto dell'ultimo lead entrato, o un contatto del locale: prima
    -- chi ha il telefono, poi il più vecchio (ordine fisso, non a caso).
    SELECT l.id, l.contact_id INTO v_lead, v_contact
    FROM public.crm_leads l WHERE l.venue_id = p_venue_id
    ORDER BY l.received_at DESC, l.id LIMIT 1;
    IF v_contact IS NULL THEN
        SELECT c.id INTO v_contact FROM public.crm_contacts c
        WHERE c.venue_id = p_venue_id ORDER BY c.phone_e164 IS NULL, c.created_at, c.id LIMIT 1;
    END IF;

    v_status := CASE WHEN v_actor IS NOT DISTINCT FROM p_caller_user_id THEN 'confirmed' ELSE 'proposed' END;

    INSERT INTO public.crm_appointments
        (venue_id, lead_id, contact_id, starts_at, ends_at, caller_user_id, created_by, status, note,
         caller_answered_at, google_sync)
    VALUES
        (p_venue_id, v_lead, v_contact, p_starts_at, v_ends, p_caller_user_id, v_actor, v_status,
         nullif(btrim(p_note), ''),
         CASE WHEN v_status = 'confirmed' THEN now() END,
         CASE WHEN v_status = 'confirmed' THEN 'pending' ELSE 'none' END)
    RETURNING id INTO v_id;

    PERFORM public.crm_call_advance_stage(p_venue_id, 'telefonata_fissata', v_actor);
    UPDATE public.crm_venues v SET last_activity_at = now() WHERE v.id = p_venue_id;

    INSERT INTO public.crm_events (venue_id, lead_id, type, actor_user_id, payload)
    VALUES (p_venue_id, v_lead, 'call_scheduled', v_actor,
            jsonb_build_object('appointment_id', v_id, 'starts_at', p_starts_at, 'ends_at', v_ends,
                               'caller', p_caller_user_id, 'status', v_status));
    RETURN v_id;
END;
$function$;
