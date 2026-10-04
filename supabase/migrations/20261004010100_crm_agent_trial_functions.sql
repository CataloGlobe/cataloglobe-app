-- =============================================================================
-- CRM interno (Fase 1, F1-3): agente WhatsApp in prova, funzioni
-- =============================================================================
--   crm_agent_is_night(at)                    da mezzanotte alle 6:30 di Roma
--   crm_agent_decide_draft(id, decision, ...)  il tocco di una persona sulla
--                                              bozza (Telegram, via service role)
--   crm_agent_mark_stop(venue, reason, ...)    stop: Perso (stop), coda e
--                                              telefonate annullate
--   crm_agent_has_work(now)                    cron: c'è qualcosa per l'edge?
--   crm_agent_candidates(now, limit)           i locali su cui lavorare adesso
--   crm_agent_drafts_touch                     trigger: updated_at
--   crm_wa_enqueue_first_message               rifatta da 20261002220100: il
--                                              primo messaggio aspetta 2-5 minuti
--   crm_wa_claim_next                          rifatta da 20261003230100: salta
--                                              ciò che non è pronto (send_after)
--                                              e tutto da mezzanotte alle 6:30
-- =============================================================================

-- ⚠️ SYNC con isAgentNight (supabase/functions/_shared/crmAgentRules.ts).
CREATE OR REPLACE FUNCTION public.crm_agent_is_night(p_at timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
    SELECT (p_at AT TIME ZONE 'Europe/Rome')::time < time '06:30';
$$;

CREATE OR REPLACE FUNCTION public.crm_agent_drafts_touch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_agent_drafts_touch ON public.crm_agent_drafts;
CREATE TRIGGER crm_agent_drafts_touch
    BEFORE UPDATE ON public.crm_agent_drafts
    FOR EACH ROW EXECUTE FUNCTION public.crm_agent_drafts_touch();

-- Accendere le risposte segna da quando: contano i messaggi dei lead arrivati dopo.
CREATE OR REPLACE FUNCTION public.crm_settings_agent_trial_since()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
BEGIN
    IF NEW.agent_replies_on AND NOT coalesce(OLD.agent_replies_on, false) THEN
        NEW.agent_replies_on_since := now();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_settings_agent_trial_since ON public.crm_settings;
CREATE TRIGGER crm_settings_agent_trial_since
    BEFORE UPDATE OF agent_replies_on ON public.crm_settings
    FOR EACH ROW EXECUTE FUNCTION public.crm_settings_agent_trial_since();

-- -----------------------------------------------------------------------------
-- crm_agent_mark_stop: il lead non vuole essere contattato
-- -----------------------------------------------------------------------------
-- Perso (stop) col motivo, messaggi in coda annullati, telefonate attive
-- annullate, bozze aperte chiuse. p_actor_user_id NULL = stop esplicito
-- riconosciuto dalle regole (il sistema), altrimenti chi ha toccato «È uno
-- stop». Ritorna false se il locale era già in stop.
CREATE OR REPLACE FUNCTION public.crm_agent_mark_stop(
    p_venue_id       uuid,
    p_reason         text,
    p_actor_user_id  uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_actor   uuid := public.crm_bind_agent_actor(p_actor_user_id);
    v_reason  text := left(coalesce(nullif(btrim(p_reason), ''), 'Ha chiesto di non essere più contattato.'), 300);
    v         record;
BEGIN
    SELECT x.stage, x.lost_kind INTO v FROM public.crm_venues x WHERE x.id = p_venue_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'venue_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF v.stage = 'perso' AND v.lost_kind = 'stop' THEN
        RETURN false;
    END IF;

    -- Lo stop vale anche con la fase bloccata a mano: si sblocca.
    UPDATE public.crm_venues x SET stage_locked_at = NULL WHERE x.id = p_venue_id AND x.stage_locked_at IS NOT NULL;
    PERFORM public.crm_move_stage(
        p_venue_id := p_venue_id, p_stage := 'perso', p_lost_kind := 'stop',
        p_lost_reason := v_reason, p_actor_user_id := v_actor
    );

    UPDATE public.crm_messages m
    SET status = 'cancelled', status_reason = 'Ha chiesto di non essere più contattato.'
    WHERE m.venue_id = p_venue_id AND m.status = 'queued';

    PERFORM set_config('crm.agenda_write', 'on', true);
    UPDATE public.crm_appointments a
    SET status = 'cancelled', status_reason = 'Stop del lead.',
        google_sync = CASE WHEN a.google_event_id IS NOT NULL OR a.google_sync = 'pending' THEN 'pending' ELSE 'none' END,
        google_rev = a.google_rev + 1
    WHERE a.venue_id = p_venue_id AND a.status IN ('proposed', 'confirmed');

    UPDATE public.crm_agent_drafts d
    SET status = 'expired', reason = 'Stop del lead.'
    WHERE d.venue_id = p_venue_id AND d.status = 'pending';

    INSERT INTO public.crm_agent_decisions (actor, actor_user_id, action, reason, venue_id)
    VALUES (CASE WHEN v_actor IS NULL THEN 'system' ELSE 'person' END, v_actor, 'lead_stop', v_reason, p_venue_id);
    RETURN true;
END;
$$;

-- -----------------------------------------------------------------------------
-- crm_agent_decide_draft: il tocco di una persona
-- -----------------------------------------------------------------------------
--   send       «Invia così»: il testo proposto va in coda
--   edit       «Lo correggo io»: p_text va in coda al posto della bozza
--   discard    «Non mandare»
--   schedule   «Va bene» su un orario accettato dal lead: fissa la telefonata
--              (la conferma al lead la manda l'agenda, F1-4a)
--   other      «Proponi altro»: chiusa, al giro dopo l'agente propone altri orari
--   handle     «Lo gestisco io»: «La prendo io» sul locale
--   stop       «È uno stop»                    (stop_check)
--   objection  «È un'obiezione»: l'agente può rispondere (stop_check)
-- Ritorna lo stato nuovo della bozza, o NULL se era già decisa (secondo tocco,
-- o deciso da un altro): chi chiama riscrive il messaggio e basta.
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
    IF p_decision IS NULL OR p_decision NOT IN ('send', 'edit', 'discard', 'schedule', 'other', 'handle', 'stop', 'objection') THEN
        RAISE EXCEPTION 'invalid_decision' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO d FROM public.crm_agent_drafts x WHERE x.id = p_draft_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'draft_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF d.status <> 'pending' THEN
        RETURN NULL;
    END IF;

    -- Tasti ammessi per tipo.
    IF (p_decision IN ('stop', 'objection') AND d.kind <> 'stop_check')
       OR (p_decision IN ('schedule', 'other') AND d.kind <> 'schedule')
       OR (p_decision = 'send' AND (d.kind = 'stop_check' OR d.proposed_text IS NULL))
       OR (p_decision = 'edit' AND d.kind = 'stop_check') THEN
        RAISE EXCEPTION 'decision_not_allowed' USING ERRCODE = '22023';
    END IF;
    IF p_decision = 'edit' AND (v_text IS NULL OR char_length(v_text) > 1000) THEN
        RAISE EXCEPTION 'invalid_text' USING ERRCODE = '22023';
    END IF;

    v_trust := CASE WHEN d.kind IN ('reply', 'follow_up') THEN d.kind END;

    IF p_decision IN ('send', 'edit') THEN
        v_body := CASE WHEN p_decision = 'send' THEN d.proposed_text ELSE v_text END;
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

-- -----------------------------------------------------------------------------
-- crm_agent_has_work: c'è qualcosa per l'edge crm-agent?
-- -----------------------------------------------------------------------------
-- ⚠️ SYNC con processAgent (_shared/crmAgentJob.ts): falso positivo = una
-- chiamata a vuoto (l'edge non spende nulla se non c'è da scrivere), falso
-- negativo = lead senza risposta. I follow-up qui contano dalle 24 ore
-- (l'attesa precisa, tra 24 e 48, la decide l'edge per locale).
CREATE OR REPLACE FUNCTION public.crm_agent_has_work(p_now timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
    WITH s AS (SELECT agent_replies_on, agent_followups_on, brake_on FROM public.crm_settings WHERE id)
    SELECT
        -- Bozze aperte: solleciti, scadenze.
        EXISTS (
            SELECT 1 FROM public.crm_agent_drafts d
            WHERE d.status = 'pending'
              AND (d.notified_at IS NULL
                   OR d.created_at < p_now - interval '48 hours'
                   OR (d.reminders < 12 AND NOT public.crm_agent_is_night(p_now)
                       AND coalesce(d.last_reminded_at, d.notified_at) < p_now - interval '5 minutes'))
        )
        OR (
            (SELECT agent_replies_on AND NOT brake_on FROM s)
            AND NOT public.crm_agent_is_night(p_now)
            AND EXISTS (
                SELECT 1
                FROM public.crm_venues v
                JOIN LATERAL (
                    SELECT max(m.created_at) FILTER (WHERE m.direction = 'in') AS last_in,
                           max(coalesce(m.sent_at, m.created_at)) FILTER (
                               WHERE m.direction = 'out' AND (m.author = 'person' OR m.status IN ('queued', 'sending', 'sent'))
                           ) AS last_out
                    FROM public.crm_messages m WHERE m.venue_id = v.id
                ) x ON true
                WHERE v.stage NOT IN ('perso', 'cliente_pagante') AND v.agent_hold_at IS NULL
                  AND x.last_in IS NOT NULL AND (x.last_out IS NULL OR x.last_in > x.last_out)
                  AND x.last_in > coalesce((SELECT agent_replies_on_since FROM public.crm_settings WHERE id), '-infinity'::timestamptz)
                  -- Già gestito: una bozza (decisa, scartata, stop o obiezione)
                  -- nata dopo l'ultimo messaggio del lead.
                  AND NOT EXISTS (
                      SELECT 1 FROM public.crm_agent_drafts d
                      WHERE d.venue_id = v.id AND d.status <> 'expired' AND d.created_at >= x.last_in
                        AND NOT (d.kind = 'stop_check' AND d.status = 'handled' AND d.reason = 'Obiezione, non stop.')
                        AND NOT (d.kind = 'schedule' AND d.status = 'handled' AND d.reason = 'Proponi altri orari.')
                  )
            )
        )
        OR (
            (SELECT agent_followups_on AND NOT brake_on FROM s)
            AND NOT public.crm_agent_is_night(p_now)
            AND EXISTS (
                SELECT 1
                FROM public.crm_venues v
                JOIN LATERAL (
                    SELECT max(m.created_at) FILTER (WHERE m.direction = 'in') AS last_in,
                           max(m.sent_at) FILTER (WHERE m.direction = 'out' AND m.status = 'sent') AS last_sent,
                           bool_or(m.status IN ('queued', 'sending')) AS busy
                    FROM public.crm_messages m WHERE m.venue_id = v.id
                ) x ON true
                WHERE v.stage NOT IN ('perso', 'cliente_pagante', 'nuovo') AND v.agent_hold_at IS NULL
                  AND x.last_sent IS NOT NULL AND x.last_sent < p_now - interval '24 hours'
                  AND (x.last_in IS NULL OR x.last_in < x.last_sent)
                  AND NOT coalesce(x.busy, false)
                  AND NOT EXISTS (
                      SELECT 1 FROM public.crm_agent_drafts d
                      WHERE d.venue_id = v.id AND d.status <> 'expired' AND d.created_at >= x.last_sent
                  )
            )
        );
$$;


-- -----------------------------------------------------------------------------
-- crm_agent_candidates: i locali su cui l'agente deve lavorare adesso
-- -----------------------------------------------------------------------------
-- r_kind 'reply': il lead ha scritto dopo l'ultima uscita (nostra o a mano),
-- nessuna bozza nata dopo quel messaggio (salvo «È un'obiezione»), nessuno ha
-- scritto a mano nell'ultima mezz'ora. r_kind 'follow_up': l'ultima uscita è
-- dell'agente, inviata da almeno 24 ore, il lead non ha più scritto, niente
-- in coda; r_follow_ups = follow-up già inviati dopo l'ultimo messaggio del
-- lead (l'edge decide l'attesa precisa tra 24 e 48 ore e il tetto di 10).
-- Esclusi: Perso, Cliente pagante, «La prendo io». ⚠️ SYNC con
-- crm_agent_has_work (stesse condizioni, più larghe là).
CREATE OR REPLACE FUNCTION public.crm_agent_candidates(p_now timestamptz DEFAULT now(), p_limit integer DEFAULT 5)
RETURNS TABLE (
    r_venue_id     uuid,
    r_kind         text,
    r_last_in_id   uuid,
    r_last_in_at   timestamptz,
    r_last_out_at  timestamptz,
    r_follow_ups   integer,
    r_objection    boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
    WITH x AS (
        SELECT v.id AS venue_id, v.stage,
               (SELECT m.id FROM public.crm_messages m
                WHERE m.venue_id = v.id AND m.direction = 'in' ORDER BY m.created_at DESC LIMIT 1) AS last_in_id,
               (SELECT max(m.created_at) FROM public.crm_messages m
                WHERE m.venue_id = v.id AND m.direction = 'in') AS last_in,
               (SELECT max(coalesce(m.sent_at, m.created_at)) FROM public.crm_messages m
                WHERE m.venue_id = v.id AND m.direction = 'out'
                  AND (m.author = 'person' OR m.status IN ('queued', 'sending', 'sent'))) AS last_out,
               (SELECT max(m.sent_at) FROM public.crm_messages m
                WHERE m.venue_id = v.id AND m.direction = 'out' AND m.author = 'agent' AND m.status = 'sent') AS last_agent_sent,
               (SELECT max(coalesce(m.sent_at, m.created_at)) FROM public.crm_messages m
                WHERE m.venue_id = v.id AND m.author = 'person') AS last_person,
               EXISTS (SELECT 1 FROM public.crm_messages m
                       WHERE m.venue_id = v.id AND m.status IN ('queued', 'sending')) AS busy
        FROM public.crm_venues v
        WHERE v.stage NOT IN ('perso', 'cliente_pagante') AND v.agent_hold_at IS NULL
          AND EXISTS (SELECT 1 FROM public.crm_messages m0 WHERE m0.venue_id = v.id)
    )
    SELECT * FROM (
        SELECT x.venue_id, 'reply'::text, x.last_in_id, x.last_in, x.last_out, 0,
               EXISTS (SELECT 1 FROM public.crm_agent_drafts d
                       WHERE d.venue_id = x.venue_id AND d.kind = 'stop_check' AND d.status = 'handled'
                         AND d.reason = 'Obiezione, non stop.' AND d.created_at >= x.last_in)
        FROM x
        WHERE x.last_in IS NOT NULL AND (x.last_out IS NULL OR x.last_in > x.last_out)
          AND x.last_in > coalesce((SELECT agent_replies_on_since FROM public.crm_settings WHERE id), '-infinity'::timestamptz)
          AND (x.last_person IS NULL OR x.last_person < p_now - interval '30 minutes')
          AND NOT EXISTS (
              SELECT 1 FROM public.crm_agent_drafts d
              WHERE d.venue_id = x.venue_id AND d.status <> 'expired' AND d.created_at >= x.last_in
                AND NOT (d.kind = 'stop_check' AND d.status = 'handled' AND d.reason = 'Obiezione, non stop.')
                AND NOT (d.kind = 'schedule' AND d.status = 'handled' AND d.reason = 'Proponi altri orari.')
          )
        UNION ALL
        SELECT x.venue_id, 'follow_up'::text, x.last_in_id, x.last_in, x.last_agent_sent,
               (SELECT count(*)::integer FROM public.crm_messages f
                WHERE f.venue_id = x.venue_id AND f.purpose = 'follow_up' AND f.status = 'sent'
                  AND f.sent_at > coalesce(x.last_in, '-infinity'::timestamptz)),
               false
        FROM x
        WHERE x.stage <> 'nuovo'
          AND x.last_agent_sent IS NOT NULL AND x.last_agent_sent < p_now - interval '24 hours'
          AND x.last_agent_sent >= coalesce(x.last_out, x.last_agent_sent)
          AND (x.last_in IS NULL OR x.last_in < x.last_agent_sent)
          AND NOT x.busy
          AND NOT EXISTS (
              SELECT 1 FROM public.crm_agent_drafts d
              WHERE d.venue_id = x.venue_id AND d.status <> 'expired' AND d.created_at >= x.last_agent_sent
          )
    ) c
    ORDER BY 4 NULLS LAST
    LIMIT greatest(1, least(coalesce(p_limit, 5), 20));
$$;

-- -----------------------------------------------------------------------------
-- crm_wa_enqueue_first_message: rifatta da 20261002220100, il primo messaggio
-- aspetta tra 2 e 5 minuti dopo il form (send_after, call del 2026-10-03)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_wa_enqueue_first_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
    IF NEW.notified_at IS NOT NULL
       OR NEW.source NOT IN ('meta_form', 'landing')
       OR NEW.contact_id IS NULL THEN
        RETURN NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.crm_settings s WHERE s.id AND s.wa_first_message IS NOT NULL) THEN
        RETURN NULL;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.crm_contacts c WHERE c.id = NEW.contact_id AND c.phone_e164 IS NOT NULL
    ) THEN
        RETURN NULL;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.crm_venues v
        WHERE v.id = NEW.venue_id AND v.stage = 'nuovo' AND v.first_contacted_at IS NULL
          AND v.agent_hold_at IS NULL
    ) THEN
        RETURN NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM public.crm_messages m WHERE m.venue_id = NEW.venue_id) THEN
        RETURN NULL;
    END IF;

    INSERT INTO public.crm_messages (venue_id, contact_id, lead_id, direction, author, purpose, status, send_after)
    VALUES (NEW.venue_id, NEW.contact_id, NEW.id, 'out', 'agent', 'first_message', 'queued',
            now() + make_interval(secs => 120 + floor(random() * 181)::integer))
    ON CONFLICT (venue_id) WHERE purpose = 'first_message' AND status <> 'cancelled' DO NOTHING;
    RETURN NULL;
END;
$$;

-- -----------------------------------------------------------------------------
-- crm_wa_claim_next: rifatta da 20261003230100. Cambia solo: salta i messaggi
-- con send_after nel futuro e, da mezzanotte alle 6:30, ogni messaggio
-- dell'agente (crm_agent_is_night). Il resto è identico.
-- -----------------------------------------------------------------------------
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
               ap.status AS call_status, ap.starts_at AS call_starts_at,
               q.send_after
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
        -- Il primo messaggio aspetta 2-5 minuti dopo il form (send_after);
        -- da mezzanotte alle 6:30 l'agente non scrive (call del 2026-10-03).
        CONTINUE WHEN m.send_after IS NOT NULL AND m.send_after > p_now;
        CONTINUE WHEN public.crm_agent_is_night(p_now);
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
