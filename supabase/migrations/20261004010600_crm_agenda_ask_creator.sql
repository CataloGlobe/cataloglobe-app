-- =============================================================================
-- CRM interno (Fase 1, F1-4a): «Puoi tu?», chi deve chiamare chiede a chi
-- l'ha fissata
-- =============================================================================
-- Decisione di Alex del 2026-10-04 (versione B). Il terzo tasto del «Puoi tu?»
-- non passa più subito la telefonata: chiede a chi l'ha fissata se può farla
-- lui, alla stessa ora.
--   * crm_call_ask_creator          → segna la domanda (creator_asked_at)
--   * Sì, chiamo io (chi l'ha fissata) → crm_handover_call, che ora accetta
--                                       anche chi l'ha fissata dopo la domanda
--   * No, proponi un altro orario   → crm_call_propose_other, idem
-- Senza risposta: niente sollecito a chi doveva chiamare (ha già risposto) e,
-- a 2 ore dalla telefonata, crm_handover_call dal sistema come prima.
-- La domanda vale solo per l'ultimo «Puoi tu?»: se la telefonata cambia ora o
-- chi chiama, caller_asked_at si azzera e poi si riscrive più tardi, quindi
-- creator_asked_at < caller_asked_at = domanda vecchia.
-- ⚠️ SYNC con processAgenda (_shared/crmAgendaJob.ts: creatorAsked) e con
-- crm_agenda_has_work qui sotto.

BEGIN;

ALTER TABLE public.crm_appointments
    ADD COLUMN IF NOT EXISTS creator_asked_at timestamptz;

COMMENT ON COLUMN public.crm_appointments.creator_asked_at IS
    'Quando chi doveva chiamare ha chiesto a chi l''ha fissata di farla lui (vale se >= caller_asked_at).';

-- -----------------------------------------------------------------------------
-- crm_call_ask_creator: «Chiedo a {nome} se può lui»
-- -----------------------------------------------------------------------------
-- Ritorna 'asked', NULL se la telefonata non è più da confermare.
CREATE OR REPLACE FUNCTION public.crm_call_ask_creator(
    p_appointment_id  uuid,
    p_actor_user_id   uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_actor  uuid := public.crm_agenda_begin(p_actor_user_id);
    a        record;
BEGIN
    SELECT * INTO a FROM public.crm_appointments x WHERE x.id = p_appointment_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'appointment_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF a.status <> 'proposed' THEN
        RETURN NULL;
    END IF;
    IF v_actor IS DISTINCT FROM a.caller_user_id THEN
        RAISE EXCEPTION 'not_the_caller' USING ERRCODE = 'CL006';
    END IF;
    IF a.created_by IS NULL OR a.created_by = a.caller_user_id THEN
        RAISE EXCEPTION 'no_one_to_hand_over' USING ERRCODE = 'CL007';
    END IF;

    UPDATE public.crm_appointments x
    SET creator_asked_at = now()
    WHERE x.id = a.id;

    INSERT INTO public.crm_events (venue_id, lead_id, type, actor_user_id, payload)
    VALUES (a.venue_id, a.lead_id, 'call_caller_answered', v_actor,
            jsonb_build_object('appointment_id', a.id, 'starts_at', a.starts_at, 'accepted', false,
                               'asked_creator', a.created_by));
    RETURN 'asked';
END;
$$;

-- -----------------------------------------------------------------------------
-- crm_handover_call: da 20261004010400, accetta anche chi l'ha fissata
-- -----------------------------------------------------------------------------
-- p_actor_user_id = chi doveva chiamare (vecchio «Chiamala tu»), chi l'ha
-- fissata dopo la domanda («Sì, chiamo io»), oppure NULL dal service role
-- (nessuna risposta a 2 ore dall'orario).
CREATE OR REPLACE FUNCTION public.crm_handover_call(
    p_appointment_id  uuid,
    p_actor_user_id   uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_actor  uuid := public.crm_agenda_begin(p_actor_user_id);
    a        record;
    v_asked  boolean;
BEGIN
    SELECT * INTO a FROM public.crm_appointments x WHERE x.id = p_appointment_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'appointment_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF a.status <> 'proposed' THEN
        RETURN NULL;
    END IF;
    v_asked := a.creator_asked_at IS NOT NULL AND a.caller_asked_at IS NOT NULL
               AND a.creator_asked_at >= a.caller_asked_at;
    -- Una persona può passarla solo se la telefonata è sua, o prenderla se
    -- gliel'hanno chiesto.
    IF v_actor IS NOT NULL AND v_actor IS DISTINCT FROM a.caller_user_id
       AND NOT (v_asked AND v_actor = a.created_by) THEN
        RAISE EXCEPTION 'not_the_caller' USING ERRCODE = 'CL006';
    END IF;
    IF a.created_by IS NULL OR a.created_by = a.caller_user_id THEN
        RAISE EXCEPTION 'no_one_to_hand_over' USING ERRCODE = 'CL007';
    END IF;
    -- Orario passato (CL003), chi l'ha fissata non è nel team (22023) o ha già
    -- un'altra telefonata a quell'ora (CL001).
    PERFORM public.crm_agenda_check_slot(a.starts_at, a.ends_at, a.created_by, a.id, false);

    UPDATE public.crm_appointments x
    SET caller_user_id     = a.created_by,
        status             = 'confirmed',
        status_reason      = NULL,
        caller_answered_at = now(),
        time_set_at        = now(),
        google_sync        = 'pending',
        google_rev         = x.google_rev + 1,
        google_error       = NULL
    WHERE x.id = a.id;

    INSERT INTO public.crm_events (venue_id, lead_id, type, actor_user_id, payload)
    VALUES (a.venue_id, a.lead_id, 'call_caller_answered', v_actor,
            jsonb_build_object('appointment_id', a.id, 'starts_at', a.starts_at, 'accepted', false,
                               'handed_over_to', a.created_by, 'no_answer', v_actor IS NULL,
                               'creator_accepted', v_actor IS NOT NULL AND v_actor = a.created_by));
    RETURN 'confirmed';
END;
$$;

-- -----------------------------------------------------------------------------
-- crm_call_propose_other: da 20261004010400, accetta anche chi l'ha fissata
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_call_propose_other(
    p_appointment_id  uuid,
    p_text            text,
    p_actor_user_id   uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_actor  uuid := public.crm_agenda_begin(p_actor_user_id);
    v_text   text := nullif(btrim(coalesce(p_text, '')), '');
    a        record;
    v_draft  uuid;
    v_asked  boolean;
BEGIN
    IF v_text IS NULL OR char_length(v_text) > 1000 THEN
        RAISE EXCEPTION 'invalid_text' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO a FROM public.crm_appointments x WHERE x.id = p_appointment_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'appointment_not_found' USING ERRCODE = 'P0002';
    END IF;
    v_asked := a.creator_asked_at IS NOT NULL AND a.caller_asked_at IS NOT NULL
               AND a.creator_asked_at >= a.caller_asked_at;
    IF v_actor IS DISTINCT FROM a.caller_user_id AND NOT (v_asked AND v_actor = a.created_by) THEN
        RAISE EXCEPTION 'not_the_caller' USING ERRCODE = 'CL006';
    END IF;
    IF a.status <> 'proposed' THEN
        RETURN NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM public.crm_agent_drafts d WHERE d.venue_id = a.venue_id AND d.status = 'pending') THEN
        RAISE EXCEPTION 'draft_open' USING ERRCODE = 'CL008';
    END IF;

    UPDATE public.crm_appointments x
    SET status             = 'cancelled',
        status_reason      = CASE WHEN v_actor = a.caller_user_id
                                  THEN 'Chi doveva chiamare ha proposto un altro orario.'
                                  ELSE 'Chi l''ha fissata ha proposto un altro orario.' END,
        caller_answered_at = now(),
        google_sync        = CASE WHEN x.google_event_id IS NOT NULL THEN 'pending' ELSE 'none' END,
        google_rev         = x.google_rev + 1,
        google_error       = NULL
    WHERE x.id = a.id;

    INSERT INTO public.crm_agent_drafts (venue_id, lead_id, contact_id, kind, status, proposed_text, reason)
    VALUES (a.venue_id, a.lead_id, a.contact_id, 'ask', 'pending', v_text,
            'Chi doveva chiamare non può a quell''ora e propone un altro orario.')
    RETURNING id INTO v_draft;

    INSERT INTO public.crm_events (venue_id, lead_id, type, actor_user_id, payload)
    VALUES (a.venue_id, a.lead_id, 'call_caller_answered', v_actor,
            jsonb_build_object('appointment_id', a.id, 'starts_at', a.starts_at, 'accepted', false,
                               'proposed_other', true, 'draft_id', v_draft));
    RETURN v_draft;
END;
$$;

-- -----------------------------------------------------------------------------
-- crm_agenda_has_work: da 20261004010400, niente sollecito dopo la domanda
-- -----------------------------------------------------------------------------
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
           OR (a.google_sync = 'error' AND a.updated_at < p_now - interval '15 minutes')
           OR (a.status = 'proposed' AND a.starts_at <= p_now)
           OR (a.status = 'confirmed' AND a.ends_at < p_now - interval '3 days')
           OR (a.status = 'proposed' AND a.caller_asked_at IS NULL AND a.starts_at > p_now)
           OR (a.status = 'confirmed' AND a.brief_sent_at IS NULL
               AND p_now >= a.starts_at - interval '60 minutes' AND p_now < a.ends_at)
           OR (a.status = 'confirmed' AND a.outcome_asked_at IS NULL
               AND p_now >= a.ends_at + interval '5 minutes' AND p_now < a.ends_at + interval '3 days')
           OR (a.status = 'proposed' AND a.caller_asked_at IS NOT NULL AND a.caller_reminded_at IS NULL
               AND NOT (a.creator_asked_at IS NOT NULL AND a.creator_asked_at >= a.caller_asked_at)
               AND p_now >= a.caller_asked_at + interval '30 minutes' AND a.starts_at > p_now)
           OR (a.status = 'proposed' AND a.caller_asked_at IS NOT NULL AND a.starts_at > p_now
               AND a.created_by IS NOT NULL AND a.created_by <> a.caller_user_id
               AND p_now >= least(greatest(a.starts_at - interval '2 hours', a.caller_asked_at + interval '30 minutes'),
                                  a.starts_at - interval '10 minutes'))
    );
$$;

COMMIT;
