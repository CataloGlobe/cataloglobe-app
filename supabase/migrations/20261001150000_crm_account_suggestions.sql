-- =============================================================================
-- CRM interno (Fase 0): proposte di collegamento lead e account
-- =============================================================================
-- Telefono identico = collegamento automatico (crm-sync-accounts). Email o
-- nome del locale uguali = solo proposta, qui, finché un admin non la
-- conferma (crm_link_account) o la scarta (dismissed_at).
-- `tenant_id` senza FK verso `public.tenants`, come crm_venues.tenant_id: una
-- FK aggiungerebbe trigger di sistema su una tabella esistente.
--
-- Su crm_venues (decisioni di Alex del 2026-10-01, pipeline-crm):
--   * account_state, trial_kind, trial_ends_at: lo stato dell'abbonamento
--     dell'account collegato, copiato dal job crm-sync-accounts. Servono alle
--     etichette «Prova con carta / con codice, scade il …» e «Registrato,
--     prova non partita», e a scrivere nella storia i cambi di abbonamento.
--     'registrato' = account senza subscription Stripe (mai partita la
--     prova); gli altri valori sono tenants.subscription_status.
--     trial_kind viene dai metadata della subscription su Stripe
--     (trial_no_card = "true" → codice): il database non li conserva.
--   * stage_locked_at/_by, stage_lock_note: «Fase bloccata a mano». Chi sposta
--     a mano una carta dentro o fuori da In prova o Cliente pagante la blocca
--     con una nota obbligatoria: il job non la sposta più (ma scrive i cambi
--     di abbonamento nella storia) finché qualcuno non la sblocca.
-- crm_events accetta tre tipi nuovi: stage_locked, stage_unlocked,
-- subscription_changed.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.crm_account_suggestions (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at    timestamptz NOT NULL DEFAULT now(),
    venue_id      uuid        NOT NULL REFERENCES public.crm_venues(id) ON DELETE CASCADE,
    tenant_id     uuid        NOT NULL,
    reason        text        NOT NULL CHECK (reason IN ('email', 'name')),
    dismissed_at  timestamptz,
    CONSTRAINT crm_account_suggestions_once UNIQUE (venue_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS crm_account_suggestions_open_idx
    ON public.crm_account_suggestions (venue_id) WHERE dismissed_at IS NULL;

REVOKE ALL ON TABLE public.crm_account_suggestions FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.crm_account_suggestions TO authenticated;

ALTER TABLE public.crm_account_suggestions ENABLE ROW LEVEL SECURITY;

-- Gli admin leggono e scartano; scollegando un account ne scrivono una già
-- scartata (crm_unlink_account), così il job non lo ricollega per telefono.
-- Le proposte vere le scrive l'edge col service role.
DROP POLICY IF EXISTS "crm_account_suggestions select" ON public.crm_account_suggestions;
CREATE POLICY "crm_account_suggestions select" ON public.crm_account_suggestions
    FOR SELECT TO authenticated USING (public.is_platform_admin());
DROP POLICY IF EXISTS "crm_account_suggestions insert" ON public.crm_account_suggestions;
CREATE POLICY "crm_account_suggestions insert" ON public.crm_account_suggestions
    FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin());
DROP POLICY IF EXISTS "crm_account_suggestions update" ON public.crm_account_suggestions;
CREATE POLICY "crm_account_suggestions update" ON public.crm_account_suggestions
    FOR UPDATE TO authenticated
    USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

ALTER TABLE public.crm_venues
    ADD COLUMN IF NOT EXISTS account_state   text
        CHECK (account_state IN ('registrato', 'trialing', 'active', 'past_due', 'suspended', 'canceled')),
    ADD COLUMN IF NOT EXISTS trial_kind      text CHECK (trial_kind IN ('carta', 'codice')),
    ADD COLUMN IF NOT EXISTS trial_ends_at   timestamptz,
    ADD COLUMN IF NOT EXISTS stage_locked_at timestamptz,
    ADD COLUMN IF NOT EXISTS stage_locked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS stage_lock_note text
        CHECK (stage_lock_note IS NULL OR char_length(btrim(stage_lock_note)) BETWEEN 1 AND 500);

ALTER TABLE public.crm_venues DROP CONSTRAINT IF EXISTS crm_venues_lock_consistent;
ALTER TABLE public.crm_venues ADD CONSTRAINT crm_venues_lock_consistent
    CHECK ((stage_locked_at IS NULL) = (stage_lock_note IS NULL));

ALTER TABLE public.crm_events DROP CONSTRAINT IF EXISTS crm_events_type_check;
ALTER TABLE public.crm_events ADD CONSTRAINT crm_events_type_check CHECK (type IN (
    'lead_in', 'lead_returned', 'assigned', 'stage_changed',
    'whatsapp_opened', 'note', 'account_linked', 'escalated',
    'stage_locked', 'stage_unlocked', 'subscription_changed'
));

COMMIT;
