-- =============================================================================
-- CRM interno (Fase 1, F1-1): funzioni delle fondamenta degli agenti
-- =============================================================================
--   crm_settings_agent_guard / crm_settings_agent_log   (trigger)
--       Il freno a mano si toglie solo con una persona: auth.uid(), oppure
--       l'utente passato da una edge col service role (Telegram) attraverso
--       crm_set_brake. Chi e quando li scrive il trigger, mai il client.
--       Ogni cambio del freno, del tetto o dei modelli va nel diario.
--   crm_set_brake(on, reason, source, actor)
--       Tira o toglie il freno. Dalle edge: source 'telegram', 'spend_cap',
--       'channel' o 'system'; con un actor solo se è del team del CRM.
--   crm_ai_spend()
--       Spesa di oggi e del mese (ora di Roma) coi tetti e il freno.
--   crm_ai_gate(role)
--       Prima di ogni chiamata a Claude: il modello del ruolo e se si può
--       chiamare. Sopra un tetto nessun ruolo; col freno tirato solo Gea
--       (risponde alle domande, non scrive ai lead).
--   crm_record_ai_usage(...)
--       Dopo ogni chiamata (solo service role): registra token e costo, poi
--       al 100% di un tetto tira il freno, all'80% segna l'avviso (uno al
--       giorno e uno al mese). Ritorna l'avviso da mandare su Telegram.
--   crm_brand_rules_guard / crm_brand_rules_log   (trigger)
--       Una versione non cambia testo; passa da bozza ad approvata o
--       scartata, da approvata a ritirata. Approvare chiede una persona.
--   crm_propose_brand_rules / crm_approve_brand_rules / crm_discard_brand_rules
--
-- La persona arriva ai trigger da auth.uid() o dall'impostazione locale della
-- transazione `crm.agent_actor`, che scrivono solo queste funzioni.
-- SECURITY INVOKER: le RLS `crm_*` restano il cancello. ACL in 20261002210200.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Chi agisce: la persona collegata o quella dichiarata dalla funzione
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_agent_actor()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
    SELECT coalesce(auth.uid(), nullif(current_setting('crm.agent_actor', true), '')::uuid);
$$;

-- Prepara `crm.agent_actor` per i trigger: dal client vale solo auth.uid();
-- dal service role un utente del team del CRM.
CREATE OR REPLACE FUNCTION public.crm_bind_agent_actor(p_actor_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_actor uuid := coalesce(auth.uid(), p_actor_user_id);
BEGIN
    IF auth.uid() IS NOT NULL AND p_actor_user_id IS NOT NULL AND p_actor_user_id <> auth.uid() THEN
        RAISE EXCEPTION 'actor_mismatch' USING ERRCODE = '42501';
    END IF;
    IF auth.uid() IS NULL AND p_actor_user_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.crm_team_members tm WHERE tm.user_id = p_actor_user_id
    ) THEN
        RAISE EXCEPTION 'not_a_team_member' USING ERRCODE = '22023';
    END IF;
    PERFORM set_config('crm.agent_actor', coalesce(v_actor::text, ''), true);
    RETURN v_actor;
END;
$$;

-- -----------------------------------------------------------------------------
-- crm_settings: freno a mano e impostazioni degli agenti
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_settings_agent_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_actor uuid := public.crm_agent_actor();
BEGIN
    IF NEW.brake_on IS DISTINCT FROM OLD.brake_on THEN
        IF NOT NEW.brake_on AND v_actor IS NULL THEN
            RAISE EXCEPTION 'brake_release_needs_person' USING ERRCODE = '42501';
        END IF;
        NEW.brake_changed_at := now();
        NEW.brake_changed_by := v_actor;
        NEW.brake_reason := nullif(btrim(NEW.brake_reason), '');
        -- Una persona dal client agisce sempre da /admin: la fonte non si dichiara
        -- ('telegram', 'spend_cap', 'channel' solo dal service role).
        IF auth.uid() IS NOT NULL THEN
            NEW.brake_source := 'admin';
        END IF;
    ELSE
        NEW.brake_reason := OLD.brake_reason;
        NEW.brake_source := OLD.brake_source;
        NEW.brake_changed_at := OLD.brake_changed_at;
        NEW.brake_changed_by := OLD.brake_changed_by;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_settings_agent_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_actor   uuid := public.crm_agent_actor();
    v_before  jsonb := '{}'::jsonb;
    v_after   jsonb := '{}'::jsonb;
    v_field   text;
BEGIN
    IF NEW.brake_on IS DISTINCT FROM OLD.brake_on THEN
        INSERT INTO public.crm_agent_decisions (actor, actor_user_id, action, reason, payload)
        VALUES (
            CASE WHEN NEW.brake_changed_by IS NOT NULL THEN 'person' ELSE 'system' END,
            NEW.brake_changed_by,
            CASE WHEN NEW.brake_on THEN 'brake_on' ELSE 'brake_off' END,
            coalesce(NEW.brake_reason,
                     CASE WHEN NEW.brake_on THEN 'Agenti messi in pausa.' ELSE 'Agenti riattivati.' END),
            jsonb_build_object('source', NEW.brake_source)
        );
    END IF;

    FOREACH v_field IN ARRAY ARRAY[
        'ai_month_cap_usd', 'ai_day_cap_usd',
        'ai_model_conversation', 'ai_model_reviewer', 'ai_model_sensitive', 'ai_model_gea'
    ]
    LOOP
        IF to_jsonb(OLD) -> v_field IS DISTINCT FROM to_jsonb(NEW) -> v_field THEN
            v_before := v_before || jsonb_build_object(v_field, to_jsonb(OLD) -> v_field);
            v_after := v_after || jsonb_build_object(v_field, to_jsonb(NEW) -> v_field);
        END IF;
    END LOOP;

    IF v_after <> '{}'::jsonb THEN
        INSERT INTO public.crm_agent_decisions (actor, actor_user_id, action, reason, payload)
        VALUES (
            CASE WHEN v_actor IS NOT NULL THEN 'person' ELSE 'system' END,
            v_actor,
            'agent_settings_changed',
            'Impostazioni degli agenti cambiate.',
            jsonb_build_object('before', v_before, 'after', v_after)
        );
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS crm_settings_agent_guard ON public.crm_settings;
CREATE TRIGGER crm_settings_agent_guard
    BEFORE UPDATE ON public.crm_settings
    FOR EACH ROW EXECUTE FUNCTION public.crm_settings_agent_guard();

DROP TRIGGER IF EXISTS crm_settings_agent_log ON public.crm_settings;
CREATE TRIGGER crm_settings_agent_log
    AFTER UPDATE ON public.crm_settings
    FOR EACH ROW EXECUTE FUNCTION public.crm_settings_agent_log();

CREATE OR REPLACE FUNCTION public.crm_set_brake(
    p_on            boolean,
    p_reason        text DEFAULT NULL,
    p_source        text DEFAULT NULL,
    p_actor_user_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_actor  uuid;
    v_source text := coalesce(p_source, CASE WHEN auth.uid() IS NOT NULL THEN 'admin' ELSE 'system' END);
BEGIN
    IF p_on IS NULL THEN
        RAISE EXCEPTION 'invalid_brake' USING ERRCODE = '22023';
    END IF;
    IF v_source NOT IN ('admin', 'telegram', 'spend_cap', 'channel', 'system') THEN
        RAISE EXCEPTION 'invalid_brake_source' USING ERRCODE = '22023';
    END IF;
    v_actor := public.crm_bind_agent_actor(p_actor_user_id);
    IF NOT p_on AND v_actor IS NULL THEN
        RAISE EXCEPTION 'brake_release_needs_person' USING ERRCODE = '42501';
    END IF;

    UPDATE public.crm_settings s
    SET brake_on = p_on,
        brake_reason = left(nullif(btrim(p_reason), ''), 300),
        brake_source = v_source
    WHERE s.id AND s.brake_on IS DISTINCT FROM p_on;
    RETURN FOUND;
END;
$$;

-- -----------------------------------------------------------------------------
-- Spesa AI
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_ai_spend()
RETURNS TABLE (
    r_day_usd      numeric,
    r_month_usd    numeric,
    r_day_cap      numeric,
    r_month_cap    numeric,
    r_brake_on     boolean,
    r_brake_reason text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
    WITH bounds AS (
        SELECT
            date_trunc('day', now() AT TIME ZONE 'Europe/Rome') AT TIME ZONE 'Europe/Rome' AS day_start,
            date_trunc('month', now() AT TIME ZONE 'Europe/Rome') AT TIME ZONE 'Europe/Rome' AS month_start
    )
    SELECT
        coalesce((SELECT sum(u.cost_usd) FROM public.crm_ai_usage u WHERE u.created_at >= b.day_start), 0),
        coalesce((SELECT sum(u.cost_usd) FROM public.crm_ai_usage u WHERE u.created_at >= b.month_start), 0),
        s.ai_day_cap_usd,
        s.ai_month_cap_usd,
        s.brake_on,
        s.brake_reason
    FROM public.crm_settings s
    CROSS JOIN bounds b
    WHERE s.id;
$$;

CREATE OR REPLACE FUNCTION public.crm_ai_gate(p_role text)
RETURNS TABLE (r_model text, r_allowed boolean, r_reason text)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_model text;
    v_spend record;
BEGIN
    SELECT CASE p_role
               WHEN 'conversation' THEN s.ai_model_conversation
               WHEN 'reviewer' THEN s.ai_model_reviewer
               WHEN 'sensitive' THEN s.ai_model_sensitive
               WHEN 'gea' THEN s.ai_model_gea
           END
    INTO v_model
    FROM public.crm_settings s
    WHERE s.id;
    IF v_model IS NULL THEN
        RAISE EXCEPTION 'invalid_ai_role' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_spend FROM public.crm_ai_spend();

    r_model := v_model;
    r_allowed := false;
    IF v_spend.r_month_usd >= v_spend.r_month_cap THEN
        r_reason := 'month_cap';
    ELSIF v_spend.r_day_usd >= v_spend.r_day_cap THEN
        r_reason := 'day_cap';
    ELSIF v_spend.r_brake_on AND p_role <> 'gea' THEN
        r_reason := 'brake';
    ELSE
        r_allowed := true;
        r_reason := NULL;
    END IF;
    RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_record_ai_usage(
    p_role                text,
    p_model               text,
    p_input_tokens        integer,
    p_output_tokens       integer,
    p_cache_read_tokens   integer,
    p_cache_write_tokens  integer,
    p_cost_usd            numeric,
    p_price_version       text,
    p_ok                  boolean,
    p_request_id          text    DEFAULT NULL,
    p_decision_id         uuid    DEFAULT NULL,
    p_venue_id            uuid    DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_settings  record;
    v_spend     record;
    v_rome      timestamp := now() AT TIME ZONE 'Europe/Rome';
    v_day_key   text;
    v_month_key text;
    v_alert     text;
    v_reason    text;
BEGIN
    v_day_key := to_char(v_rome, 'YYYY-MM-DD');
    v_month_key := to_char(v_rome, 'YYYY-MM');

    INSERT INTO public.crm_ai_usage (
        role, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
        cost_usd, price_version, ok, request_id, decision_id, venue_id
    ) VALUES (
        p_role, p_model, coalesce(p_input_tokens, 0), coalesce(p_output_tokens, 0),
        coalesce(p_cache_read_tokens, 0), coalesce(p_cache_write_tokens, 0),
        coalesce(p_cost_usd, 0), p_price_version, coalesce(p_ok, false),
        left(p_request_id, 120), p_decision_id, p_venue_id
    );

    -- Una chiamata alla volta decide l'avviso: niente doppioni tra edge parallele.
    SELECT s.brake_on, s.ai_alert_day, s.ai_alert_month, s.ai_day_cap_usd, s.ai_month_cap_usd
    INTO v_settings
    FROM public.crm_settings s
    WHERE s.id
    FOR UPDATE;

    SELECT * INTO v_spend FROM public.crm_ai_spend();

    IF v_spend.r_month_usd >= v_spend.r_month_cap OR v_spend.r_day_usd >= v_spend.r_day_cap THEN
        IF NOT v_settings.brake_on THEN
            IF v_spend.r_month_usd >= v_spend.r_month_cap THEN
                v_alert := 'month_cap';
                v_reason := format('Tetto di spesa AI del mese raggiunto: %s su %s dollari.',
                                   round(v_spend.r_month_usd, 2), v_spend.r_month_cap);
            ELSE
                v_alert := 'day_cap';
                v_reason := format('Tetto di spesa AI di oggi raggiunto: %s su %s dollari.',
                                   round(v_spend.r_day_usd, 2), v_spend.r_day_cap);
            END IF;
            UPDATE public.crm_settings s
            SET brake_on = true, brake_source = 'spend_cap', brake_reason = v_reason
            WHERE s.id;
        END IF;
    ELSIF v_spend.r_month_usd >= 0.8 * v_spend.r_month_cap
          AND v_settings.ai_alert_month IS DISTINCT FROM v_month_key THEN
        v_alert := 'month_80';
        v_reason := format('Spesa AI del mese all''80%% del tetto: %s su %s dollari.',
                           round(v_spend.r_month_usd, 2), v_spend.r_month_cap);
        UPDATE public.crm_settings s SET ai_alert_month = v_month_key WHERE s.id;
    ELSIF v_spend.r_day_usd >= 0.8 * v_spend.r_day_cap
          AND v_settings.ai_alert_day IS DISTINCT FROM v_day_key THEN
        v_alert := 'day_80';
        v_reason := format('Spesa AI di oggi all''80%% del tetto: %s su %s dollari.',
                           round(v_spend.r_day_usd, 2), v_spend.r_day_cap);
        UPDATE public.crm_settings s SET ai_alert_day = v_day_key WHERE s.id;
    END IF;

    -- Il freno tirato lo scrive già il trigger nel diario.
    IF v_alert IN ('month_80', 'day_80') THEN
        INSERT INTO public.crm_agent_decisions (actor, action, reason, payload)
        VALUES ('system', 'spend_alert', v_reason,
                jsonb_build_object('day_usd', v_spend.r_day_usd, 'month_usd', v_spend.r_month_usd));
    END IF;

    RETURN v_alert;
END;
$$;

-- -----------------------------------------------------------------------------
-- Regole del brand
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_brand_rules_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_actor uuid := public.crm_agent_actor();
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.created_by := v_actor;
        NEW.created_at := now();
        NEW.status := 'draft';
        NEW.approved_by := NULL;
        NEW.approved_at := NULL;
        RETURN NEW;
    END IF;

    IF NEW.version <> OLD.version OR NEW.body IS DISTINCT FROM OLD.body
       OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at <> OLD.created_at
       OR NEW.note IS DISTINCT FROM OLD.note THEN
        RAISE EXCEPTION 'rules_immutable' USING ERRCODE = '22023';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NOT ((OLD.status = 'draft' AND NEW.status IN ('approved', 'discarded'))
                OR (OLD.status = 'approved' AND NEW.status = 'retired')) THEN
            RAISE EXCEPTION 'invalid_rules_transition' USING ERRCODE = '22023';
        END IF;
        IF NEW.status = 'approved' THEN
            IF v_actor IS NULL THEN
                RAISE EXCEPTION 'approval_needs_person' USING ERRCODE = '42501';
            END IF;
            NEW.approved_by := v_actor;
            NEW.approved_at := now();
            RETURN NEW;
        END IF;
    END IF;

    NEW.approved_by := OLD.approved_by;
    NEW.approved_at := OLD.approved_at;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_brand_rules_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_actor  uuid := public.crm_agent_actor();
    v_action text;
    v_reason text;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_action := 'brand_rules_proposed';
        v_reason := format('Proposta la versione %s delle regole del brand.', NEW.version);
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'approved' THEN
        v_action := 'brand_rules_approved';
        v_reason := format('In vigore la versione %s delle regole del brand.', NEW.version);
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'discarded' THEN
        v_action := 'brand_rules_discarded';
        v_reason := format('Scartata la versione %s delle regole del brand.', NEW.version);
    ELSE
        RETURN NULL;
    END IF;

    INSERT INTO public.crm_agent_decisions (actor, actor_user_id, action, reason, payload)
    VALUES (CASE WHEN v_actor IS NOT NULL THEN 'person' ELSE 'agent' END, v_actor, v_action, v_reason,
            jsonb_build_object('version', NEW.version, 'note', NEW.note));
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS crm_brand_rules_guard ON public.crm_brand_rules;
CREATE TRIGGER crm_brand_rules_guard
    BEFORE INSERT OR UPDATE ON public.crm_brand_rules
    FOR EACH ROW EXECUTE FUNCTION public.crm_brand_rules_guard();

DROP TRIGGER IF EXISTS crm_brand_rules_log ON public.crm_brand_rules;
CREATE TRIGGER crm_brand_rules_log
    AFTER INSERT OR UPDATE ON public.crm_brand_rules
    FOR EACH ROW EXECUTE FUNCTION public.crm_brand_rules_log();

CREATE OR REPLACE FUNCTION public.crm_propose_brand_rules(
    p_body          text,
    p_note          text DEFAULT NULL,
    p_actor_user_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_version integer;
BEGIN
    IF nullif(btrim(p_body), '') IS NULL THEN
        RAISE EXCEPTION 'empty_rules' USING ERRCODE = '22023';
    END IF;
    PERFORM public.crm_bind_agent_actor(p_actor_user_id);
    PERFORM pg_advisory_xact_lock(hashtext('crm_brand_rules'));

    SELECT coalesce(max(r.version), 0) + 1 INTO v_version FROM public.crm_brand_rules r;
    INSERT INTO public.crm_brand_rules (version, body, note)
    VALUES (v_version, btrim(p_body), left(nullif(btrim(p_note), ''), 300));
    RETURN v_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_approve_brand_rules(
    p_version       integer,
    p_actor_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
    v_status text;
BEGIN
    IF public.crm_bind_agent_actor(p_actor_user_id) IS NULL THEN
        RAISE EXCEPTION 'approval_needs_person' USING ERRCODE = '42501';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('crm_brand_rules'));

    SELECT r.status INTO v_status FROM public.crm_brand_rules r WHERE r.version = p_version FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'rules_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'rules_not_draft' USING ERRCODE = '22023';
    END IF;

    UPDATE public.crm_brand_rules r SET status = 'retired' WHERE r.status = 'approved';
    UPDATE public.crm_brand_rules r SET status = 'approved' WHERE r.version = p_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_discard_brand_rules(
    p_version       integer,
    p_actor_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
BEGIN
    PERFORM public.crm_bind_agent_actor(p_actor_user_id);
    UPDATE public.crm_brand_rules r SET status = 'discarded' WHERE r.version = p_version AND r.status = 'draft';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'rules_not_draft' USING ERRCODE = '22023';
    END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- Conservazione del diario
-- -----------------------------------------------------------------------------
-- Le righe legate a un locale o a un lead se ne vanno a cascata con
-- crm_purge_venues. Quelle senza legame (agenti, sistema, impostazioni) possono
-- comunque citare un lead nel motivo o nel payload: stessa soglia di 12 mesi.
-- La chiama solo l'edge crm-purge con la service role, dry-run di default.
CREATE OR REPLACE FUNCTION public.crm_purge_agent_decisions(
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
        SELECT count(*)::integer INTO v_count
        FROM public.crm_agent_decisions d
        WHERE d.venue_id IS NULL AND d.lead_id IS NULL AND d.created_at < p_cutoff;
    ELSE
        DELETE FROM public.crm_agent_decisions d
        WHERE d.venue_id IS NULL AND d.lead_id IS NULL AND d.created_at < p_cutoff;
        GET DIAGNOSTICS v_count = ROW_COUNT;
    END IF;
    RETURN v_count;
END;
$$;

COMMIT;
