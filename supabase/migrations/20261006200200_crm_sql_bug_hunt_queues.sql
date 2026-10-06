-- =============================================================================
-- CRM: correzioni SQL dalla caccia ai bug del 2026-10-06 (parte 2)
-- =============================================================================
--
-- Corpi presi dal live di staging (md5 di prosrc uguale a quello delle
-- migration 20261006130000 e 20261004010100), cambiato solo il punto detto.
--
-- 1. crm_agent_candidates: ordine fisso e risposte prima dei solleciti. Prima
--    l'ordine era solo sull'ultimo messaggio in arrivo, NULL in fondo: coi
--    posti limitati (p_limit) i solleciti potevano passare davanti alle
--    risposte e fra pari l'ordine cambiava a ogni giro.
-- 2. crm_wa_claim_next: le righe che non possono partire adesso restano fuori
--    dal blocco di 200 righe letto per giro.
-- =============================================================================

-- 1. ---------------------------------------------------------------------------
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
    ) c (venue_id, kind, last_in_id, last_in_at, last_out_at, follow_ups, objection)
    -- Prima le risposte (il lead aspetta), poi Perso dopo la riattivazione,
    -- proposte di Perso, solleciti e riattivazioni. Dentro ogni tipo il più
    -- vecchio per primo; il locale come ultimo criterio, così l'ordine è
    -- sempre lo stesso.
    ORDER BY CASE c.kind
                 WHEN 'reply' THEN 0 WHEN 'reactivation_lost' THEN 1 WHEN 'lost_proposal' THEN 2
                 WHEN 'follow_up' THEN 3 ELSE 4
             END,
             4 NULLS LAST, 5 NULLS LAST, 1
    LIMIT greatest(1, least(coalesce(p_limit, 5), 20));
$function$;

-- 2. ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_wa_claim_next(p_now timestamp with time zone DEFAULT now())
 RETURNS TABLE(r_message_id uuid, r_venue_id uuid, r_phone text, r_contact_name text, r_venue_name text, r_name_pending boolean, r_body text, r_purpose text, r_template text, r_wait_seconds integer, r_reason text)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    v_day_start    timestamptz := date_trunc('day', p_now AT TIME ZONE 'Europe/Rome') AT TIME ZONE 'Europe/Rome';
    v_brake        boolean;
    v_template     text;
    v_confirm_tpl  text;
    v_reminder_tpl text;
    v_soon_tpl     text;
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

    SELECT s.brake_on, s.wa_first_message, s.call_confirm_message, s.call_reminder_message, s.call_soon_message,
           s.wa_test_only, s.wa_test_numbers
    INTO v_brake, v_template, v_confirm_tpl, v_reminder_tpl, v_soon_tpl, v_test_only, v_test_numbers
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
          -- Solo le righe che possono partire adesso: 200 righe ferme (primo
          -- messaggio che aspetta i suoi minuti o oltre il tetto del giorno,
          -- locale in pausa) non tengono più dietro quelle pronte. Le stesse
          -- condizioni restano nel ciclo.
          AND (q.send_after IS NULL OR q.send_after <= p_now)
          AND v.agent_hold_at IS NULL
          AND NOT (q.purpose = 'first_message' AND v_first_today >= 30)
        -- Il promemoria di un'ora prima non può aspettare: per primo.
        ORDER BY CASE q.purpose
                     WHEN 'call_soon' THEN 0 WHEN 'reply' THEN 0 WHEN 'call_confirm' THEN 1 WHEN 'call_reminder' THEN 1
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
            CASE WHEN m.purpose IN ('first_message', 'call_confirm', 'call_reminder', 'call_soon') THEN 'system' ELSE 'agent' END
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
            WHEN m.purpose = 'call_soon' AND v_soon_tpl IS NULL THEN 'Promemoria di un''ora prima spento.'
            WHEN m.purpose IN ('call_confirm', 'call_reminder', 'call_soon') AND m.call_status IS DISTINCT FROM 'confirmed'
                THEN 'Telefonata non più confermata.'
            WHEN m.purpose = 'call_confirm' AND m.call_starts_at <= p_now THEN 'Telefonata già passata.'
            WHEN m.purpose = 'call_reminder' AND m.call_starts_at <= p_now + interval '1 hour'
                THEN 'Troppo vicino alla telefonata.'
            -- Un'ora prima: non a meno di 10 minuti, e non se la telefonata
            -- nel frattempo è stata spostata più avanti.
            WHEN m.purpose = 'call_soon' AND m.call_starts_at <= p_now + interval '10 minutes'
                THEN 'Troppo vicino alla telefonata.'
            WHEN m.purpose = 'call_soon' AND m.call_starts_at > p_now + interval '70 minutes'
                THEN 'Telefonata spostata.'
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
                WHEN 'call_soon' THEN v_soon_tpl
            END,
            0, 'send'::text;
        RETURN;
    END LOOP;

    RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::boolean,
        NULL::text, NULL::text, NULL::text, 60, 'empty'::text;
END;
$function$;
