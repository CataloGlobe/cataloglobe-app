-- =============================================================================
-- CRM: punti della review di Lorenzo del 2026-10-05 che toccano il database
-- (promemoria «punti minori di #213, #216, #217»; gli altri sono in #241).
--
--   2. La riattivazione parte con purpose 'follow_up', non 'reply': è un
--      messaggio non richiesto, quindi rispetta le fasce di quiete
--      (crm_wa_is_quiet) come i solleciti. Tocca crm_agent_decide_draft.
--   3. crm_agent_candidates non restituisce i candidati che l'edge salterebbe
--      comunque (solleciti spenti, notte): non occupano più posti nel LIMIT e
--      non tolgono spazio alle risposte. Stesse condizioni di crmAgentJob.ts.
--   6. «Era sbagliata» riconosce un invio autonomo da un campo esplicito,
--      crm_agent_drafts.sent_autonomously, non da decided_by IS NULL.
--      Tocca crm_agent_auto_send e crm_agent_decide_draft.
--   7. crm_purge_gea_inbox per la conservazione dei 12 mesi (chiamata da
--      crm-purge, grant nel file 200100). crm_gea_today resta senza tetto:
--      Gea conta le voci della lista, un tetto le farebbe dire un numero
--      sbagliato (decisione di Alex del 2026-10-05).
--
-- Ogni CREATE OR REPLACE parte da pg_get_functiondef su staging del
-- 2026-10-05; cambia solo ciò che è segnato «review 2026-10-05».
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 6. Campo esplicito per l'invio autonomo
-- -----------------------------------------------------------------------------
ALTER TABLE public.crm_agent_drafts
    ADD COLUMN IF NOT EXISTS sent_autonomously boolean NOT NULL DEFAULT false;

-- Le bozze già partite da sole: inviate senza una persona, o segnate come
-- sbagliate dopo (l'unico percorso che scrive 'Era sbagliata.').
UPDATE public.crm_agent_drafts d
SET sent_autonomously = true
WHERE d.status = 'sent' AND d.kind IN ('reply', 'follow_up')
  AND (d.decided_by IS NULL OR d.reason = 'Era sbagliata.');

CREATE OR REPLACE FUNCTION public.crm_agent_auto_send(p_draft_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    d          record;
    v_on       boolean;
    v_auto     boolean;
    v_decision uuid;
    v_message  uuid;
BEGIN
    -- Pausa agenti: niente invii da soli (il blocco invii li fermerebbe in
    -- coda, ma la bozza resta da approvare invece di risultare partita).
    SELECT s.agent_autonomy_on AND NOT s.brake_on INTO v_on FROM public.crm_settings s WHERE s.id;
    IF NOT coalesce(v_on, false) THEN
        RETURN false;
    END IF;
    SELECT * INTO d FROM public.crm_agent_drafts x WHERE x.id = p_draft_id FOR UPDATE;
    IF NOT FOUND OR d.status <> 'pending' OR d.kind NOT IN ('reply', 'follow_up') OR d.proposed_text IS NULL THEN
        RETURN false;
    END IF;
    -- Locale in mano a una persona, in Perso o cliente: si approva a mano.
    IF NOT EXISTS (SELECT 1 FROM public.crm_venues v
                   WHERE v.id = d.venue_id AND v.agent_hold_at IS NULL
                     AND v.stage NOT IN ('perso', 'cliente_pagante')) THEN
        RETURN false;
    END IF;
    -- Lock sulla fiducia: una correzione decisa nello stesso momento la
    -- azzera prima di questa lettura o aspetta la fine dell'invio.
    SELECT t.autonomous INTO v_auto FROM public.crm_agent_trust t WHERE t.kind = d.kind FOR UPDATE;
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
    -- review 2026-10-05: sent_autonomously, letto da «Era sbagliata».
    UPDATE public.crm_agent_drafts x
    SET status = 'sent', final_text = d.proposed_text, message_id = v_message, decision_id = v_decision,
        reason = 'Inviata in autonomia.', sent_autonomously = true
    WHERE x.id = d.id;
    UPDATE public.crm_agent_trust t SET total_auto = t.total_auto + 1, updated_at = now() WHERE t.kind = d.kind;
    RETURN true;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 2 e 6. crm_agent_decide_draft
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_agent_decide_draft(p_draft_id uuid, p_decision text, p_text text DEFAULT NULL::text, p_actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
    v_stage     text;
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
    -- correzione (il tipo torna in approvazione per 3). Se è ancora in coda
    -- non parte più; se è già partito, si corregge a mano in chat.
    IF p_decision = 'wrong' THEN
        IF d.reason = 'Era sbagliata.' THEN
            RETURN NULL;
        END IF;
        -- review 2026-10-05: l'invio autonomo si riconosce da sent_autonomously.
        IF d.status <> 'sent' OR NOT d.sent_autonomously OR d.decided_by IS NOT NULL
           OR d.kind NOT IN ('reply', 'follow_up') THEN
            RAISE EXCEPTION 'decision_not_allowed' USING ERRCODE = '22023';
        END IF;
        UPDATE public.crm_agent_drafts x SET reason = 'Era sbagliata.', decided_by = v_actor, decided_at = now()
        WHERE x.id = d.id;
        UPDATE public.crm_messages m SET status = 'cancelled', status_reason = 'Segnato come sbagliato.'
        WHERE m.id = d.message_id AND m.status = 'queued';
        IF FOUND THEN
            v_status := 'wrong_stopped';
        END IF;
        UPDATE public.crm_agent_trust t
        SET approved_in_row = 0, since = NULL, total_edited = t.total_edited + 1, updated_at = now()
        WHERE t.kind = d.kind;
        INSERT INTO public.crm_agent_decisions (actor, actor_user_id, action, reason, venue_id, lead_id, decided_by, decided_at, payload)
        VALUES ('person', v_actor, 'draft_wrong', 'Messaggio autonomo segnato come sbagliato: il tipo torna in approvazione.',
                d.venue_id, d.lead_id, v_actor, now(), jsonb_build_object('draft_id', d.id, 'kind', d.kind));
        RETURN coalesce(v_status, 'wrong');
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
            IF NOT public.crm_move_stage(
                p_venue_id := d.venue_id, p_stage := 'contattato', p_expected_stage := 'perso', p_actor_user_id := v_actor
            ) THEN
                RAISE EXCEPTION 'stage_changed' USING ERRCODE = 'AG001';
            END IF;
        END IF;
        INSERT INTO public.crm_agent_decisions (actor, actor_user_id, action, reason, venue_id, lead_id, decided_by, decided_at, payload)
        VALUES ('person', v_actor, CASE WHEN p_decision = 'send' THEN 'draft_sent' ELSE 'draft_edited' END,
                CASE WHEN p_decision = 'send' THEN 'Bozza approvata così com''è.' ELSE 'Bozza corretta da una persona.' END,
                d.venue_id, d.lead_id, v_actor, now(),
                jsonb_build_object('draft_id', d.id, 'kind', d.kind))
        RETURNING id INTO v_decision;

        -- review 2026-10-05: la riattivazione è un messaggio non richiesto,
        -- parte come 'follow_up' e quindi fuori dalle fasce di quiete.
        INSERT INTO public.crm_messages
            (venue_id, contact_id, lead_id, direction, author, purpose, status, body, draft_id, decision_id)
        VALUES (d.venue_id, d.contact_id, d.lead_id, 'out', 'agent',
                CASE WHEN d.kind IN ('follow_up', 'reactivation') THEN 'follow_up' ELSE 'reply' END,
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
        -- Nel frattempo il locale è cambiato (già in Perso, magari per uno
        -- stop, o cliente) o il lead ha scritto: la proposta non vale più.
        -- Mai sovrascrivere un lost_kind 'stop' (lo legge il blocco invii).
        SELECT v.stage INTO v_stage FROM public.crm_venues v WHERE v.id = d.venue_id FOR UPDATE;
        IF v_stage IS NULL OR v_stage IN ('perso', 'cliente_pagante')
           OR EXISTS (SELECT 1 FROM public.crm_messages m
                      WHERE m.venue_id = d.venue_id AND m.direction = 'in' AND m.created_at > d.created_at) THEN
            UPDATE public.crm_agent_drafts x SET status = 'expired', reason = 'Il locale è cambiato nel frattempo.'
            WHERE x.id = d.id;
            RETURN 'expired';
        END IF;
        UPDATE public.crm_agent_drafts x SET status = 'handled', reason = 'Messo in Perso.', decided_by = v_actor, decided_at = now()
        WHERE x.id = d.id;
        IF NOT public.crm_move_stage(
            p_venue_id := d.venue_id, p_stage := 'perso', p_expected_stage := v_stage, p_lost_kind := 'obiezione',
            p_lost_reason := 'Nessuna risposta dopo i follow-up.', p_actor_user_id := v_actor
        ) THEN
            RAISE EXCEPTION 'stage_changed' USING ERRCODE = 'AG001';
        END IF;
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
$function$;

-- -----------------------------------------------------------------------------
-- 3. crm_agent_candidates: fuori i candidati che l'edge salterebbe
-- -----------------------------------------------------------------------------
-- Stesse condizioni di crmAgentJob.ts: proposta di Perso, sollecito e ritorno
-- in Perso solo coi solleciti accesi; proposta di Perso, sollecito e
-- riattivazione mai di notte (crm_agent_is_night, gemella di isAgentNight).
-- L'edge tiene i suoi controlli (una lettura vecchia di un istante non fa
-- danni); qui si toglie solo il peso sul LIMIT.
CREATE OR REPLACE FUNCTION public.crm_agent_candidates(p_now timestamp with time zone DEFAULT now(), p_limit integer DEFAULT 5)
 RETURNS TABLE(r_venue_id uuid, r_kind text, r_last_in_id uuid, r_last_in_at timestamp with time zone, r_last_out_at timestamp with time zone, r_follow_ups integer, r_objection boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
    WITH x AS (
        SELECT v.id AS venue_id, v.stage, v.stage_locked_at IS NOT NULL AS locked,
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
                       WHERE m.venue_id = v.id AND m.status IN ('queued', 'sending')) AS busy,
               -- I follow-up si contano dall'ultima risposta del lead o
               -- dall'ultima riattivazione partita, se è dopo.
               greatest(
                   coalesce((SELECT max(m.created_at) FROM public.crm_messages m
                             WHERE m.venue_id = v.id AND m.direction = 'in'), '-infinity'::timestamptz),
                   coalesce((SELECT max(d.decided_at) FROM public.crm_agent_drafts d
                             WHERE d.venue_id = v.id AND d.kind = 'reactivation' AND d.status IN ('sent', 'edited')),
                            '-infinity'::timestamptz)
               ) AS count_from,
               (SELECT max(d.decided_at) FROM public.crm_agent_drafts d
                WHERE d.venue_id = v.id AND d.kind = 'reactivation' AND d.status IN ('sent', 'edited')) AS last_reactivation
        FROM public.crm_venues v
        WHERE v.stage NOT IN ('perso', 'cliente_pagante') AND v.agent_hold_at IS NULL
          AND EXISTS (SELECT 1 FROM public.crm_messages m0 WHERE m0.venue_id = v.id)
    ),
    -- review 2026-10-05: interruttore dei solleciti e notte, letti una volta.
    k AS (
        SELECT coalesce((SELECT s.agent_followups_on FROM public.crm_settings s WHERE s.id), false) AS followups_on,
               public.crm_agent_is_night(p_now) AS night
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
        -- Proposta di Perso: 10 follow-up inviati senza risposta, l'ultimo da 48 ore.
        SELECT x.venue_id, 'lost_proposal'::text, x.last_in_id, x.last_in, x.last_agent_sent,
               (SELECT count(*)::integer FROM public.crm_messages f
                WHERE f.venue_id = x.venue_id AND f.purpose = 'follow_up' AND f.status = 'sent'
                  AND f.sent_at > x.count_from),
               false
        FROM x, k
        WHERE k.followups_on AND NOT k.night
          AND x.stage <> 'nuovo'
          AND x.last_agent_sent IS NOT NULL AND x.last_agent_sent < p_now - interval '48 hours'
          AND (x.last_in IS NULL OR x.last_in < x.last_agent_sent)
          AND NOT x.busy
          AND x.last_agent_sent >= coalesce(x.last_out, x.last_agent_sent)
          AND (x.last_person IS NULL OR x.last_person < p_now - interval '30 minutes')
          AND (SELECT count(*) FROM public.crm_messages f
               WHERE f.venue_id = x.venue_id AND f.purpose = 'follow_up' AND f.status = 'sent'
                 AND f.sent_at > x.count_from) >= 10
          AND NOT EXISTS (
              SELECT 1 FROM public.crm_agent_drafts d
              WHERE d.venue_id = x.venue_id AND d.status <> 'expired' AND d.kind = 'lost_proposal'
                AND d.created_at >= x.last_agent_sent
          )
          -- Telefonata in agenda o già fatta: niente solleciti né proposta di
          -- Perso (la conferma e il promemoria della telefonata sono messaggi
          -- dell'agente e farebbero ripartire il conto).
          AND NOT EXISTS (
              SELECT 1 FROM public.crm_appointments a
              WHERE a.venue_id = x.venue_id AND a.status IN ('proposed', 'confirmed', 'done')
          )
        UNION ALL
        SELECT x.venue_id, 'follow_up'::text, x.last_in_id, x.last_in, x.last_agent_sent,
               (SELECT count(*)::integer FROM public.crm_messages f
                WHERE f.venue_id = x.venue_id AND f.purpose = 'follow_up' AND f.status = 'sent'
                  AND f.sent_at > x.count_from),
               false
        FROM x, k
        WHERE k.followups_on AND NOT k.night
          AND x.stage <> 'nuovo'
          AND x.last_agent_sent IS NOT NULL AND x.last_agent_sent < p_now - interval '24 hours'
          AND x.last_agent_sent >= coalesce(x.last_out, x.last_agent_sent)
          AND (x.last_in IS NULL OR x.last_in < x.last_agent_sent)
          AND NOT x.busy
          -- Riattivazione corta: dopo il messaggio di riattivazione nessun
          -- sollecito, finché il lead non risponde.
          AND (x.last_reactivation IS NULL OR x.last_in > x.last_reactivation)
          AND NOT EXISTS (
              SELECT 1 FROM public.crm_agent_drafts d
              WHERE d.venue_id = x.venue_id AND d.status <> 'expired' AND d.created_at >= x.last_agent_sent
          )
          -- Telefonata in agenda o già fatta: niente solleciti né proposta di
          -- Perso (la conferma e il promemoria della telefonata sono messaggi
          -- dell'agente e farebbero ripartire il conto).
          AND NOT EXISTS (
              SELECT 1 FROM public.crm_appointments a
              WHERE a.venue_id = x.venue_id AND a.status IN ('proposed', 'confirmed', 'done')
          )
        UNION ALL
        -- Riattivazione senza risposta da 7 giorni: il locale torna in Perso
        -- (lo fa l'edge, senza tocco). Non ne parte un'altra: la riattivazione
        -- inviata resta, quindi al massimo 10 solleciti più 1 riattivazione.
        -- Solo da Contattato, dove l'ha messo la riattivazione, e mai con la
        -- fase bloccata: se una persona l'ha spostato, decide lei.
        -- Anche di notte, ma solo coi solleciti accesi (review 2026-10-05).
        SELECT x.venue_id, 'reactivation_lost'::text, x.last_in_id, x.last_in, x.last_reactivation, 0, false
        FROM x, k
        WHERE k.followups_on
          AND x.last_reactivation IS NOT NULL AND x.last_reactivation < p_now - interval '7 days'
          AND x.stage = 'contattato' AND NOT x.locked
          AND (x.last_in IS NULL OR x.last_in < x.last_reactivation)
          AND (x.last_person IS NULL OR x.last_person < x.last_reactivation)
          AND NOT x.busy
          AND NOT EXISTS (
              SELECT 1 FROM public.crm_agent_drafts d
              WHERE d.venue_id = x.venue_id AND d.status = 'pending'
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.crm_appointments a
              WHERE a.venue_id = x.venue_id AND a.status IN ('proposed', 'confirmed', 'done')
          )
        UNION ALL
        -- Riattivazione: Perso per obiezione da almeno N giorni, col testo
        -- impostato (vuoto = spento), telefono non in lista stop. Una volta
        -- sola: nessuna bozza aperta o decisa, al massimo 3 proposte scadute.
        -- Mai di notte (review 2026-10-05).
        SELECT v.id, 'reactivation'::text, NULL::uuid, NULL::timestamptz, v.stage_changed_at, 0, false
        FROM public.crm_venues v, public.crm_settings s, k
        WHERE s.id AND s.agent_reactivation_message IS NOT NULL AND NOT k.night
          AND v.stage = 'perso' AND v.lost_kind = 'obiezione' AND v.agent_hold_at IS NULL
          AND v.stage_changed_at < p_now - make_interval(days => s.agent_reactivation_days)
          AND EXISTS (
              SELECT 1 FROM public.crm_contacts ct
              WHERE ct.venue_id = v.id AND ct.phone_e164 IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM public.crm_suppressions su
                                WHERE su.phone_fingerprint = public.crm_phone_fingerprint(ct.phone_e164))
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.crm_agent_drafts d
              WHERE d.venue_id = v.id AND d.kind = 'reactivation' AND d.status <> 'expired'
          )
          AND (SELECT count(*) FROM public.crm_agent_drafts d
               WHERE d.venue_id = v.id AND d.kind = 'reactivation') < 3
    ) c
    ORDER BY 4 NULLS LAST
    LIMIT greatest(1, least(coalesce(p_limit, 5), 20));
$function$;

-- -----------------------------------------------------------------------------
-- 7. crm_purge_gea_inbox: conservazione dei messaggi a Gea (12 mesi)
-- -----------------------------------------------------------------------------
-- I messaggi a Gea e le sue risposte possono citare testo dei lead: stessa
-- soglia di crm_purge_messages, stessa difesa sulla soglia, dry-run di
-- default. La chiama crm-purge; grant solo a service_role nel file 200100.
CREATE OR REPLACE FUNCTION public.crm_purge_gea_inbox(
    p_cutoff  timestamptz,
    p_dry_run boolean DEFAULT true
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_count integer;
BEGIN
    IF p_cutoff IS NULL OR p_cutoff > now() - interval '11 months' THEN
        -- Difesa contro una soglia sbagliata passata dall'edge.
        RAISE EXCEPTION 'invalid_cutoff' USING ERRCODE = '22023';
    END IF;

    IF p_dry_run THEN
        SELECT count(*)::integer INTO v_count FROM public.crm_gea_inbox g WHERE g.created_at < p_cutoff;
        RETURN v_count;
    END IF;

    DELETE FROM public.crm_gea_inbox g WHERE g.created_at < p_cutoff;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

COMMIT;
