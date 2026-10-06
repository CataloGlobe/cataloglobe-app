-- =============================================================================
-- CRM interno (Fase 1, F1-3 + F1-4a): risposta di chi deve chiamare
-- =============================================================================
-- Decisione di Alex del 2026-10-04. Quando la telefonata la fissa chi non ha
-- il locale, chi chiama riceve «Puoi tu?» con tre risposte:
--   * Sì, chiamo io                → crm_answer_call (230100), invariata
--   * Propongo un altro orario     → crm_call_propose_other: la telefonata si
--                                    annulla e nasce una bozza per il lead,
--                                    da approvare come le altre
--   * Chiamala tu                  → crm_handover_call: passa a chi l'ha
--                                    fissata, confermata
-- Senza risposta: lo stesso «Puoi tu?» dopo 30 minuti (caller_reminded_at) e,
-- a 2 ore dalla telefonata, crm_handover_call dal sistema.
-- ⚠️ SYNC con processAgenda (_shared/crmAgendaJob.ts: callerReminderDue,
-- handoverAt) e con crm_agenda_has_work qui sotto.
BEGIN;

ALTER TABLE public.crm_appointments
    ADD COLUMN IF NOT EXISTS caller_reminded_at timestamptz;

-- -----------------------------------------------------------------------------
-- crm_handover_call: la telefonata passa a chi l'ha fissata
-- -----------------------------------------------------------------------------
-- p_actor_user_id = chi doveva chiamare («Chiamala tu»), oppure NULL dal
-- service role (nessuna risposta a 2 ore dall'orario). Ritorna 'confirmed',
-- NULL se la telefonata non è più da confermare.
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
BEGIN
    SELECT * INTO a FROM public.crm_appointments x WHERE x.id = p_appointment_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'appointment_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF a.status <> 'proposed' THEN
        RETURN NULL;
    END IF;
    -- Una persona può passarla solo se la telefonata è sua.
    IF v_actor IS NOT NULL AND v_actor IS DISTINCT FROM a.caller_user_id THEN
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
                               'handed_over_to', a.created_by, 'no_answer', v_actor IS NULL));
    RETURN 'confirmed';
END;
$$;

-- -----------------------------------------------------------------------------
-- crm_call_propose_other: chi deve chiamare propone un altro orario
-- -----------------------------------------------------------------------------
-- La telefonata proposta si annulla e nasce una bozza «Serve una persona» col
-- testo per il lead (scritto dall'edge, al singolare), che passa dalle solite
-- decisioni su Telegram. Ritorna l'id della bozza, NULL se la telefonata non
-- è più da confermare. CL008 se il locale ha già una bozza aperta.
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
BEGIN
    IF v_text IS NULL OR char_length(v_text) > 1000 THEN
        RAISE EXCEPTION 'invalid_text' USING ERRCODE = '22023';
    END IF;
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
    IF EXISTS (SELECT 1 FROM public.crm_agent_drafts d WHERE d.venue_id = a.venue_id AND d.status = 'pending') THEN
        RAISE EXCEPTION 'draft_open' USING ERRCODE = 'CL008';
    END IF;

    UPDATE public.crm_appointments x
    SET status             = 'cancelled',
        status_reason      = 'Chi doveva chiamare ha proposto un altro orario.',
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
-- crm_agenda_has_work: da 230100, con sollecito e passaggio
-- -----------------------------------------------------------------------------
-- Uguale alla versione di 20261003230100 più le ultime due condizioni.
-- Passaggio: a 2 ore dall'orario, ma mai prima di 30 minuti dal «Puoi tu?»
-- e mai dopo 10 minuti dall'orario.
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
               AND p_now >= a.caller_asked_at + interval '30 minutes' AND a.starts_at > p_now)
           OR (a.status = 'proposed' AND a.caller_asked_at IS NOT NULL AND a.starts_at > p_now
               AND a.created_by IS NOT NULL AND a.created_by <> a.caller_user_id
               AND p_now >= least(greatest(a.starts_at - interval '2 hours', a.caller_asked_at + interval '30 minutes'),
                                  a.starts_at - interval '10 minutes'))
    );
$$;

COMMIT;
