-- =============================================================================
-- CRM: il prossimo passo di un locale (scheda del lead, grafica finale del
-- 2026-10-05, canvas V5)
-- =============================================================================
-- «Fissare la telefonata · entro domani · Alessandro», con «Cambia» e «Fatto».
-- Un passo solo per locale: si scrive sopra quello di prima, «Fatto» lo
-- cancella. La storia resta in `crm_events` (note), non qui.
-- Tabella di piattaforma come le altre `crm_*`: niente tenant_id, RLS su
-- `is_platform_admin()`, nessun accesso ad anon. Il locale cancellato (purge
-- dei 12 mesi) porta via il suo passo.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.crm_next_steps (
    venue_id       uuid        PRIMARY KEY REFERENCES public.crm_venues (id) ON DELETE CASCADE,
    step           text        NOT NULL CHECK (char_length(btrim(step)) BETWEEN 1 AND 200),
    due_on         date,
    owner_user_id  uuid        REFERENCES auth.users (id) ON DELETE SET NULL,
    set_by         uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE RESTRICT,
    set_at         timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE public.crm_next_steps FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.crm_next_steps TO authenticated;

ALTER TABLE public.crm_next_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_next_steps select" ON public.crm_next_steps;
CREATE POLICY "crm_next_steps select" ON public.crm_next_steps
    FOR SELECT TO authenticated USING (public.is_platform_admin());

-- Chi scrive firma con sé stesso: set_by non si può scegliere.
DROP POLICY IF EXISTS "crm_next_steps insert" ON public.crm_next_steps;
CREATE POLICY "crm_next_steps insert" ON public.crm_next_steps
    FOR INSERT TO authenticated
    WITH CHECK (public.is_platform_admin() AND set_by = auth.uid());

DROP POLICY IF EXISTS "crm_next_steps update" ON public.crm_next_steps;
CREATE POLICY "crm_next_steps update" ON public.crm_next_steps
    FOR UPDATE TO authenticated
    USING (public.is_platform_admin())
    WITH CHECK (public.is_platform_admin() AND set_by = auth.uid());

DROP POLICY IF EXISTS "crm_next_steps delete" ON public.crm_next_steps;
CREATE POLICY "crm_next_steps delete" ON public.crm_next_steps
    FOR DELETE TO authenticated USING (public.is_platform_admin());
