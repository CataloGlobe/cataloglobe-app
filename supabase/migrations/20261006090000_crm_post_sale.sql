-- =============================================================================
-- CRM: post-vendita (Fase 3, pagina /admin/clienti)
-- =============================================================================
-- Per i locali collegati a un'azienda CataloGlobe il CRM propone quattro
-- gesti, calcolati in codice puro (`_shared/crmPostSale.ts`):
--   abbandono          dopo 10 giorni senza menù online, un messaggio d'aiuto;
--   prova_in_scadenza  prova che finisce entro 5 giorni;
--   crescita           cliente pagante da un mese col menù online: Pro o
--                      seconda sede;
--   passaparola        cliente pagante da 45 giorni: chiedere un nome.
-- Qui si tiene solo cosa ne ha fatto il team: avvisato su Telegram, fatto,
-- rimandato. Una riga per locale e gesto: «Fatto» vale per sempre, «Non ora»
-- fino a `snoozed_until`.
-- Tabella di piattaforma come le altre `crm_*`: niente tenant_id, RLS su
-- `is_platform_admin()`, nessun accesso ad anon. Il locale cancellato (purge
-- dei 12 mesi) porta via le sue righe.
-- AGGIUNTA PURA: nessuna tabella, funzione o policy esistente cambia.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.crm_post_sale_actions (
    venue_id       uuid        NOT NULL REFERENCES public.crm_venues (id) ON DELETE CASCADE,
    kind           text        NOT NULL CHECK (kind IN ('abbandono', 'prova_in_scadenza', 'crescita', 'passaparola')),
    alerted_at     timestamptz,
    done_at        timestamptz,
    done_by        uuid        REFERENCES auth.users (id) ON DELETE SET NULL,
    snoozed_until  timestamptz,
    updated_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (venue_id, kind)
);

REVOKE ALL ON TABLE public.crm_post_sale_actions FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.crm_post_sale_actions TO authenticated;

ALTER TABLE public.crm_post_sale_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_post_sale_actions select" ON public.crm_post_sale_actions;
CREATE POLICY "crm_post_sale_actions select" ON public.crm_post_sale_actions
    FOR SELECT TO authenticated USING (public.is_platform_admin());

DROP POLICY IF EXISTS "crm_post_sale_actions insert" ON public.crm_post_sale_actions;
CREATE POLICY "crm_post_sale_actions insert" ON public.crm_post_sale_actions
    FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "crm_post_sale_actions update" ON public.crm_post_sale_actions;
CREATE POLICY "crm_post_sale_actions update" ON public.crm_post_sale_actions
    FOR UPDATE TO authenticated
    USING (public.is_platform_admin())
    WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "crm_post_sale_actions delete" ON public.crm_post_sale_actions;
CREATE POLICY "crm_post_sale_actions delete" ON public.crm_post_sale_actions
    FOR DELETE TO authenticated USING (public.is_platform_admin());
