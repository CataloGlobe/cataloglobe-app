-- =============================================================================
-- CRM interno (Fase 0): proposte di collegamento lead e account
-- =============================================================================
-- Telefono identico = collegamento automatico (crm-sync-accounts). Email o
-- nome del locale uguali = solo proposta, qui, finché un admin non la
-- conferma (crm_link_account) o la scarta (dismissed_at).
-- `tenant_id` senza FK verso `public.tenants`, come crm_venues.tenant_id: una
-- FK aggiungerebbe trigger di sistema su una tabella esistente.
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

COMMIT;
