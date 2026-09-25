-- Contatti dal form «Richiedi una demo» della landing di campagna.
--
-- ECCEZIONE MOTIVATA alla regola tenant_id: è un dato di piattaforma (chi
-- vuole diventare cliente), non appartiene a nessun tenant. Nessun accesso dal
-- client: RLS abilitato SENZA policy e privilegi revocati ad anon e
-- authenticated. Scrive solo l'edge function `submit-lead` con service role;
-- la lettura avviene da Studio / service role.

CREATE TABLE IF NOT EXISTS public.leads (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at    timestamptz NOT NULL DEFAULT now(),
    name          text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
    venue_name    text        NOT NULL CHECK (char_length(venue_name) BETWEEN 1 AND 160),
    -- E.164, normalizzato dall'edge function.
    phone         text        NOT NULL CHECK (char_length(phone) BETWEEN 8 AND 20),
    email         text        CHECK (email IS NULL OR char_length(email) <= 254),
    interests     text[]      NOT NULL DEFAULT '{}'
                              CHECK (interests <@ ARRAY['menu', 'prenotazioni', 'ordini']::text[]),
    consent_at    timestamptz NOT NULL,
    -- Testo del consenso mostrato all'invio (prova di cosa è stato accettato).
    consent_text  text,
    -- Variante della landing: form | signup.
    variant       text,
    utm_source    text,
    utm_medium    text,
    utm_campaign  text,
    utm_content   text,
    utm_term      text,
    referrer      text,
    landing_path  text,
    -- SHA-256 dell'IP con salt (secret dell'edge function): mai l'IP in chiaro.
    ip_hash       text,
    status        text        NOT NULL DEFAULT 'new'
                              CHECK (status IN ('new', 'contacted', 'won', 'lost', 'spam')),
    notes         text
);

CREATE INDEX IF NOT EXISTS leads_created_at_idx ON public.leads (created_at DESC);
CREATE INDEX IF NOT EXISTS leads_status_idx ON public.leads (status);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Nessuna policy: anon e authenticated non leggono né scrivono. Il REVOKE è
-- difesa in profondità rispetto ai grant di default di Supabase.
REVOKE ALL ON TABLE public.leads FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.leads IS
    'Contatti dal form della landing di campagna. Tabella di piattaforma: niente tenant_id, RLS senza policy, scrive solo l''edge function submit-lead (service role).';
