-- =============================================================================
-- CRM interno (Fase 1, F1-8): Gea 1, funzioni
-- =============================================================================
-- Tutte SECURITY INVOKER e solo per il service role (webhook di Telegram):
-- il client di /admin non le vede (GRANT in 20261004050200).
--
-- Ingresso:
--   crm_gea_receive   salva un messaggio (un vocale nasce 'ignored'); NULL se
--                     Telegram ripete lo stesso update.
--   crm_gea_claim     received → working, una volta sola. Chiude come
--                     'failed' i messaggi rimasti in 'working' da più di 5
--                     minuti (sottofondo interrotto).
--   crm_gea_finish    chiude il messaggio con la risposta (o lo lascia in
--                     attesa del tocco di conferma, 'pending').
--   crm_gea_confirm   «Sì, fallo» su un comando del gruppo 2: solo chi l'ha
--                     chiesto, una volta sola, entro 30 minuti; ritorna il
--                     comando.
--   crm_gea_log       una riga nel diario (crm_agent_decisions, attore gea)
--                     per ogni comando eseguito o rifiutato.
--
-- Strumenti di sola lettura (rispondono in jsonb, mai telefoni né email:
-- i testi liberi passano da crm_gea_mask, dei contatti resta il nome):
--   crm_gea_find_venues  locali per nome o città, al massimo 5.
--   crm_gea_venue_card   scheda di un locale: fase, chi lo ha, ultimi
--                        messaggi ed eventi, telefonata, bozza aperta.
--   crm_gea_pipeline     quanti locali per fase e per persona, nuovi in 7 giorni.
--   crm_gea_agenda       telefonate in un intervallo.
--   crm_gea_stale        lead fermi da N giorni (fuori da Perso e Cliente).
--   crm_gea_today        «cosa devo sapere oggi?»: telefonate di oggi (Roma),
--                        bozze in attesa, nuovi non contattati, fermi, spesa
--                        AI del giorno, pausa agenti.
--
-- Comandi: Gea usa le funzioni che già esistono (crm_move_stage,
-- crm_assign, crm_set_brake, con l'attore passato dal webhook). Solo la
-- nota ha una funzione sua, perché crm_add_note prende l'autore dalla
-- sessione: crm_gea_add_note.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Ingresso
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_gea_receive(
    p_user_id     uuid,
    p_source      text,
    p_chat_id     bigint,
    p_message_id  bigint,
    p_body        text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_id uuid;
BEGIN
    IF p_source NOT IN ('telegram_text', 'telegram_voice') THEN
        RAISE EXCEPTION 'invalid_source' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.crm_gea_inbox (user_id, source, chat_id, message_id, body, status)
    VALUES (p_user_id, p_source, p_chat_id, p_message_id,
            left(nullif(btrim(p_body), ''), 4000),
            CASE WHEN p_source = 'telegram_voice' THEN 'ignored' ELSE 'received' END)
    ON CONFLICT (chat_id, message_id) DO NOTHING
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

-- Toglie da un testo libero numeri di telefono ed email prima che arrivi a
-- Claude (messaggi dei lead, note, bozze).
CREATE OR REPLACE FUNCTION public.crm_gea_mask(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
    SELECT regexp_replace(
               regexp_replace(p_text, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[email]', 'g'),
               '\+?[0-9][0-9 .\-/]{6,}[0-9]', '[numero]', 'g');
$$;

CREATE OR REPLACE FUNCTION public.crm_gea_claim(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
BEGIN
    -- Un comando confermato torna a 'working' alla conferma: i 5 minuti
    -- contano da lì, non dalla domanda (review di Lorenzo, 2026-10-04).
    UPDATE public.crm_gea_inbox i
    SET status = 'failed', error = 'interrotto', answered_at = now()
    WHERE i.status = 'working'
      AND coalesce(i.confirmed_at, i.created_at) < now() - interval '5 minutes';

    UPDATE public.crm_gea_inbox i SET status = 'working'
    WHERE i.id = p_id AND i.status = 'received';
    RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_gea_finish(
    p_id       uuid,
    p_status   text,
    p_intent   text DEFAULT NULL,
    p_tool     text DEFAULT NULL,
    p_reply    text DEFAULT NULL,
    p_cost_usd numeric DEFAULT 0,
    p_error    text DEFAULT NULL,
    p_pending  jsonb DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
BEGIN
    IF p_status NOT IN ('answered', 'pending', 'refused', 'failed') THEN
        RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
    END IF;
    UPDATE public.crm_gea_inbox i
    SET status          = p_status,
        intent          = coalesce(p_intent, i.intent),
        tool            = coalesce(p_tool, i.tool),
        reply           = left(p_reply, 4000),
        cost_usd        = i.cost_usd + greatest(coalesce(p_cost_usd, 0), 0),
        error           = left(p_error, 300),
        pending_command = CASE WHEN p_status = 'pending' THEN p_pending END,
        answered_at     = now()
    WHERE i.id = p_id AND i.status = 'working';
    RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_gea_confirm(p_id uuid, p_actor_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_command jsonb;
BEGIN
    SELECT i.pending_command INTO v_command
    FROM public.crm_gea_inbox i
    WHERE i.id = p_id AND i.status = 'pending' AND i.user_id = p_actor_user_id
      AND i.answered_at > now() - interval '30 minutes'
    FOR UPDATE;
    IF v_command IS NULL THEN
        RETURN NULL;
    END IF;
    UPDATE public.crm_gea_inbox i
    SET status = 'working', pending_command = NULL,
        confirmed_by = p_actor_user_id, confirmed_at = now()
    WHERE i.id = p_id;
    RETURN v_command;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_gea_log(
    p_actor_user_id uuid,
    p_action        text,
    p_reason        text,
    p_venue_id      uuid DEFAULT NULL,
    p_payload       jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_id uuid;
BEGIN
    INSERT INTO public.crm_agent_decisions (actor, actor_user_id, action, reason, venue_id, payload)
    VALUES ('gea', p_actor_user_id, p_action, left(coalesce(nullif(btrim(p_reason), ''), p_action), 500),
            p_venue_id, coalesce(p_payload, '{}'::jsonb))
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- Strumenti di sola lettura
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_gea_find_venues(p_query text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_q text := btrim(coalesce(p_query, ''));
    v_like text;
BEGIN
    IF char_length(v_q) < 2 OR char_length(v_q) > 120 THEN
        RETURN '[]'::jsonb;
    END IF;
    v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    RETURN coalesce((
        SELECT jsonb_agg(row_to_json(r)::jsonb ORDER BY r.starts_with DESC, r.last_activity_at DESC)
        FROM (
            SELECT v.id, v.name, v.city, v.stage, v.lost_kind, m.display_name AS assigned_to, v.last_activity_at,
                   (v.name ILIKE (replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%')) AS starts_with
            FROM public.crm_venues v
            LEFT JOIN public.crm_team_members m ON m.user_id = v.assigned_to
            WHERE v.name ILIKE v_like OR v.city ILIKE v_like
            ORDER BY starts_with DESC, v.last_activity_at DESC
            LIMIT 5
        ) r
    ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_gea_venue_card(p_venue_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
    SELECT jsonb_build_object(
        'id', v.id,
        'name', v.name,
        'city', v.city,
        'stage', v.stage,
        'lost_kind', v.lost_kind,
        'lost_reason', public.crm_gea_mask(v.lost_reason),
        'assigned_to', m.display_name,
        'created_at', v.created_at,
        'stage_changed_at', v.stage_changed_at,
        'last_activity_at', v.last_activity_at,
        'contact_names', (
            SELECT coalesce(jsonb_agg(c.name ORDER BY c.created_at), '[]'::jsonb)
            FROM public.crm_contacts c WHERE c.venue_id = v.id
        ),
        'source', (
            SELECT l.source FROM public.crm_leads l WHERE l.venue_id = v.id
            ORDER BY l.received_at DESC LIMIT 1
        ),
        'last_messages', (
            SELECT coalesce(jsonb_agg(x ORDER BY x.at), '[]'::jsonb) FROM (
                SELECT msg.created_at AS at, msg.direction, msg.author, msg.kind,
                       left(public.crm_gea_mask(msg.body), 300) AS text, msg.status
                FROM public.crm_messages msg
                WHERE msg.venue_id = v.id
                ORDER BY msg.created_at DESC LIMIT 6
            ) x
        ),
        'last_events', (
            SELECT coalesce(jsonb_agg(x ORDER BY x.at), '[]'::jsonb) FROM (
                SELECT e.created_at AS at, e.type, em.display_name AS who,
                       left(public.crm_gea_mask(e.payload ->> 'text'), 300) AS note,
                       e.payload ->> 'to' AS stage_to
                FROM public.crm_events e
                LEFT JOIN public.crm_team_members em ON em.user_id = e.actor_user_id
                WHERE e.venue_id = v.id
                ORDER BY e.created_at DESC LIMIT 8
            ) x
        ),
        'next_call', (
            SELECT jsonb_build_object('starts_at', a.starts_at, 'status', a.status, 'caller', am.display_name)
            FROM public.crm_appointments a
            LEFT JOIN public.crm_team_members am ON am.user_id = a.caller_user_id
            WHERE a.venue_id = v.id AND a.status IN ('proposed', 'confirmed') AND a.ends_at > now()
            ORDER BY a.starts_at LIMIT 1
        ),
        'open_draft', (
            SELECT jsonb_build_object('kind', d.kind, 'created_at', d.created_at, 'text', left(public.crm_gea_mask(d.proposed_text), 300))
            FROM public.crm_agent_drafts d
            WHERE d.venue_id = v.id AND d.status = 'pending'
            LIMIT 1
        )
    )
    FROM public.crm_venues v
    LEFT JOIN public.crm_team_members m ON m.user_id = v.assigned_to
    WHERE v.id = p_venue_id;
$$;

CREATE OR REPLACE FUNCTION public.crm_gea_pipeline()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
    SELECT jsonb_build_object(
        'at', now(),
        'by_stage', (
            SELECT coalesce(jsonb_object_agg(s.stage, s.n), '{}'::jsonb)
            FROM (SELECT v.stage, count(*) AS n FROM public.crm_venues v GROUP BY v.stage) s
        ),
        'by_person', (
            SELECT coalesce(jsonb_object_agg(s.who, s.n), '{}'::jsonb)
            FROM (
                SELECT coalesce(m.display_name, 'nessuno') AS who, count(*) AS n
                FROM public.crm_venues v
                LEFT JOIN public.crm_team_members m ON m.user_id = v.assigned_to
                WHERE v.stage NOT IN ('perso', 'cliente_pagante')
                GROUP BY 1
            ) s
        ),
        'new_last_7_days', (
            SELECT count(DISTINCT l.venue_id) FROM public.crm_leads l
            WHERE l.received_at >= now() - interval '7 days'
        ),
        'total', (SELECT count(*) FROM public.crm_venues)
    );
$$;

CREATE OR REPLACE FUNCTION public.crm_gea_agenda(p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
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
      AND p_to - p_from <= interval '62 days'
      AND a.status IN ('proposed', 'confirmed', 'done', 'no_show', 'postponed');
$$;

CREATE OR REPLACE FUNCTION public.crm_gea_stale(p_days integer DEFAULT 3)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
    SELECT coalesce(jsonb_agg(row_to_json(r)::jsonb ORDER BY r.last_activity_at), '[]'::jsonb)
    FROM (
        SELECT v.id, v.name, v.city, v.stage, m.display_name AS assigned_to, v.last_activity_at
        FROM public.crm_venues v
        LEFT JOIN public.crm_team_members m ON m.user_id = v.assigned_to
        WHERE v.stage NOT IN ('perso', 'cliente_pagante')
          AND v.last_activity_at < now() - make_interval(days => least(greatest(coalesce(p_days, 3), 1), 90))
        ORDER BY v.last_activity_at
        LIMIT 15
    ) r;
$$;

CREATE OR REPLACE FUNCTION public.crm_gea_today()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_day_start timestamptz := date_trunc('day', now() AT TIME ZONE 'Europe/Rome') AT TIME ZONE 'Europe/Rome';
    v_day_end   timestamptz := (date_trunc('day', now() AT TIME ZONE 'Europe/Rome') + interval '1 day') AT TIME ZONE 'Europe/Rome';
BEGIN
    RETURN jsonb_build_object(
        'at', now(),
        'calls_today', public.crm_gea_agenda(v_day_start, v_day_end),
        'drafts_pending', (
            SELECT coalesce(jsonb_agg(jsonb_build_object(
                       'venue', v.name, 'kind', d.kind, 'created_at', d.created_at) ORDER BY d.created_at), '[]'::jsonb)
            FROM public.crm_agent_drafts d
            JOIN public.crm_venues v ON v.id = d.venue_id
            WHERE d.status = 'pending'
        ),
        'new_not_contacted', (
            SELECT coalesce(jsonb_agg(jsonb_build_object(
                       'venue', v.name, 'city', v.city, 'since', v.created_at) ORDER BY v.created_at), '[]'::jsonb)
            FROM public.crm_venues v
            WHERE v.stage = 'nuovo'
        ),
        'stale', public.crm_gea_stale(3),
        'brake_on', (SELECT s.brake_on FROM public.crm_settings s WHERE s.id),
        'ai_spend_today_usd', (
            SELECT coalesce(sum(u.cost_usd), 0) FROM public.crm_ai_usage u
            WHERE u.created_at >= v_day_start
        )
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- Nota scritta da Gea per conto di una persona del team
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_gea_add_note(
    p_venue_id      uuid,
    p_text          text,
    p_actor_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_text text := nullif(btrim(p_text), '');
    v_id   uuid;
BEGIN
    IF v_text IS NULL OR char_length(v_text) > 4000 THEN
        RAISE EXCEPTION 'invalid_note' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.crm_team_members m WHERE m.user_id = p_actor_user_id) THEN
        RAISE EXCEPTION 'not_team_member' USING ERRCODE = '42501';
    END IF;

    UPDATE public.crm_venues v SET last_activity_at = now() WHERE v.id = p_venue_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'venue_not_found' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.crm_events (venue_id, type, actor_user_id, payload)
    VALUES (p_venue_id, 'note', p_actor_user_id, jsonb_build_object('text', v_text, 'via', 'gea'))
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

COMMIT;
