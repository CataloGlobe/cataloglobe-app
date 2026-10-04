-- =============================================================================
-- CRM interno (F1-6): funzioni rifatte da 20261004010100 con proposta di Perso
-- e riattivazione. Cambiano solo:
--   crm_agent_decide_draft  decisione 'lost' (proposta di Perso → Perso,
--                           obiezione); l'invio di una riattivazione riporta
--                           il locale in Contattato (mai uno stop)
--   crm_agent_candidates    tipi 'lost_proposal' e 'reactivation'
--   crm_agent_has_work      riattivazioni dovute
-- L'ACL non cambia (CREATE OR REPLACE la conserva).
-- =============================================================================

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
    IF p_decision IS NULL OR p_decision NOT IN ('send', 'edit', 'discard', 'schedule', 'other', 'handle', 'stop', 'objection', 'lost') THEN
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
          AND (x.last_person IS NULL OR x.last_person < p_now - interval '30 minutes')
          AND NOT EXISTS (
              SELECT 1 FROM public.crm_agent_drafts d
              WHERE d.venue_id = x.venue_id AND d.status <> 'expired' AND d.created_at >= x.last_in
                AND NOT (d.kind = 'stop_check' AND d.status = 'handled' AND d.reason = 'Obiezione, non stop.')
          )
        UNION ALL
        -- Proposta di Perso: 10 follow-up inviati senza risposta, l'ultimo da 48 ore.
        SELECT x.venue_id, 'lost_proposal'::text, x.last_in_id, x.last_in, x.last_agent_sent,
               (SELECT count(*)::integer FROM public.crm_messages f
                WHERE f.venue_id = x.venue_id AND f.purpose = 'follow_up' AND f.status = 'sent'
                  AND f.sent_at > coalesce(x.last_in, '-infinity'::timestamptz)),
               false
        FROM x
        WHERE x.stage <> 'nuovo'
          AND x.last_agent_sent IS NOT NULL AND x.last_agent_sent < p_now - interval '48 hours'
          AND (x.last_in IS NULL OR x.last_in < x.last_agent_sent)
          AND NOT x.busy
          AND (SELECT count(*) FROM public.crm_messages f
               WHERE f.venue_id = x.venue_id AND f.purpose = 'follow_up' AND f.status = 'sent'
                 AND f.sent_at > coalesce(x.last_in, '-infinity'::timestamptz)) >= 10
          AND NOT EXISTS (
              SELECT 1 FROM public.crm_agent_drafts d
              WHERE d.venue_id = x.venue_id AND d.status <> 'expired' AND d.kind = 'lost_proposal'
                AND d.created_at >= x.last_agent_sent
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
        UNION ALL
        -- Riattivazione: Perso per obiezione da almeno N giorni, mai riattivato
        -- prima, col testo impostato (vuoto = spento).
        SELECT v.id, 'reactivation'::text, NULL::uuid, NULL::timestamptz, v.stage_changed_at, 0, false
        FROM public.crm_venues v, public.crm_settings s
        WHERE s.id AND s.agent_reactivation_message IS NOT NULL
          AND v.stage = 'perso' AND v.lost_kind = 'obiezione' AND v.agent_hold_at IS NULL
          AND v.stage_changed_at < p_now - make_interval(days => s.agent_reactivation_days)
          AND EXISTS (SELECT 1 FROM public.crm_contacts ct WHERE ct.venue_id = v.id AND ct.phone_e164 IS NOT NULL)
          AND NOT EXISTS (
              SELECT 1 FROM public.crm_agent_drafts d
              WHERE d.venue_id = v.id AND d.kind = 'reactivation' AND d.status <> 'expired'
          )
    ) c
    ORDER BY 4 NULLS LAST
    LIMIT greatest(1, least(coalesce(p_limit, 5), 20));
$$;

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
        EXISTS (SELECT 1 FROM public.crm_agent_drafts d WHERE d.status = 'pending')
        OR (
            (SELECT agent_replies_on AND NOT brake_on FROM s)
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
                  -- Già gestito: una bozza (decisa, scartata, stop o obiezione)
                  -- nata dopo l'ultimo messaggio del lead.
                  AND NOT EXISTS (
                      SELECT 1 FROM public.crm_agent_drafts d
                      WHERE d.venue_id = v.id AND d.status <> 'expired' AND d.created_at >= x.last_in
                        AND NOT (d.kind = 'stop_check' AND d.status = 'handled' AND d.reason = 'Obiezione, non stop.')
                  )
            )
        )
        OR (
            (SELECT agent_replies_on AND NOT brake_on AND agent_reactivation_message IS NOT NULL FROM public.crm_settings WHERE id)
            AND EXISTS (
                SELECT 1 FROM public.crm_venues v, public.crm_settings st
                WHERE st.id AND v.stage = 'perso' AND v.lost_kind = 'obiezione' AND v.agent_hold_at IS NULL
                  AND v.stage_changed_at < p_now - make_interval(days => st.agent_reactivation_days)
                  AND NOT EXISTS (SELECT 1 FROM public.crm_agent_drafts d WHERE d.venue_id = v.id AND d.kind = 'reactivation' AND d.status <> 'expired')
            )
        )
        OR (
            (SELECT agent_followups_on AND NOT brake_on FROM s)
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
