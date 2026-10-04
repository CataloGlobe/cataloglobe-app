-- =============================================================================
-- CRM interno (Fase 1, F1-4a): agenda delle telefonate, tabelle
-- =============================================================================
-- Una persona fissa la telefonata con un lead da /admin (l'agente arriva con
-- F1-3). L'evento va nel calendario CataloGlobe su Google (account di
-- servizio, call del 2026-10-03); al lead partono conferma e promemoria dalla
-- coda WhatsApp della #188, a chi chiama il brief un'ora prima e, dopo,
-- «Com'è andata?» su Telegram.
--
--   * crm_appointments: una riga per telefonata. Una sola attiva per locale
--     (proposta o confermata). Chi chiama è del team; se non è chi la fissa,
--     la telefonata resta «proposta» finché chi chiama non dice sì.
--   * crm_settings: fasce in cui si chiama (9-11 e 17:30-18:30, lun-ven),
--     durata e preavviso, calendario Google, testi di conferma e promemoria
--     (NULL = non partono, li sceglie Alex).
--   * crm_messages: due scopi nuovi, call_confirm e call_reminder, legati
--     alla telefonata (appointment_id).
--   * crm_events: call_scheduled, call_moved, call_cancelled,
--     call_caller_answered, call_outcome.
--
-- Tabelle di piattaforma come le altre crm_*: niente tenant_id, RLS su
-- is_platform_admin(). Funzioni in 20261003230100, GRANT in 230200, cron in
-- 230300.
-- =============================================================================

BEGIN;

-- Fasce salvate: [{days:[1..7], start:"HH:MM", end:"HH:MM"}], al massimo 12.
-- ⚠️ SYNC con parseCallWindows (supabase/functions/_shared/crmCallSlots.ts).
CREATE OR REPLACE FUNCTION public.crm_call_windows_ok(p_windows jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $$
DECLARE
    w jsonb;
    d jsonb;
    v_days integer[];
BEGIN
    IF jsonb_typeof(p_windows) <> 'array' OR jsonb_array_length(p_windows) > 12 THEN
        RETURN false;
    END IF;
    FOR w IN SELECT value FROM jsonb_array_elements(p_windows) LOOP
        IF jsonb_typeof(w) <> 'object'
           OR jsonb_typeof(w->'days') <> 'array'
           OR jsonb_typeof(w->'start') <> 'string'
           OR jsonb_typeof(w->'end') <> 'string' THEN
            RETURN false;
        END IF;
        IF jsonb_array_length(w->'days') NOT BETWEEN 1 AND 7 THEN
            RETURN false;
        END IF;
        v_days := '{}';
        FOR d IN SELECT value FROM jsonb_array_elements(w->'days') LOOP
            IF jsonb_typeof(d) <> 'number' OR d::text !~ '^[1-7]$' OR (d::text)::integer = ANY (v_days) THEN
                RETURN false;
            END IF;
            v_days := v_days || (d::text)::integer;
        END LOOP;
        IF (w->>'start') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
           OR (w->>'end') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
           OR (w->>'start') >= (w->>'end') THEN
            RETURN false;
        END IF;
    END LOOP;
    RETURN true;
END;
$$;

-- -----------------------------------------------------------------------------
-- crm_settings
-- -----------------------------------------------------------------------------
ALTER TABLE public.crm_settings
    ADD COLUMN IF NOT EXISTS call_windows jsonb NOT NULL DEFAULT
        '[{"days":[1,2,3,4,5],"start":"09:00","end":"11:00"},{"days":[1,2,3,4,5],"start":"17:30","end":"18:30"}]'::jsonb
        CHECK (public.crm_call_windows_ok(call_windows)),
    ADD COLUMN IF NOT EXISTS call_duration_minutes integer NOT NULL DEFAULT 10
        CHECK (call_duration_minutes BETWEEN 5 AND 120),
    ADD COLUMN IF NOT EXISTS call_min_notice_minutes integer NOT NULL DEFAULT 60
        CHECK (call_min_notice_minutes BETWEEN 0 AND 1440),
    -- Id del calendario CataloGlobe, condiviso con l'account di servizio
    -- (la chiave sta nei segreti delle edge). NULL = niente Google.
    ADD COLUMN IF NOT EXISTS google_calendar_id text
        CHECK (google_calendar_id IS NULL OR char_length(btrim(google_calendar_id)) BETWEEN 3 AND 200),
    ADD COLUMN IF NOT EXISTS call_confirm_message text
        CHECK (call_confirm_message IS NULL OR char_length(btrim(call_confirm_message)) BETWEEN 1 AND 1000),
    ADD COLUMN IF NOT EXISTS call_reminder_message text
        CHECK (call_reminder_message IS NULL OR char_length(btrim(call_reminder_message)) BETWEEN 1 AND 1000);

-- -----------------------------------------------------------------------------
-- crm_appointments
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_appointments (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    venue_id            uuid        NOT NULL REFERENCES public.crm_venues(id) ON DELETE CASCADE,
    lead_id             uuid        REFERENCES public.crm_leads(id) ON DELETE SET NULL,
    contact_id          uuid        REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
    -- La demo resta ad Alex fuori dall'agenda (piano F1-4).
    kind                text        NOT NULL DEFAULT 'call' CHECK (kind IN ('call')),
    starts_at           timestamptz NOT NULL,
    ends_at             timestamptz NOT NULL,
    -- Quando è stato deciso l'orario attuale (fissata o spostata): il
    -- promemoria parte solo se l'orario c'era già il giorno prima alle 18.
    time_set_at         timestamptz NOT NULL DEFAULT now(),
    caller_user_id      uuid        NOT NULL REFERENCES public.crm_team_members(user_id),
    created_by          uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
    -- proposed: chi chiama non ha ancora detto sì. postponed: «Rimandata»
    -- dopo la telefonata (se ne fissa un'altra).
    status              text        NOT NULL
                                    CHECK (status IN ('proposed', 'confirmed', 'cancelled', 'done', 'no_show', 'postponed')),
    status_reason       text        CHECK (status_reason IS NULL OR char_length(status_reason) <= 300),
    note                text        CHECK (note IS NULL OR char_length(note) <= 500),
    -- Google: pending = da scrivere (creare, spostare o togliere l'evento),
    -- none = niente da fare (calendario non impostato, o annullata prima).
    google_event_id     text        CHECK (google_event_id IS NULL OR char_length(google_event_id) <= 200),
    google_sync         text        NOT NULL DEFAULT 'pending' CHECK (google_sync IN ('pending', 'ok', 'error', 'none')),
    google_error        text        CHECK (google_error IS NULL OR char_length(google_error) <= 300),
    google_synced_at    timestamptz,
    -- Ogni modifica che tocca l'evento alza google_rev; l'edge prende in
    -- carico una revisione (google_claimed_at, 2 minuti) e la chiude solo se
    -- nel frattempo non ne è arrivata un'altra.
    google_rev          integer     NOT NULL DEFAULT 0,
    google_claimed_at   timestamptz,
    -- Passi già fatti (claim idempotenti: si scrivono solo se NULL).
    caller_asked_at     timestamptz,
    caller_answered_at  timestamptz,
    reminder_queued_at  timestamptz,
    brief_sent_at       timestamptz,
    outcome_asked_at    timestamptz,
    outcome_at          timestamptz,
    outcome_by          uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT crm_appointments_time CHECK (
        ends_at > starts_at AND ends_at <= starts_at + interval '2 hours'
    )
);

-- Una sola telefonata attiva per locale.
CREATE UNIQUE INDEX IF NOT EXISTS crm_appointments_one_active_idx
    ON public.crm_appointments (venue_id) WHERE status IN ('proposed', 'confirmed');
CREATE INDEX IF NOT EXISTS crm_appointments_starts_idx
    ON public.crm_appointments (starts_at) WHERE status IN ('proposed', 'confirmed');
CREATE INDEX IF NOT EXISTS crm_appointments_google_idx
    ON public.crm_appointments (updated_at) WHERE google_sync = 'pending';
CREATE INDEX IF NOT EXISTS crm_appointments_venue_idx
    ON public.crm_appointments (venue_id, starts_at DESC);

-- -----------------------------------------------------------------------------
-- crm_messages: conferma e promemoria della telefonata
-- -----------------------------------------------------------------------------
ALTER TABLE public.crm_messages
    ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES public.crm_appointments(id) ON DELETE CASCADE;

ALTER TABLE public.crm_messages DROP CONSTRAINT IF EXISTS crm_messages_purpose_check;
ALTER TABLE public.crm_messages ADD CONSTRAINT crm_messages_purpose_check CHECK (
    purpose IN ('first_message', 'reply', 'follow_up', 'call_confirm', 'call_reminder')
);
ALTER TABLE public.crm_messages DROP CONSTRAINT IF EXISTS crm_messages_call_has_appointment;
ALTER TABLE public.crm_messages ADD CONSTRAINT crm_messages_call_has_appointment CHECK (
    (purpose IN ('call_confirm', 'call_reminder')) = (appointment_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS crm_messages_appointment_idx
    ON public.crm_messages (appointment_id) WHERE appointment_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- crm_events
-- -----------------------------------------------------------------------------
ALTER TABLE public.crm_events DROP CONSTRAINT IF EXISTS crm_events_type_check;
ALTER TABLE public.crm_events ADD CONSTRAINT crm_events_type_check CHECK (type IN (
    'lead_in', 'lead_returned', 'assigned', 'stage_changed',
    'whatsapp_opened', 'note', 'account_linked', 'escalated',
    'stage_locked', 'stage_unlocked', 'subscription_changed',
    'venue_renamed', 'venue_name_confirmed', 'venue_name_deferred',
    'agent_hold', 'agent_released',
    'call_scheduled', 'call_moved', 'call_cancelled', 'call_caller_answered', 'call_outcome'
));

-- -----------------------------------------------------------------------------
-- Privilegi e RLS
-- -----------------------------------------------------------------------------
-- Le persone leggono; scrivono solo dalle funzioni di 230100 (SECURITY
-- INVOKER: passano dalle RLS). Le colonne di Google e dei passi le scrive
-- l'edge col service role.
REVOKE ALL ON TABLE public.crm_appointments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.crm_appointments TO authenticated;
GRANT ALL ON TABLE public.crm_appointments TO service_role;

ALTER TABLE public.crm_appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_appointments select" ON public.crm_appointments;
CREATE POLICY "crm_appointments select" ON public.crm_appointments
    FOR SELECT TO authenticated USING (public.is_platform_admin());
DROP POLICY IF EXISTS "crm_appointments insert" ON public.crm_appointments;
CREATE POLICY "crm_appointments insert" ON public.crm_appointments
    FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin());
DROP POLICY IF EXISTS "crm_appointments update" ON public.crm_appointments;
CREATE POLICY "crm_appointments update" ON public.crm_appointments
    FOR UPDATE TO authenticated
    USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

COMMIT;
