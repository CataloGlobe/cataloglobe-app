-- =============================================================================
-- CRM interno (Fase 1, F1-4a): agenda delle telefonate, funzioni
-- =============================================================================
--   crm_call_reminder_at(starts_at)            il giorno prima alle 18 di Roma
--   crm_schedule_call / crm_move_call / crm_cancel_call
--                                              da /admin (e dal service role con un attore)
--   crm_answer_call(id, accept)                chi chiama dice sì o no (Telegram o scheda)
--   crm_set_call_outcome(id, outcome)          Fatta / Non ha risposto / Rimandata
--   crm_agenda_enqueue_reminders(now)          cron: accoda i promemoria dovuti
--   crm_agenda_has_work(now)                   cron: c'è qualcosa per l'edge?
--   crm_appointments_guard / crm_appointments_queue   trigger
--   crm_wa_claim_next, crm_wa_report_result    rifatte da 20261002220100 con
--                                              i due scopi nuovi (call_confirm,
--                                              call_reminder); il resto invariato
--
-- Errori con SQLSTATE dedicato, letti dal client (crmAgenda.ts):
--   CL001 si accavalla con un'altra telefonata di chi chiama
--   CL002 il locale ha già una telefonata fissata
--   CL003 orario nel passato
--   CL004 la telefonata non è nello stato giusto
--   CL005 locale in Perso
--   CL006 solo chi deve chiamare può rispondere
-- =============================================================================

-- ⚠️ SYNC con callReminderAt (supabase/functions/_shared/crmCallSlots.ts).
CREATE OR REPLACE FUNCTION public.crm_call_reminder_at(p_starts_at timestamptz)
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
    SELECT ((((p_starts_at AT TIME ZONE 'Europe/Rome')::date - 1) + time '18:00') AT TIME ZONE 'Europe/Rome');
$$;

-- -----------------------------------------------------------------------------
-- Guardia: le persone scrivono le telefonate solo dalle funzioni qui sotto
-- -----------------------------------------------------------------------------
-- Le funzioni accendono `crm.agenda_write` per la loro transazione; dal client
-- non si arriva a set_config (PostgREST espone solo lo schema public). Il
-- service role (edge) scrive le colonne di Google e dei passi.
CREATE OR REPLACE FUNCTION public.crm_appointments_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
BEGIN
    IF auth.uid() IS NOT NULL AND coalesce(current_setting('crm.agenda_write', true), '') <> 'on' THEN
        RAISE EXCEPTION 'appointment_write_via_rpc' USING ERRCODE = '42501';
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_appointments_guard ON public.crm_appointments;
CREATE TRIGGER crm_appointments_guard
    BEFORE INSERT OR UPDATE ON public.crm_appointments
    FOR EACH ROW EXECUTE FUNCTION public.crm_appointments_guard();

-- -----------------------------------------------------------------------------
-- Coda: conferma al lead e pulizia dei messaggi non più veri
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER: la coda non è scrivibile dalle persone (solo l'edge col
-- service role), come il primo messaggio (crm_wa_enqueue_first_message).
-- Il testo si scrive all'invio; qui si decide solo se accodare.
CREATE OR REPLACE FUNCTION public.crm_appointments_queue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
    -- L'orario è cambiato o la telefonata non è più confermata: conferme e
    -- promemoria ancora in coda non dicono più il vero.
    IF TG_OP = 'UPDATE' AND (NEW.status <> 'confirmed' OR NEW.starts_at <> OLD.starts_at) THEN
        UPDATE public.crm_messages m
        SET status = 'cancelled',
            status_reason = CASE
                WHEN NEW.status <> 'confirmed' THEN 'Telefonata non più confermata.'
                ELSE 'Telefonata spostata.'
            END
        WHERE m.appointment_id = NEW.id AND m.status = 'queued';
    END IF;

    IF NEW.status = 'confirmed'
       AND (TG_OP = 'INSERT' OR OLD.status <> 'confirmed' OR NEW.starts_at <> OLD.starts_at)
       AND NEW.starts_at > now()
       AND NEW.contact_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.crm_settings s WHERE s.id AND s.call_confirm_message IS NOT NULL)
       AND EXISTS (SELECT 1 FROM public.crm_contacts c WHERE c.id = NEW.contact_id AND c.phone_e164 IS NOT NULL)
    THEN
        INSERT INTO public.crm_messages
            (venue_id, contact_id, lead_id, direction, author, purpose, status, appointment_id)
        VALUES
            (NEW.venue_id, NEW.contact_id, NEW.lead_id, 'out', 'agent', 'call_confirm', 'queued', NEW.id);
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS crm_appointments_queue ON public.crm_appointments;
CREATE TRIGGER crm_appointments_queue
    AFTER INSERT OR UPDATE ON public.crm_appointments
    FOR EACH ROW EXECUTE FUNCTION public.crm_appointments_queue();

-- -----------------------------------------------------------------------------
-- Aiuti interni
-- -----------------------------------------------------------------------------
-- Porta il locale avanti fino a `p_stage`, mai indietro, mai da Perso, mai se
-- la fase è bloccata a mano.
CREATE OR REPLACE FUNCTION public.crm_call_advance_stage(p_venue_id uuid, p_stage text, p_actor_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    -- ⚠️ SYNC con l'ordine delle fasi (CRM_STAGES in src/types/crm.ts).
    v_order  text[] := ARRAY['nuovo', 'contattato', 'in_conversazione', 'telefonata_fissata', 'telefonata_fatta',
                             'demo_fissata', 'demo_fatta', 'in_prova', 'cliente_pagante'];
    v_stage  text;
    v_locked boolean;
BEGIN
    SELECT v.stage, v.stage_locked_at IS NOT NULL INTO v_stage, v_locked
    FROM public.crm_venues v WHERE v.id = p_venue_id;
    IF v_locked OR v_stage = 'perso'
       OR coalesce(array_position(v_order, v_stage), 0) >= array_position(v_order, p_stage) THEN
        RETURN false;
    END IF;
    RETURN public.crm_move_stage(
        p_venue_id := p_venue_id, p_stage := p_stage,
        p_expected_stage := v_stage, p_actor_user_id := p_actor_user_id
    );
END;
$$;

-- Prepara chi agisce e apre la scrittura sulle telefonate per la transazione.
CREATE OR REPLACE FUNCTION public.crm_agenda_begin(p_actor_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_actor uuid;
BEGIN
    IF auth.uid() IS NOT NULL AND NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'not_platform_admin' USING ERRCODE = '42501';
    END IF;
    v_actor := public.crm_bind_agent_actor(p_actor_user_id);
    PERFORM set_config('crm.agenda_write', 'on', true);
    RETURN v_actor;
END;
$$;

-- Controlli comuni a «fissa» e «sposta».
CREATE OR REPLACE FUNCTION public.crm_agenda_check_slot(
    p_starts_at       timestamptz,
    p_ends_at         timestamptz,
    p_caller_user_id  uuid,
    p_exclude_id      uuid,
    p_allow_overlap   boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
BEGIN
    IF p_starts_at <= now() THEN
        RAISE EXCEPTION 'call_in_past' USING ERRCODE = 'CL003';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.crm_team_members m WHERE m.user_id = p_caller_user_id) THEN
        RAISE EXCEPTION 'not_a_team_member' USING ERRCODE = '22023';
    END IF;
    IF NOT p_allow_overlap AND EXISTS (
        SELECT 1 FROM public.crm_appointments a
        WHERE a.caller_user_id = p_caller_user_id
          AND a.status IN ('proposed', 'confirmed')
          AND a.id IS DISTINCT FROM p_exclude_id
          AND a.starts_at < p_ends_at AND a.ends_at > p_starts_at
    ) THEN
        RAISE EXCEPTION 'call_overlap' USING ERRCODE = 'CL001';
    END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- crm_schedule_call: fissa una telefonata
-- -----------------------------------------------------------------------------
-- Confermata subito se chiama chi la fissa; altrimenti proposta, finché chi
-- chiama non dice sì (Telegram o scheda). Il locale passa a «Telefonata
-- fissata» (mai indietro). p_allow_overlap = «Fisso comunque?» detto sì.
CREATE OR REPLACE FUNCTION public.crm_schedule_call(
    p_venue_id          uuid,
    p_starts_at         timestamptz,
    p_duration_minutes  integer,
    p_caller_user_id    uuid,
    p_note              text DEFAULT NULL,
    p_allow_overlap     boolean DEFAULT false,
    p_actor_user_id     uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
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

    -- Il contatto dell'ultimo lead entrato, o un contatto del locale.
    SELECT l.id, l.contact_id INTO v_lead, v_contact
    FROM public.crm_leads l WHERE l.venue_id = p_venue_id
    ORDER BY l.received_at DESC LIMIT 1;
    IF v_contact IS NULL THEN
        SELECT c.id INTO v_contact FROM public.crm_contacts c
        WHERE c.venue_id = p_venue_id ORDER BY c.phone_e164 IS NULL LIMIT 1;
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
$$;

-- -----------------------------------------------------------------------------
-- crm_move_call: sposta una telefonata attiva (orario, durata, chi chiama)
-- -----------------------------------------------------------------------------
-- Con un orario nuovo si rifanno promemoria, brief e domanda dell'esito; se
-- cambia chi chiama e non è chi sposta, torna proposta.
CREATE OR REPLACE FUNCTION public.crm_move_call(
    p_appointment_id    uuid,
    p_starts_at         timestamptz,
    p_duration_minutes  integer,
    p_caller_user_id    uuid,
    p_allow_overlap     boolean DEFAULT false,
    p_actor_user_id     uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_actor   uuid := public.crm_agenda_begin(p_actor_user_id);
    a         record;
    v_ends    timestamptz;
    v_status  text;
BEGIN
    IF p_duration_minutes IS NULL OR p_duration_minutes NOT BETWEEN 5 AND 120 THEN
        RAISE EXCEPTION 'invalid_duration' USING ERRCODE = '22023';
    END IF;
    v_ends := p_starts_at + make_interval(mins => p_duration_minutes);

    SELECT * INTO a FROM public.crm_appointments x WHERE x.id = p_appointment_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'appointment_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF a.status NOT IN ('proposed', 'confirmed') THEN
        RAISE EXCEPTION 'appointment_not_active' USING ERRCODE = 'CL004';
    END IF;
    IF a.starts_at = p_starts_at AND a.ends_at = v_ends AND a.caller_user_id = p_caller_user_id THEN
        RETURN false;
    END IF;
    PERFORM public.crm_agenda_check_slot(p_starts_at, v_ends, p_caller_user_id, a.id, p_allow_overlap);

    v_status := CASE
        WHEN p_caller_user_id = a.caller_user_id THEN a.status
        WHEN v_actor IS NOT DISTINCT FROM p_caller_user_id THEN 'confirmed'
        ELSE 'proposed'
    END;

    UPDATE public.crm_appointments x
    SET starts_at          = p_starts_at,
        ends_at            = v_ends,
        caller_user_id     = p_caller_user_id,
        status             = v_status,
        time_set_at        = CASE WHEN x.starts_at <> p_starts_at THEN now() ELSE x.time_set_at END,
        caller_asked_at    = CASE WHEN v_status = 'proposed' AND p_caller_user_id <> a.caller_user_id THEN NULL ELSE x.caller_asked_at END,
        caller_answered_at = CASE WHEN v_status = 'confirmed' AND p_caller_user_id <> a.caller_user_id THEN now()
                                  WHEN v_status = 'proposed' THEN NULL ELSE x.caller_answered_at END,
        reminder_queued_at = CASE WHEN x.starts_at <> p_starts_at THEN NULL ELSE x.reminder_queued_at END,
        brief_sent_at      = NULL,
        outcome_asked_at   = NULL,
        google_sync        = CASE
            WHEN v_status = 'confirmed' OR x.google_event_id IS NOT NULL THEN 'pending' ELSE 'none'
        END,
        google_rev         = x.google_rev + 1,
        google_error       = NULL
    WHERE x.id = a.id;

    UPDATE public.crm_venues v SET last_activity_at = now() WHERE v.id = a.venue_id;
    INSERT INTO public.crm_events (venue_id, lead_id, type, actor_user_id, payload)
    VALUES (a.venue_id, a.lead_id, 'call_moved', v_actor,
            jsonb_build_object('appointment_id', a.id,
                               'from', a.starts_at, 'starts_at', p_starts_at, 'ends_at', v_ends,
                               'caller_from', a.caller_user_id, 'caller', p_caller_user_id, 'status', v_status));
    RETURN true;
END;
$$;

-- -----------------------------------------------------------------------------
-- crm_cancel_call: annulla una telefonata attiva
-- -----------------------------------------------------------------------------
-- La fase del locale resta dov'è: la sposta una persona, se serve.
CREATE OR REPLACE FUNCTION public.crm_cancel_call(
    p_appointment_id  uuid,
    p_reason          text DEFAULT NULL,
    p_actor_user_id   uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_actor   uuid := public.crm_agenda_begin(p_actor_user_id);
    a         record;
    v_reason  text := left(nullif(btrim(p_reason), ''), 300);
BEGIN
    SELECT * INTO a FROM public.crm_appointments x WHERE x.id = p_appointment_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'appointment_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF a.status = 'cancelled' THEN
        RETURN false;
    END IF;
    IF a.status NOT IN ('proposed', 'confirmed') THEN
        RAISE EXCEPTION 'appointment_not_active' USING ERRCODE = 'CL004';
    END IF;

    UPDATE public.crm_appointments x
    SET status        = 'cancelled',
        status_reason = v_reason,
        google_sync   = CASE WHEN x.google_event_id IS NOT NULL OR x.google_sync = 'pending' THEN 'pending' ELSE 'none' END,
        google_rev    = x.google_rev + 1,
        google_error  = NULL
    WHERE x.id = a.id;

    INSERT INTO public.crm_events (venue_id, lead_id, type, actor_user_id, payload)
    VALUES (a.venue_id, a.lead_id, 'call_cancelled', v_actor,
            jsonb_strip_nulls(jsonb_build_object('appointment_id', a.id, 'starts_at', a.starts_at, 'reason', v_reason)));
    RETURN true;
END;
$$;

-- -----------------------------------------------------------------------------
-- crm_answer_call: chi deve chiamare dice sì o no a una telefonata proposta
-- -----------------------------------------------------------------------------
-- Ritorna lo stato nuovo, o NULL se la telefonata non era più proposta
-- (risposta arrivata tardi, o già data dalla scheda).
CREATE OR REPLACE FUNCTION public.crm_answer_call(
    p_appointment_id  uuid,
    p_accept          boolean,
    p_actor_user_id   uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_actor   uuid := public.crm_agenda_begin(p_actor_user_id);
    a         record;
    v_status  text;
BEGIN
    SELECT * INTO a FROM public.crm_appointments x WHERE x.id = p_appointment_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'appointment_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF v_actor IS DISTINCT FROM a.caller_user_id THEN
        RAISE EXCEPTION 'not_the_caller' USING ERRCODE = 'CL006';
    END IF;
    IF a.status <> 'proposed' THEN
        RETURN NULL;
    END IF;
    IF p_accept AND a.starts_at <= now() THEN
        RAISE EXCEPTION 'call_in_past' USING ERRCODE = 'CL003';
    END IF;

    v_status := CASE WHEN p_accept THEN 'confirmed' ELSE 'cancelled' END;
    UPDATE public.crm_appointments x
    SET status             = v_status,
        status_reason      = CASE WHEN p_accept THEN NULL ELSE 'Chi doveva chiamare non può.' END,
        caller_answered_at = now(),
        google_sync        = CASE WHEN p_accept OR x.google_event_id IS NOT NULL THEN 'pending' ELSE 'none' END,
        google_rev         = x.google_rev + 1,
        google_error       = NULL
    WHERE x.id = a.id;

    INSERT INTO public.crm_events (venue_id, lead_id, type, actor_user_id, payload)
    VALUES (a.venue_id, a.lead_id, 'call_caller_answered', v_actor,
            jsonb_build_object('appointment_id', a.id, 'starts_at', a.starts_at, 'accepted', p_accept));
    RETURN v_status;
END;
$$;

-- -----------------------------------------------------------------------------
-- crm_set_call_outcome: com'è andata
-- -----------------------------------------------------------------------------
--   done       «Fatta»: il locale passa a «Telefonata fatta» (mai indietro)
--   no_show    «Non ha risposto»: il locale resta dov'è
--   postponed  «Rimandata»: il locale resta dov'è, se ne fissa un'altra
-- Ritorna false se l'esito c'era già (secondo tocco, o detto dalla scheda).
CREATE OR REPLACE FUNCTION public.crm_set_call_outcome(
    p_appointment_id  uuid,
    p_outcome         text,
    p_actor_user_id   uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_actor  uuid := public.crm_agenda_begin(p_actor_user_id);
    a        record;
BEGIN
    IF p_outcome IS NULL OR p_outcome NOT IN ('done', 'no_show', 'postponed') THEN
        RAISE EXCEPTION 'invalid_outcome' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO a FROM public.crm_appointments x WHERE x.id = p_appointment_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'appointment_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF a.status IN ('done', 'no_show', 'postponed') THEN
        RETURN false;
    END IF;
    IF a.status <> 'confirmed' THEN
        RAISE EXCEPTION 'appointment_not_active' USING ERRCODE = 'CL004';
    END IF;

    UPDATE public.crm_appointments x
    SET status = p_outcome, outcome_at = now(), outcome_by = v_actor
    WHERE x.id = a.id;

    IF p_outcome = 'done' THEN
        PERFORM public.crm_call_advance_stage(a.venue_id, 'telefonata_fatta', v_actor);
    END IF;
    UPDATE public.crm_venues v SET last_activity_at = now() WHERE v.id = a.venue_id;

    INSERT INTO public.crm_events (venue_id, lead_id, type, actor_user_id, payload)
    VALUES (a.venue_id, a.lead_id, 'call_outcome', v_actor,
            jsonb_build_object('appointment_id', a.id, 'starts_at', a.starts_at, 'outcome', p_outcome));
    RETURN true;
END;
$$;

-- -----------------------------------------------------------------------------
-- Cron: promemoria dovuti e lavoro per l'edge
-- -----------------------------------------------------------------------------
-- Promemoria al lead il giorno prima alle 18, solo se l'orario era già deciso
-- a quell'ora (fissata dopo, o per il giorno stesso: basta la conferma), solo
-- con il testo impostato e un telefono, e non nell'ultima ora prima della
-- telefonata. Ritorna quanti ne ha accodati.
CREATE OR REPLACE FUNCTION public.crm_agenda_enqueue_reminders(p_now timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_count integer;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.crm_settings s WHERE s.id AND s.call_reminder_message IS NOT NULL) THEN
        RETURN 0;
    END IF;

    WITH due AS (
        UPDATE public.crm_appointments a
        SET reminder_queued_at = p_now
        FROM public.crm_contacts c
        WHERE c.id = a.contact_id AND c.phone_e164 IS NOT NULL
          AND a.status = 'confirmed'
          AND a.reminder_queued_at IS NULL
          AND p_now >= public.crm_call_reminder_at(a.starts_at)
          AND a.time_set_at < public.crm_call_reminder_at(a.starts_at)
          AND a.starts_at > p_now + interval '1 hour'
        RETURNING a.id, a.venue_id, a.contact_id, a.lead_id
    )
    INSERT INTO public.crm_messages
        (venue_id, contact_id, lead_id, direction, author, purpose, status, appointment_id)
    SELECT d.venue_id, d.contact_id, d.lead_id, 'out', 'agent', 'call_reminder', 'queued', d.id
    FROM due d;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- C'è qualcosa per l'edge (crm-notify, job «agenda»)? Il cron chiama l'edge
-- solo se sì. ⚠️ SYNC con le condizioni di processAgenda (crm-notify/agenda.ts).
CREATE OR REPLACE FUNCTION public.crm_agenda_has_work(p_now timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.crm_appointments a
        WHERE (a.google_sync = 'pending'
               AND (a.google_claimed_at IS NULL OR a.google_claimed_at < p_now - interval '2 minutes'))
           OR (a.status = 'proposed' AND a.caller_asked_at IS NULL AND a.starts_at > p_now)
           OR (a.status = 'confirmed' AND a.brief_sent_at IS NULL
               AND p_now >= a.starts_at - interval '60 minutes' AND p_now < a.ends_at)
           OR (a.status = 'confirmed' AND a.outcome_asked_at IS NULL
               AND p_now >= a.ends_at + interval '5 minutes' AND p_now < a.ends_at + interval '3 days')
    );
$$;

-- -----------------------------------------------------------------------------
-- crm_wa_claim_next: rifatta da 20261002220100 con conferma e promemoria
-- -----------------------------------------------------------------------------
-- Cambia rispetto alla versione precedente (il resto è identico):
--   * call_confirm / call_reminder: testi fissi ('system' al cancello), testo
--     dalle impostazioni (r_template), annullati se la telefonata non è più
--     confermata o è già passata (il promemoria anche nell'ultima ora);
--   * il promemoria rispetta le fasce di silenzio come i follow-up, la
--     conferma come il primo messaggio (solo se è in coda da più di 30 minuti);
--   * il tetto «3 messaggi dell'agente oggi senza risposta» vale solo per
--     primo messaggio e risposte: conferma e promemoria sono testi fissi
--     legati a una telefonata decisa da una persona.
CREATE OR REPLACE FUNCTION public.crm_wa_claim_next(p_now timestamptz DEFAULT now())
RETURNS TABLE (
    r_message_id    uuid,
    r_venue_id      uuid,
    r_phone         text,
    r_contact_name  text,
    r_venue_name    text,
    r_name_pending  boolean,
    r_body          text,
    r_purpose       text,
    r_template      text,
    r_wait_seconds  integer,
    r_reason        text
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_day_start    timestamptz := date_trunc('day', p_now AT TIME ZONE 'Europe/Rome') AT TIME ZONE 'Europe/Rome';
    v_brake        boolean;
    v_template     text;
    v_confirm_tpl  text;
    v_reminder_tpl text;
    v_test_only    boolean;
    v_test_numbers text[];
    v_next_send    timestamptz;
    v_wa_state     text;
    v_failures     integer;
    v_stuck        integer;
    v_first_today  integer;
    v_cancel       text;
    v_gate         record;
    m              record;
BEGIN
    SELECT c.next_send_at, c.failures_in_row, c.wa_state INTO v_next_send, v_failures, v_wa_state
    FROM public.crm_wa_channel c WHERE c.id FOR UPDATE;

    SELECT s.brake_on, s.wa_first_message, s.call_confirm_message, s.call_reminder_message,
           s.wa_test_only, s.wa_test_numbers
    INTO v_brake, v_template, v_confirm_tpl, v_reminder_tpl, v_test_only, v_test_numbers
    FROM public.crm_settings s WHERE s.id;

    -- Invii presi e mai chiusi (Mac spento a metà): non si sa se sono partiti,
    -- quindi non si rimandano. Contano come falliti.
    UPDATE public.crm_messages m2
    SET status = 'failed',
        status_reason = 'Nessun esito dal Mac entro 10 minuti: guardare la chat prima di riscrivere.'
    WHERE m2.status = 'sending' AND m2.claimed_at < p_now - interval '10 minutes';
    GET DIAGNOSTICS v_stuck = ROW_COUNT;
    IF v_stuck > 0 THEN
        UPDATE public.crm_wa_channel c SET failures_in_row = c.failures_in_row + v_stuck WHERE c.id
        RETURNING c.failures_in_row INTO v_failures;
        IF v_failures >= 3 AND NOT v_brake THEN
            PERFORM public.crm_set_brake(true, '3 invii WhatsApp di fila senza esito.', 'channel');
            RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::boolean,
                NULL::text, NULL::text, NULL::text, 60, 'failures'::text;
            RETURN;
        END IF;
    END IF;

    IF v_brake THEN
        RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::boolean,
            NULL::text, NULL::text, NULL::text, 60, 'brake'::text;
        RETURN;
    END IF;

    -- Il battito mette la pausa solo quando lo stato cambia: se una persona
    -- riattiva gli agenti con WhatsApp Web ancora da ricollegare o in avviso,
    -- la pausa torna qui, prima di qualsiasi invio.
    IF v_wa_state IN ('needs_relink', 'warning') THEN
        PERFORM public.crm_set_brake(
            true,
            CASE v_wa_state
                WHEN 'needs_relink' THEN 'WhatsApp Web chiede ancora di ricollegare il telefono.'
                ELSE 'WhatsApp Web mostra ancora un avviso.'
            END,
            'channel'
        );
        RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::boolean,
            NULL::text, NULL::text, NULL::text, 60, v_wa_state;
        RETURN;
    END IF;

    IF EXISTS (SELECT 1 FROM public.crm_messages m3 WHERE m3.status = 'sending') THEN
        RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::boolean,
            NULL::text, NULL::text, NULL::text, 30, 'busy'::text;
        RETURN;
    END IF;

    IF v_next_send IS NOT NULL AND v_next_send > p_now THEN
        RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::boolean,
            NULL::text, NULL::text, NULL::text,
            greatest(1, ceil(extract(epoch FROM v_next_send - p_now))::integer), 'pacing'::text;
        RETURN;
    END IF;

    SELECT count(*) INTO v_first_today
    FROM public.crm_messages f
    WHERE f.purpose = 'first_message' AND f.status = 'sent' AND f.sent_at >= v_day_start;

    FOR m IN
        SELECT q.id, q.venue_id, q.contact_id, q.purpose, q.body, q.created_at,
               c.phone_e164, c.name AS contact_name,
               v.name AS venue_name, v.name_pending, v.stage, v.first_contacted_at, v.agent_hold_at,
               l.received_at,
               ap.status AS call_status, ap.starts_at AS call_starts_at
        FROM public.crm_messages q
        JOIN public.crm_venues v ON v.id = q.venue_id
        LEFT JOIN public.crm_contacts c ON c.id = q.contact_id
        LEFT JOIN public.crm_leads l ON l.id = q.lead_id
        LEFT JOIN public.crm_appointments ap ON ap.id = q.appointment_id
        WHERE q.status = 'queued'
        ORDER BY CASE q.purpose
                     WHEN 'reply' THEN 0 WHEN 'call_confirm' THEN 1 WHEN 'call_reminder' THEN 1
                     WHEN 'first_message' THEN 2 ELSE 3
                 END, q.created_at
        LIMIT 200
        FOR UPDATE OF q SKIP LOCKED
    LOOP
        -- Il cancello unico di ogni invio verso un lead (20261002210100): pausa
        -- agenti, stop, lista stop, telefono. Primo messaggio, conferma e
        -- promemoria sono testi fissi ('system'), il resto lo scrive l'agente.
        SELECT * INTO v_gate FROM public.crm_lead_send_gate(
            m.contact_id, 'whatsapp',
            CASE WHEN m.purpose IN ('first_message', 'call_confirm', 'call_reminder') THEN 'system' ELSE 'agent' END
        );
        IF v_gate.r_reason = 'brake' THEN
            RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::boolean,
                NULL::text, NULL::text, NULL::text, 60, 'brake'::text;
            RETURN;
        END IF;

        v_cancel := CASE
            WHEN NOT v_gate.r_allowed THEN CASE v_gate.r_reason
                WHEN 'stop' THEN 'Ha chiesto di non essere più contattato.'
                WHEN 'suppressed' THEN 'Telefono nella lista stop.'
                WHEN 'no_phone' THEN 'Contatto senza telefono.'
                WHEN 'not_found' THEN 'Contatto non trovato.'
                ELSE 'Invio non permesso (' || coalesce(v_gate.r_reason, '?') || ').'
            END
            WHEN m.stage = 'perso' THEN 'Locale in Perso.'
            WHEN m.purpose = 'first_message' AND v_template IS NULL THEN 'Primo messaggio automatico spento.'
            WHEN m.purpose = 'first_message' AND m.first_contacted_at IS NOT NULL THEN 'Locale già contattato.'
            WHEN m.purpose = 'first_message' AND EXISTS (
                SELECT 1 FROM public.crm_messages o
                WHERE o.venue_id = m.venue_id AND o.id <> m.id
                  AND (o.direction = 'in' OR o.author = 'person' OR o.status IN ('sending', 'sent'))
            ) THEN 'C''è già una conversazione.'
            WHEN m.purpose = 'call_confirm' AND v_confirm_tpl IS NULL THEN 'Conferma della telefonata spenta.'
            WHEN m.purpose = 'call_reminder' AND v_reminder_tpl IS NULL THEN 'Promemoria della telefonata spento.'
            WHEN m.purpose IN ('call_confirm', 'call_reminder') AND m.call_status IS DISTINCT FROM 'confirmed'
                THEN 'Telefonata non più confermata.'
            WHEN m.purpose = 'call_confirm' AND m.call_starts_at <= p_now THEN 'Telefonata già passata.'
            WHEN m.purpose = 'call_reminder' AND m.call_starts_at <= p_now + interval '1 hour'
                THEN 'Troppo vicino alla telefonata.'
            WHEN v_test_only AND NOT (m.phone_e164 = ANY (v_test_numbers)) THEN 'Solo numeri di prova: numero fuori lista.'
        END;
        IF v_cancel IS NOT NULL THEN
            UPDATE public.crm_messages x SET status = 'cancelled', status_reason = v_cancel WHERE x.id = m.id;
            CONTINUE;
        END IF;

        CONTINUE WHEN m.agent_hold_at IS NOT NULL;
        CONTINUE WHEN EXISTS (
            SELECT 1 FROM public.crm_messages p
            WHERE p.venue_id = m.venue_id AND p.author = 'person'
              AND coalesce(p.sent_at, p.created_at) > p_now - interval '30 minutes'
        );
        CONTINUE WHEN (
            m.purpose IN ('follow_up', 'call_reminder')
            OR (m.purpose = 'first_message'
                AND coalesce(m.received_at, m.created_at) < p_now - interval '30 minutes')
            OR (m.purpose = 'call_confirm' AND m.created_at < p_now - interval '30 minutes')
        ) AND public.crm_wa_is_quiet(p_now);
        CONTINUE WHEN m.purpose = 'first_message' AND v_first_today >= 30;
        CONTINUE WHEN m.purpose IN ('first_message', 'reply') AND (
            SELECT count(*) FROM public.crm_messages a
            WHERE a.venue_id = m.venue_id AND a.author = 'agent' AND a.status = 'sent'
              AND a.sent_at >= v_day_start
              AND a.sent_at > coalesce((
                  SELECT max(i.sent_at) FROM public.crm_messages i
                  WHERE i.venue_id = m.venue_id AND i.direction = 'in'
              ), '-infinity'::timestamptz)
        ) >= 3;

        UPDATE public.crm_messages x
        SET status = 'sending', claimed_at = p_now, attempts = x.attempts + 1
        WHERE x.id = m.id;
        UPDATE public.crm_wa_channel c
        SET next_send_at = p_now + make_interval(secs => 120 + floor(random() * 121))
        WHERE c.id;

        RETURN QUERY SELECT m.id, m.venue_id, m.phone_e164, m.contact_name, m.venue_name, m.name_pending,
            m.body, m.purpose,
            CASE m.purpose
                WHEN 'first_message' THEN v_template
                WHEN 'call_confirm' THEN v_confirm_tpl
                WHEN 'call_reminder' THEN v_reminder_tpl
            END,
            0, 'send'::text;
        RETURN;
    END LOOP;

    RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::boolean,
        NULL::text, NULL::text, NULL::text, 60, 'empty'::text;
END;
$$;

-- -----------------------------------------------------------------------------
-- crm_wa_report_result: rifatta da 20261002220100, solo il motivo nel diario
-- per conferma e promemoria (prima cadevano su «Follow-up.»)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_wa_report_result(
    p_message_id    uuid,
    p_ok            boolean,
    p_wa_message_id text DEFAULT NULL,
    p_error         text DEFAULT NULL,
    p_now           timestamptz DEFAULT now()
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_msg       record;
    v_failures  integer;
    v_brake     boolean;
    v_decision  uuid;
    v_locked    boolean;
BEGIN
    SELECT x.id, x.venue_id, x.lead_id, x.purpose, x.body INTO v_msg
    FROM public.crm_messages x WHERE x.id = p_message_id AND x.status = 'sending'
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'message_not_sending' USING ERRCODE = 'P0002';
    END IF;

    IF p_ok THEN
        IF v_msg.body IS NULL THEN
            RAISE EXCEPTION 'message_without_body' USING ERRCODE = '22023';
        END IF;
        INSERT INTO public.crm_agent_decisions (actor, action, reason, venue_id, lead_id, payload)
        VALUES ('agent', 'message_sent',
                CASE v_msg.purpose
                    WHEN 'first_message' THEN 'Primo messaggio automatico a un lead nuovo.'
                    WHEN 'reply' THEN 'Risposta al lead.'
                    WHEN 'call_confirm' THEN 'Conferma della telefonata fissata.'
                    WHEN 'call_reminder' THEN 'Promemoria della telefonata di domani.'
                    ELSE 'Follow-up.'
                END,
                v_msg.venue_id, v_msg.lead_id,
                jsonb_build_object('message_id', v_msg.id, 'purpose', v_msg.purpose))
        RETURNING id INTO v_decision;

        UPDATE public.crm_messages x
        SET status = 'sent', status_reason = NULL, sent_at = p_now, decision_id = v_decision,
            wa_message_id = coalesce(x.wa_message_id, left(nullif(btrim(p_wa_message_id), ''), 200))
        WHERE x.id = v_msg.id;

        UPDATE public.crm_wa_channel c SET failures_in_row = 0 WHERE c.id;

        SELECT v.stage_locked_at IS NOT NULL INTO v_locked FROM public.crm_venues v WHERE v.id = v_msg.venue_id;
        IF v_msg.purpose = 'first_message' AND NOT v_locked THEN
            PERFORM public.crm_move_stage(p_venue_id := v_msg.venue_id, p_stage := 'contattato', p_expected_stage := 'nuovo');
        END IF;
        UPDATE public.crm_venues v SET last_activity_at = greatest(v.last_activity_at, p_now) WHERE v.id = v_msg.venue_id;
        RETURN NULL;
    END IF;

    UPDATE public.crm_messages x
    SET status = 'failed',
        status_reason = left(coalesce(nullif(btrim(p_error), ''), 'Invio non riuscito.'), 300)
    WHERE x.id = v_msg.id;

    UPDATE public.crm_wa_channel c SET failures_in_row = c.failures_in_row + 1 WHERE c.id
    RETURNING c.failures_in_row INTO v_failures;
    SELECT s.brake_on INTO v_brake FROM public.crm_settings s WHERE s.id;
    IF v_failures >= 3 AND NOT v_brake THEN
        PERFORM public.crm_set_brake(true, '3 invii WhatsApp falliti di fila.', 'channel');
        RETURN 'failures';
    END IF;
    RETURN NULL;
END;
$$;
