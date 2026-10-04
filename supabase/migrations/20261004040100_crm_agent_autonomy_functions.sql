-- =============================================================================
-- CRM interno (F1-7): uscita dalla prova, funzioni
-- =============================================================================
--   crm_agent_trust_rules       trigger: ricalcola «autonomo» a ogni cambio
--   crm_agent_trust_refresh()   service: ricalcolo periodico (i 3 giorni
--                               passano anche senza approvazioni nuove)
--   crm_agent_auto_send(id)     service: invia una bozza da sola se il tipo
--                               è autonomo e l'autonomia è accesa
--   crm_agent_decide_draft      rifatta da 20261004030100 con «Era sbagliata»
-- =============================================================================

CREATE OR REPLACE FUNCTION public.crm_agent_trust_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_corrected boolean := NEW.approved_in_row = 0
        AND (NEW.total_edited > OLD.total_edited OR NEW.total_discarded > OLD.total_discarded);
BEGIN
    IF NEW.total_approved > OLD.total_approved THEN
        NEW.started_at := coalesce(OLD.started_at, now());
    END IF;
    IF v_corrected THEN
        -- Dopo averla guadagnata, una correzione chiede 3 approvate di fila.
        IF OLD.earned_once OR OLD.autonomous THEN
            NEW.required_in_row := 3;
        END IF;
        NEW.autonomous := false;
        NEW.autonomous_since := NULL;
    ELSE
        NEW.autonomous := NEW.approved_in_row >= NEW.required_in_row
            AND NEW.started_at IS NOT NULL AND NEW.started_at <= now() - interval '3 days';
    END IF;
    IF NEW.autonomous AND NOT OLD.autonomous THEN
        NEW.autonomous_since := now();
        NEW.earned_once := true;
        NEW.eligible_notified_at := NULL;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_agent_trust_rules ON public.crm_agent_trust;
CREATE TRIGGER crm_agent_trust_rules
    BEFORE UPDATE ON public.crm_agent_trust
    FOR EACH ROW EXECUTE FUNCTION public.crm_agent_trust_rules();

CREATE OR REPLACE FUNCTION public.crm_agent_trust_refresh()
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $$
    UPDATE public.crm_agent_trust t SET updated_at = now() WHERE NOT t.autonomous AND t.approved_in_row > 0;
$$;

-- Invia da sola una bozza di risposta o di follow-up, se l'autonomia è accesa
-- e il tipo l'ha guadagnata. Ritorna true se è partita (in coda), false se
-- resta da approvare. Le azioni sensibili non passano mai di qui.
CREATE OR REPLACE FUNCTION public.crm_agent_auto_send(p_draft_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    d          record;
    v_on       boolean;
    v_auto     boolean;
    v_decision uuid;
    v_message  uuid;
BEGIN
    SELECT s.agent_autonomy_on INTO v_on FROM public.crm_settings s WHERE s.id;
    IF NOT coalesce(v_on, false) THEN
        RETURN false;
    END IF;
    SELECT * INTO d FROM public.crm_agent_drafts x WHERE x.id = p_draft_id FOR UPDATE;
    IF NOT FOUND OR d.status <> 'pending' OR d.kind NOT IN ('reply', 'follow_up') OR d.proposed_text IS NULL THEN
        RETURN false;
    END IF;
    SELECT t.autonomous INTO v_auto FROM public.crm_agent_trust t WHERE t.kind = d.kind;
    IF NOT coalesce(v_auto, false) THEN
        RETURN false;
    END IF;

    INSERT INTO public.crm_agent_decisions (actor, action, reason, venue_id, lead_id, payload)
    VALUES ('agent', 'draft_auto_sent', 'Inviata in autonomia (tipo fuori dalla prova).', d.venue_id, d.lead_id,
            jsonb_build_object('draft_id', d.id, 'kind', d.kind))
    RETURNING id INTO v_decision;
    INSERT INTO public.crm_messages
        (venue_id, contact_id, lead_id, direction, author, purpose, status, body, draft_id, decision_id)
    VALUES (d.venue_id, d.contact_id, d.lead_id, 'out', 'agent',
            CASE WHEN d.kind = 'follow_up' THEN 'follow_up' ELSE 'reply' END, 'queued', d.proposed_text, d.id, v_decision)
    RETURNING id INTO v_message;
    UPDATE public.crm_agent_drafts x
    SET status = 'sent', final_text = d.proposed_text, message_id = v_message, decision_id = v_decision,
        reason = 'Inviata in autonomia.'
    WHERE x.id = d.id;
    UPDATE public.crm_agent_trust t SET total_auto = t.total_auto + 1, updated_at = now() WHERE t.kind = d.kind;
    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_agent_decide_draft(
    p_draft_id       uuid,
    p_decision       text,
    p_text           text DEFAULT NULL,
    p_actor_user_id  uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_actor     uuid := public.crm_bind_agent_actor(p_actor_user_id);
    d           record;
    v_text      text := nullif(btrim(p_text), '');
    v_status    text;
    v_body      text;
    v_message   uuid;
    v_decision  uuid;
    v_trust     text;
    v_caller    uuid;
    v_duration  integer;
    v_appt      uuid;
BEGIN
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'decision_needs_person' USING ERRCODE = '42501';
    END IF;
    IF p_decision IS NULL OR p_decision NOT IN ('send', 'edit', 'discard', 'schedule', 'other', 'handle', 'stop', 'objection', 'lost', 'wrong') THEN
        RAISE EXCEPTION 'invalid_decision' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO d FROM public.crm_agent_drafts x WHERE x.id = p_draft_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'draft_not_found' USING ERRCODE = 'P0002';
    END IF;
    -- «Era sbagliata» su un messaggio partito in autonomia: conta come una
    -- correzione (il tipo torna in approvazione per 3). Il messaggio è già
    -- partito: si corregge a mano in chat.
    IF p_decision = 'wrong' THEN
        IF d.reason = 'Era sbagliata.' THEN
            RETURN NULL;
        END IF;
        IF d.status <> 'sent' OR d.decided_by IS NOT NULL OR d.kind NOT IN ('reply', 'follow_up') THEN
            RAISE EXCEPTION 'decision_not_allowed' USING ERRCODE = '22023';
        END IF;
        UPDATE public.crm_agent_drafts x SET reason = 'Era sbagliata.', decided_by = v_actor, decided_at = now()
        WHERE x.id = d.id;
        UPDATE public.crm_agent_trust t
        SET approved_in_row = 0, since = NULL, total_edited = t.total_edited + 1, updated_at = now()
        WHERE t.kind = d.kind;
        INSERT INTO public.crm_agent_decisions (actor, actor_user_id, action, reason, venue_id, lead_id, decided_by, decided_at, payload)
        VALUES ('person', v_actor, 'draft_wrong', 'Messaggio autonomo segnato come sbagliato: il tipo torna in approvazione.',
                d.venue_id, d.lead_id, v_actor, now(), jsonb_build_object('draft_id', d.id, 'kind', d.kind));
        RETURN 'wrong';
    END IF;

    IF d.status <> 'pending' THEN
        RETURN NULL;
    END IF;

    -- Tasti ammessi per tipo.
    IF (p_decision IN ('stop', 'objection') AND d.kind <> 'stop_check')
       OR (p_decision IN ('schedule', 'other') AND d.kind <> 'schedule')
       OR (p_decision = 'send' AND (d.kind = 'stop_check' OR d.proposed_text IS NULL))
       OR (p_decision = 'edit' AND d.kind IN ('stop_check', 'lost_proposal'))
       OR (p_decision = 'send' AND d.kind = 'lost_proposal')
       OR (p_decision = 'lost' AND d.kind <> 'lost_proposal') THEN
        RAISE EXCEPTION 'decision_not_allowed' USING ERRCODE = '22023';
    END IF;
    IF p_decision = 'edit' AND (v_text IS NULL OR char_length(v_text) > 1000) THEN
        RAISE EXCEPTION 'invalid_text' USING ERRCODE = '22023';
    END IF;

    v_trust := CASE WHEN d.kind IN ('reply', 'follow_up') THEN d.kind END;

    IF p_decision IN ('send', 'edit') THEN
        v_body := CASE WHEN p_decision = 'send' THEN d.proposed_text ELSE v_text END;
        -- Riattivazione: il locale esce da Perso (obiezione), altrimenti la
        -- coda annullerebbe il messaggio («Locale in Perso»).
        IF d.kind = 'reactivation' THEN
            IF EXISTS (SELECT 1 FROM public.crm_venues v WHERE v.id = d.venue_id AND v.stage = 'perso' AND v.lost_kind = 'stop') THEN
                RAISE EXCEPTION 'contact_stopped' USING ERRCODE = '42501';
            END IF;
            PERFORM public.crm_move_stage(
                p_venue_id := d.venue_id, p_stage := 'contattato', p_expected_stage := 'perso', p_actor_user_id := v_actor
            );
        END IF;
        INSERT INTO public.crm_agent_decisions (actor, actor_user_id, action, reason, venue_id, lead_id, decided_by, decided_at, payload)
        VALUES ('person', v_actor, CASE WHEN p_decision = 'send' THEN 'draft_sent' ELSE 'draft_edited' END,
                CASE WHEN p_decision = 'send' THEN 'Bozza approvata così com''è.' ELSE 'Bozza corretta da una persona.' END,
                d.venue_id, d.lead_id, v_actor, now(),
                jsonb_build_object('draft_id', d.id, 'kind', d.kind))
        RETURNING id INTO v_decision;

        INSERT INTO public.crm_messages
            (venue_id, contact_id, lead_id, direction, author, purpose, status, body, draft_id, decision_id)
        VALUES (d.venue_id, d.contact_id, d.lead_id, 'out', 'agent',
                CASE WHEN d.kind = 'follow_up' THEN 'follow_up' ELSE 'reply' END,
                'queued', v_body, d.id, v_decision)
        RETURNING id INTO v_message;

        v_status := CASE WHEN p_decision = 'send' THEN 'sent' ELSE 'edited' END;
        UPDATE public.crm_agent_drafts x
        SET status = v_status, final_text = v_body, message_id = v_message, decision_id = v_decision,
            decided_by = v_actor, decided_at = now()
        WHERE x.id = d.id;

        IF v_trust IS NOT NULL THEN
            UPDATE public.crm_agent_trust t
            SET approved_in_row = CASE WHEN p_decision = 'send' THEN t.approved_in_row + 1 ELSE 0 END,
                since = CASE WHEN p_decision = 'send' THEN coalesce(t.since, now()) ELSE NULL END,
                total_approved = t.total_approved + (p_decision = 'send')::integer,
                total_edited = t.total_edited + (p_decision = 'edit')::integer,
                updated_at = now()
            WHERE t.kind = v_trust;
        END IF;
        RETURN v_status;
    END IF;

    IF p_decision = 'schedule' THEN
        SELECT v.assigned_to INTO v_caller FROM public.crm_venues v WHERE v.id = d.venue_id;
        IF v_caller IS NULL OR NOT EXISTS (SELECT 1 FROM public.crm_team_members m WHERE m.user_id = v_caller) THEN
            v_caller := v_actor;
        END IF;
        SELECT s.call_duration_minutes INTO v_duration FROM public.crm_settings s WHERE s.id;
        v_appt := public.crm_schedule_call(
            p_venue_id := d.venue_id, p_starts_at := d.proposed_starts_at,
            p_duration_minutes := coalesce(v_duration, 10), p_caller_user_id := v_caller,
            p_note := 'Fissata dall''agente, confermata su Telegram.', p_allow_overlap := false,
            p_actor_user_id := v_actor
        );
        UPDATE public.crm_agent_drafts x
        SET status = 'scheduled', appointment_id = v_appt, decided_by = v_actor, decided_at = now()
        WHERE x.id = d.id;
        INSERT INTO public.crm_agent_decisions (actor, actor_user_id, action, reason, venue_id, lead_id, decided_by, decided_at, payload)
        VALUES ('person', v_actor, 'call_from_agent', 'Orario accettato dal lead, telefonata fissata.',
                d.venue_id, d.lead_id, v_actor, now(), jsonb_build_object('draft_id', d.id, 'appointment_id', v_appt));
        RETURN 'scheduled';
    END IF;

    IF p_decision = 'handle' THEN
        UPDATE public.crm_venues v SET agent_hold_at = now(), agent_hold_by = v_actor
        WHERE v.id = d.venue_id AND v.agent_hold_at IS NULL;
        IF FOUND THEN
            UPDATE public.crm_messages m SET status = 'cancelled', status_reason = 'La gestisce una persona.'
            WHERE m.venue_id = d.venue_id AND m.status = 'queued';
            INSERT INTO public.crm_events (venue_id, type, actor_user_id) VALUES (d.venue_id, 'agent_hold', v_actor);
        END IF;
    END IF;

    IF p_decision = 'lost' THEN
        UPDATE public.crm_agent_drafts x SET status = 'handled', reason = 'Messo in Perso.', decided_by = v_actor, decided_at = now()
        WHERE x.id = d.id;
        PERFORM public.crm_move_stage(
            p_venue_id := d.venue_id, p_stage := 'perso', p_lost_kind := 'obiezione',
            p_lost_reason := 'Nessuna risposta dopo i follow-up.', p_actor_user_id := v_actor
        );
        INSERT INTO public.crm_agent_decisions (actor, actor_user_id, action, reason, venue_id, lead_id, decided_by, decided_at, payload)
        VALUES ('person', v_actor, 'draft_lost', 'Messo in Perso dopo i follow-up senza risposta.',
                d.venue_id, d.lead_id, v_actor, now(), jsonb_build_object('draft_id', d.id));
        RETURN 'handled';
    END IF;

    IF p_decision = 'stop' THEN
        UPDATE public.crm_agent_drafts x SET status = 'handled', reason = 'È uno stop.', decided_by = v_actor, decided_at = now()
        WHERE x.id = d.id;
        PERFORM public.crm_agent_mark_stop(d.venue_id, 'Ha chiesto di non essere più contattato (confermato su Telegram).', v_actor);
        RETURN 'handled';
    END IF;

    v_status := CASE p_decision WHEN 'discard' THEN 'discarded' ELSE 'handled' END;
    UPDATE public.crm_agent_drafts x
    SET status = v_status,
        reason = CASE p_decision
            WHEN 'other' THEN 'Proponi altri orari.'
            WHEN 'objection' THEN 'Obiezione, non stop.'
            WHEN 'handle' THEN 'La gestisce una persona.'
            ELSE x.reason
        END,
        decided_by = v_actor, decided_at = now()
    WHERE x.id = d.id;

    IF p_decision = 'discard' AND v_trust IS NOT NULL THEN
        UPDATE public.crm_agent_trust t
        SET approved_in_row = 0, since = NULL, total_discarded = t.total_discarded + 1, updated_at = now()
        WHERE t.kind = v_trust;
    END IF;

    INSERT INTO public.crm_agent_decisions (actor, actor_user_id, action, reason, venue_id, lead_id, decided_by, decided_at, payload)
    VALUES ('person', v_actor, 'draft_' || p_decision,
            CASE p_decision
                WHEN 'discard' THEN 'Bozza scartata.'
                WHEN 'other' THEN 'Chiesti altri orari.'
                WHEN 'objection' THEN 'Non è uno stop: obiezione.'
                ELSE 'La gestisce una persona.'
            END,
            d.venue_id, d.lead_id, v_actor, now(), jsonb_build_object('draft_id', d.id, 'kind', d.kind));
    RETURN v_status;
END;
$$;
