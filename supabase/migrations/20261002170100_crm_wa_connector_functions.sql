-- =============================================================================
-- CRM interno (Fase 1, F1-2): connettore WhatsApp Web, funzioni
-- =============================================================================
-- Coda e regole dell'invio (reti di sicurezza, decisioni di Alex del
-- 2026-10-01, wiki reti-di-sicurezza e whatsapp-solo-lead-meta):
--
--   * un messaggio alla volta, poi una pausa casuale di 2-4 minuti;
--   * ordine: risposte a chi ha scritto, poi primi messaggi, poi follow-up;
--   * agenti in pausa (brake_on) = niente invii;
--   * al massimo 30 primi messaggi al giorno (giorno di Roma);
--   * fasce 21:30-8:30, 12-15 e 19-22:30 (Roma): ferme per i follow-up e per
--     i primi messaggi a lead entrati da più di 30 minuti; un lead entrato da
--     meno conta come «sta scrivendo adesso» e il primo messaggio parte subito;
--   * al massimo 3 messaggi di fila senza risposta nello stesso giorno, salvo
--     i follow-up;
--   * una persona ha scritto nella chat: i messaggi in coda si annullano e
--     per mezz'ora la risposta resta a lei;
--   * «La prendo io»: l'agente non scrive a quel locale;
--   * «solo numeri di prova» acceso: fuori lista il messaggio si annulla.
--
-- Salute del canale: WhatsApp Web da ricollegare o con un avviso, 3 invii
-- falliti di fila, Mac muto da 15 minuti → agenti in pausa (fonte 'channel') e
-- avviso su Telegram (lo manda l'edge, dal codice di ritorno).
--
-- Chi le chiama:
--   * crm_wa_claim_next, crm_wa_report_result, crm_wa_heartbeat,
--     crm_wa_ingest_chat: l'edge crm-wa-worker col service role (il Mac
--     non tocca il database);
--   * crm_wa_watchdog: la stessa edge, chiamata da pg_cron (170300);
--   * crm_set_agent_hold, crm_wa_cancel_message: /admin.
-- SECURITY INVOKER, tranne il trigger che accoda il primo messaggio (vedi sotto).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Fasce in cui l'agente non scrive di sua iniziativa (ora di Roma)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_wa_is_quiet(p_at timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
    SELECT x.t >= time '21:30' OR x.t < time '08:30'
        OR (x.t >= time '12:00' AND x.t < time '15:00')
        OR (x.t >= time '19:00' AND x.t < time '22:30')
    FROM (SELECT (p_at AT TIME ZONE 'Europe/Rome')::time AS t) AS x;
$$;

-- -----------------------------------------------------------------------------
-- Guardia sui messaggi: una persona può solo annullare un messaggio in coda
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_messages_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
BEGIN
    IF auth.uid() IS NOT NULL AND NOT (OLD.status = 'queued' AND NEW.status = 'cancelled') THEN
        RAISE EXCEPTION 'message_not_cancellable' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_messages_guard ON public.crm_messages;
CREATE TRIGGER crm_messages_guard
    BEFORE UPDATE ON public.crm_messages
    FOR EACH ROW EXECUTE FUNCTION public.crm_messages_guard();

-- -----------------------------------------------------------------------------
-- Primo messaggio: si accoda quando entra un lead nuovo
-- -----------------------------------------------------------------------------
-- Solo lead delle campagne (form Meta, landing) non silenziosi (l'import CSV
-- entra già notificato: quei lead li ha già gestiti una persona), con un
-- telefono, su un locale ancora in Nuovo e mai contattato, e solo se il testo
-- del primo messaggio è impostato. Il testo si scrive all'invio.
-- SECURITY DEFINER: il lead può entrare da chiunque scriva crm_leads (copia
-- della landing, webhook Meta, una persona), e la coda non è scrivibile dalle
-- persone; un errore qui farebbe fallire l'ingresso del lead.
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

    INSERT INTO public.crm_messages (venue_id, contact_id, lead_id, direction, author, purpose, status)
    VALUES (NEW.venue_id, NEW.contact_id, NEW.id, 'out', 'agent', 'first_message', 'queued')
    ON CONFLICT (venue_id) WHERE purpose = 'first_message' AND status <> 'cancelled' DO NOTHING;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS crm_leads_enqueue_first_message ON public.crm_leads;
CREATE TRIGGER crm_leads_enqueue_first_message
    AFTER INSERT ON public.crm_leads
    FOR EACH ROW EXECUTE FUNCTION public.crm_wa_enqueue_first_message();

-- -----------------------------------------------------------------------------
-- crm_wa_claim_next: il prossimo messaggio da inviare, o perché non ce n'è
-- -----------------------------------------------------------------------------
-- r_reason: 'send' (c'è un messaggio, preso in carico: status 'sending'),
-- 'brake', 'busy' (un invio aspetta ancora l'esito), 'pacing' (pausa tra due
-- invii), 'empty' (niente da mandare adesso), 'failures' (invii rimasti senza
-- esito hanno messo in pausa gli agenti: l'edge avvisa il team).
-- r_wait_seconds: quando conviene richiedere.
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
    v_test_only    boolean;
    v_test_numbers text[];
    v_next_send    timestamptz;
    v_failures     integer;
    v_stuck        integer;
    v_first_today  integer;
    v_cancel       text;
    m              record;
BEGIN
    SELECT c.next_send_at, c.failures_in_row INTO v_next_send, v_failures
    FROM public.crm_wa_channel c WHERE c.id FOR UPDATE;

    SELECT s.brake_on, s.wa_first_message, s.wa_test_only, s.wa_test_numbers
    INTO v_brake, v_template, v_test_only, v_test_numbers
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
        SELECT q.id, q.venue_id, q.purpose, q.body, q.created_at,
               c.phone_e164, c.name AS contact_name,
               v.name AS venue_name, v.name_pending, v.stage, v.first_contacted_at, v.agent_hold_at,
               l.received_at
        FROM public.crm_messages q
        JOIN public.crm_venues v ON v.id = q.venue_id
        LEFT JOIN public.crm_contacts c ON c.id = q.contact_id
        LEFT JOIN public.crm_leads l ON l.id = q.lead_id
        WHERE q.status = 'queued'
        ORDER BY CASE q.purpose WHEN 'reply' THEN 0 WHEN 'first_message' THEN 1 ELSE 2 END, q.created_at
        LIMIT 200
        FOR UPDATE OF q SKIP LOCKED
    LOOP
        v_cancel := CASE
            WHEN m.stage = 'perso' THEN 'Locale in Perso.'
            WHEN m.phone_e164 IS NULL THEN 'Contatto senza telefono.'
            WHEN m.purpose = 'first_message' AND v_template IS NULL THEN 'Primo messaggio automatico spento.'
            WHEN m.purpose = 'first_message' AND m.first_contacted_at IS NOT NULL THEN 'Locale già contattato.'
            WHEN m.purpose = 'first_message' AND EXISTS (
                SELECT 1 FROM public.crm_messages o
                WHERE o.venue_id = m.venue_id AND o.id <> m.id
                  AND (o.direction = 'in' OR o.author = 'person' OR o.status IN ('sending', 'sent'))
            ) THEN 'C''è già una conversazione.'
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
            m.purpose = 'follow_up'
            OR (m.purpose = 'first_message'
                AND coalesce(m.received_at, m.created_at) < p_now - interval '30 minutes')
        ) AND public.crm_wa_is_quiet(p_now);
        CONTINUE WHEN m.purpose = 'first_message' AND v_first_today >= 30;
        CONTINUE WHEN m.purpose <> 'follow_up' AND (
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
            m.body, m.purpose, CASE WHEN m.purpose = 'first_message' THEN v_template END, 0, 'send'::text;
        RETURN;
    END LOOP;

    RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::boolean,
        NULL::text, NULL::text, NULL::text, 60, 'empty'::text;
END;
$$;

-- -----------------------------------------------------------------------------
-- crm_wa_report_result: esito di un invio. Ritorna 'failures' quando il terzo
-- fallimento di fila mette in pausa gli agenti (l'edge avvisa il team), altrimenti NULL.
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

-- -----------------------------------------------------------------------------
-- crm_wa_heartbeat: il Mac è vivo e dice cosa vede in WhatsApp Web.
-- Ritorna lo stato quando passa a 'needs_relink' o 'warning' (agenti in pausa,
-- l'edge avvisa il team), altrimenti NULL.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_wa_heartbeat(
    p_state   text,
    p_detail  text DEFAULT NULL,
    p_version text DEFAULT NULL,
    p_now     timestamptz DEFAULT now()
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_old     text;
    v_detail  text := left(nullif(btrim(p_detail), ''), 300);
BEGIN
    IF p_state IS NULL OR p_state NOT IN ('ok', 'needs_relink', 'warning') THEN
        RAISE EXCEPTION 'invalid_wa_state' USING ERRCODE = '22023';
    END IF;

    SELECT c.wa_state INTO v_old FROM public.crm_wa_channel c WHERE c.id FOR UPDATE;

    UPDATE public.crm_wa_channel c
    SET last_heartbeat_at = p_now,
        silent_alerted_at = NULL,
        wa_state = p_state,
        wa_state_detail = v_detail,
        wa_state_at = CASE WHEN c.wa_state IS DISTINCT FROM p_state THEN p_now ELSE c.wa_state_at END,
        worker_version = coalesce(left(nullif(btrim(p_version), ''), 40), c.worker_version)
    WHERE c.id;

    IF p_state <> 'ok' AND v_old IS DISTINCT FROM p_state THEN
        PERFORM public.crm_set_brake(
            true,
            CASE p_state
                WHEN 'needs_relink' THEN 'WhatsApp Web chiede di ricollegare il telefono.'
                ELSE left('WhatsApp Web mostra un avviso' || coalesce(': ' || v_detail, '.'), 300)
            END,
            'channel'
        );
        RETURN p_state;
    END IF;
    RETURN NULL;
END;
$$;

-- -----------------------------------------------------------------------------
-- crm_wa_watchdog: agenti attivi e Mac muto da 15 minuti → pausa (una volta
-- per silenzio). true = pausa messa adesso, l'edge avvisa il team.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_wa_watchdog(p_now timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_brake      boolean;
    v_heartbeat  timestamptz;
    v_alerted    timestamptz;
BEGIN
    SELECT s.brake_on INTO v_brake FROM public.crm_settings s WHERE s.id;
    IF v_brake THEN
        RETURN false;
    END IF;

    SELECT c.last_heartbeat_at, c.silent_alerted_at INTO v_heartbeat, v_alerted
    FROM public.crm_wa_channel c WHERE c.id FOR UPDATE;
    IF v_alerted IS NOT NULL OR (v_heartbeat IS NOT NULL AND v_heartbeat >= p_now - interval '15 minutes') THEN
        RETURN false;
    END IF;

    UPDATE public.crm_wa_channel c SET silent_alerted_at = p_now WHERE c.id;
    PERFORM public.crm_set_brake(
        true,
        CASE WHEN v_heartbeat IS NULL
            THEN 'Agenti attivi, ma il Mac di WhatsApp non si è mai collegato.'
            ELSE 'Il Mac di WhatsApp non dà segni di vita da 15 minuti.'
        END,
        'channel'
    );
    RETURN true;
END;
$$;

-- -----------------------------------------------------------------------------
-- Agenti riattivati: i contatori del canale ripartono da zero, così «3 invii falliti
-- di fila» conta di nuovo da tre e il Mac muto torna ad avvisare.
-- SECURITY DEFINER: li riattiva una persona (/admin, Telegram), che non scrive
-- crm_wa_channel.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_wa_reset_on_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
    UPDATE public.crm_wa_channel c SET failures_in_row = 0, silent_alerted_at = NULL WHERE c.id;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS crm_settings_wa_reset_on_release ON public.crm_settings;
CREATE TRIGGER crm_settings_wa_reset_on_release
    AFTER UPDATE OF brake_on ON public.crm_settings
    FOR EACH ROW
    WHEN (OLD.brake_on AND NOT NEW.brake_on)
    EXECUTE FUNCTION public.crm_wa_reset_on_release();

-- -----------------------------------------------------------------------------
-- crm_wa_ingest_chat: istantanea di una chat letta in WhatsApp Web
-- -----------------------------------------------------------------------------
-- p_messages: array di { id (data-id di WhatsApp Web), from_me, kind, text, at }.
-- Salva solo i messaggi mai visti. Un messaggio nostro che corrisponde a uno
-- dell'agente (stesso testo, ancora senza id) è quello: prende l'id. Gli
-- altri messaggi nostri li ha scritti a mano una persona: i messaggi in coda
-- si annullano e per mezz'ora la risposta resta a lei.
-- Numero che non è nel CRM: 'unknown', niente salvato.
-- Fasi: una persona ha scritto → Contattato (da Nuovo); il lead ha scritto →
-- In conversazione (da Nuovo o Contattato). Mai su una fase bloccata a mano.
-- Messaggi del lead più vecchi di 24 ore (prima lettura di una chat):
-- salvati già avvisati, niente raffica su Telegram.
CREATE OR REPLACE FUNCTION public.crm_wa_ingest_chat(
    p_phone     text,
    p_messages  jsonb,
    p_now       timestamptz DEFAULT now()
)
RETURNS TABLE (
    r_status      text,
    r_venue_id    uuid,
    r_new_in      integer,
    r_new_person  integer,
    r_matched     integer
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_contact   uuid;
    v_venue     uuid;
    v_item      jsonb;
    v_id        text;
    v_kind      text;
    v_body      text;
    v_at        timestamptz;
    v_match     uuid;
    v_new_in    integer := 0;
    v_person    integer := 0;
    v_matched   integer := 0;
    v_stage     text;
    v_locked    boolean;
BEGIN
    IF p_messages IS NULL OR jsonb_typeof(p_messages) <> 'array' OR jsonb_array_length(p_messages) > 200 THEN
        RAISE EXCEPTION 'invalid_snapshot' USING ERRCODE = '22023';
    END IF;

    SELECT c.id, c.venue_id INTO v_contact, v_venue
    FROM public.crm_contacts c WHERE c.phone_e164 = p_phone;
    IF NOT FOUND THEN
        RETURN QUERY SELECT 'unknown'::text, NULL::uuid, 0, 0, 0;
        RETURN;
    END IF;

    FOR v_item IN SELECT e.value FROM jsonb_array_elements(p_messages) AS e LOOP
        CONTINUE WHEN jsonb_typeof(v_item) <> 'object';
        v_id := left(nullif(btrim(v_item ->> 'id'), ''), 200);
        CONTINUE WHEN v_id IS NULL;
        CONTINUE WHEN EXISTS (SELECT 1 FROM public.crm_messages x WHERE x.wa_message_id = v_id);

        v_kind := coalesce(v_item ->> 'kind', 'text');
        IF v_kind NOT IN ('text', 'voice', 'image', 'video', 'document', 'sticker', 'other') THEN
            v_kind := 'other';
        END IF;
        v_body := left(nullif(btrim(v_item ->> 'text'), ''), 4000);
        BEGIN
            v_at := least(p_now, coalesce((v_item ->> 'at')::timestamptz, p_now));
        EXCEPTION WHEN others THEN
            v_at := p_now;
        END;

        IF coalesce((v_item ->> 'from_me')::boolean, false) THEN
            SELECT a.id INTO v_match
            FROM public.crm_messages a
            WHERE a.venue_id = v_venue AND a.author = 'agent'
              AND a.status IN ('sending', 'sent') AND a.wa_message_id IS NULL
              AND a.body IS NOT NULL AND btrim(a.body) = coalesce(v_body, '')
            ORDER BY a.claimed_at DESC NULLS LAST
            LIMIT 1;
            IF FOUND THEN
                UPDATE public.crm_messages x SET wa_message_id = v_id WHERE x.id = v_match;
                v_matched := v_matched + 1;
            ELSE
                INSERT INTO public.crm_messages (venue_id, contact_id, direction, author, kind, body, sent_at, wa_message_id)
                VALUES (v_venue, v_contact, 'out', 'person', v_kind, v_body, v_at, v_id);
                v_person := v_person + 1;
            END IF;
        ELSE
            INSERT INTO public.crm_messages (venue_id, contact_id, direction, author, kind, body, sent_at, wa_message_id, notified_at)
            VALUES (v_venue, v_contact, 'in', 'lead', v_kind, v_body, v_at, v_id,
                    CASE WHEN v_at < p_now - interval '24 hours' THEN p_now END);
            v_new_in := v_new_in + 1;
        END IF;
    END LOOP;

    IF v_person > 0 THEN
        UPDATE public.crm_messages x
        SET status = 'cancelled', status_reason = 'Una persona ha scritto nella chat.'
        WHERE x.venue_id = v_venue AND x.status = 'queued';

        SELECT v.stage, v.stage_locked_at IS NOT NULL INTO v_stage, v_locked
        FROM public.crm_venues v WHERE v.id = v_venue;
        IF v_stage = 'nuovo' AND NOT v_locked THEN
            PERFORM public.crm_move_stage(p_venue_id := v_venue, p_stage := 'contattato', p_expected_stage := 'nuovo');
        END IF;
    END IF;

    IF v_new_in > 0 THEN
        SELECT v.stage, v.stage_locked_at IS NOT NULL INTO v_stage, v_locked
        FROM public.crm_venues v WHERE v.id = v_venue;
        IF v_stage IN ('nuovo', 'contattato') AND NOT v_locked THEN
            PERFORM public.crm_move_stage(p_venue_id := v_venue, p_stage := 'in_conversazione', p_expected_stage := v_stage);
        END IF;
    END IF;

    IF v_new_in + v_person > 0 THEN
        UPDATE public.crm_venues v SET last_activity_at = greatest(v.last_activity_at, p_now) WHERE v.id = v_venue;
    END IF;

    RETURN QUERY SELECT 'ok'::text, v_venue, v_new_in, v_person, v_matched;
END;
$$;

-- -----------------------------------------------------------------------------
-- /admin: «La prendo io» e annullare un messaggio in coda
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_set_agent_hold(p_venue_id uuid, p_hold boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_actor uuid := auth.uid();
BEGIN
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'hold_needs_person' USING ERRCODE = '42501';
    END IF;
    IF p_hold IS NULL THEN
        RAISE EXCEPTION 'invalid_hold' USING ERRCODE = '22023';
    END IF;

    UPDATE public.crm_venues v
    SET agent_hold_at = CASE WHEN p_hold THEN now() END,
        agent_hold_by = CASE WHEN p_hold THEN v_actor END
    WHERE v.id = p_venue_id AND (v.agent_hold_at IS NULL) = p_hold;
    IF NOT FOUND THEN
        IF NOT EXISTS (SELECT 1 FROM public.crm_venues v WHERE v.id = p_venue_id) THEN
            RAISE EXCEPTION 'venue_not_found' USING ERRCODE = 'P0002';
        END IF;
        RETURN false;
    END IF;

    IF p_hold THEN
        UPDATE public.crm_messages x
        SET status = 'cancelled', status_reason = 'La gestisce una persona.'
        WHERE x.venue_id = p_venue_id AND x.status = 'queued';
    END IF;

    INSERT INTO public.crm_events (venue_id, type, actor_user_id)
    VALUES (p_venue_id, CASE WHEN p_hold THEN 'agent_hold' ELSE 'agent_released' END, v_actor);
    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_wa_cancel_message(p_message_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
BEGIN
    UPDATE public.crm_messages x
    SET status = 'cancelled', status_reason = 'Annullato da una persona.'
    WHERE x.id = p_message_id AND x.status = 'queued';
    RETURN FOUND;
END;
$$;

-- -----------------------------------------------------------------------------
-- Diario: impostazioni WhatsApp cambiate (testo, prova, quanti numeri)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_settings_wa_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_actor uuid := public.crm_agent_actor();
BEGIN
    INSERT INTO public.crm_agent_decisions (actor, actor_user_id, action, reason, payload)
    VALUES (
        CASE WHEN v_actor IS NULL THEN 'system' ELSE 'person' END,
        v_actor,
        'wa_settings_changed',
        'Impostazioni di WhatsApp cambiate.',
        jsonb_build_object(
            'before', jsonb_build_object('first_message', OLD.wa_first_message, 'test_only', OLD.wa_test_only,
                                         'test_numbers', cardinality(OLD.wa_test_numbers)),
            'after',  jsonb_build_object('first_message', NEW.wa_first_message, 'test_only', NEW.wa_test_only,
                                         'test_numbers', cardinality(NEW.wa_test_numbers))
        )
    );
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS crm_settings_wa_log ON public.crm_settings;
CREATE TRIGGER crm_settings_wa_log
    AFTER UPDATE ON public.crm_settings
    FOR EACH ROW
    WHEN (OLD.wa_first_message IS DISTINCT FROM NEW.wa_first_message
          OR OLD.wa_test_only IS DISTINCT FROM NEW.wa_test_only
          OR OLD.wa_test_numbers IS DISTINCT FROM NEW.wa_test_numbers)
    EXECUTE FUNCTION public.crm_settings_wa_log();

COMMIT;
