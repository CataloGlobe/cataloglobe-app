-- =============================================================================
-- CRM: obiettivo della settimana (Home, grafica finale del 2026-10-05)
-- =============================================================================
-- «2 di 5 telefonate fissate»: il numero da raggiungere lo sceglie il team,
-- una riga per settimana (lunedì di Roma). Il conteggio non sta qui: è il
-- numero di righe di `crm_appointments` create da lunedì, calcolato in /admin.
-- Tabella di piattaforma come le altre `crm_*`: niente tenant_id, RLS su
-- `is_platform_admin()`, nessun accesso ad anon. Niente DELETE: un obiettivo
-- si cambia, non si cancella.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.crm_weekly_goals (
    week_start    date        PRIMARY KEY CHECK (extract(isodow FROM week_start) = 1),
    calls_target  integer     NOT NULL CHECK (calls_target BETWEEN 1 AND 200),
    set_by        uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE RESTRICT,
    set_at        timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE public.crm_weekly_goals FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.crm_weekly_goals TO authenticated;

ALTER TABLE public.crm_weekly_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_weekly_goals select" ON public.crm_weekly_goals;
CREATE POLICY "crm_weekly_goals select" ON public.crm_weekly_goals
    FOR SELECT TO authenticated USING (public.is_platform_admin());

-- Chi scrive firma con sé stesso: set_by non si può scegliere.
DROP POLICY IF EXISTS "crm_weekly_goals insert" ON public.crm_weekly_goals;
CREATE POLICY "crm_weekly_goals insert" ON public.crm_weekly_goals
    FOR INSERT TO authenticated
    WITH CHECK (public.is_platform_admin() AND set_by = auth.uid());

DROP POLICY IF EXISTS "crm_weekly_goals update" ON public.crm_weekly_goals;
CREATE POLICY "crm_weekly_goals update" ON public.crm_weekly_goals
    FOR UPDATE TO authenticated
    USING (public.is_platform_admin())
    WITH CHECK (public.is_platform_admin() AND set_by = auth.uid());
