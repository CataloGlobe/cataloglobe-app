-- =============================================================================
-- CRM: libreria delle obiezioni (F2-5, riepilogo e report per Ferdinando)
-- =============================================================================
-- Due tabelle nuove, di piattaforma come le altre `crm_*` (niente tenant_id,
-- RLS su `is_platform_admin()`, nessun accesso ad anon):
--   crm_objections        ogni obiezione sentita da un locale, con categoria
--                         e nota. Si scrive spostando in Perso per obiezione
--                         o dalla scheda del lead, quando esce in
--                         conversazione. Il locale cancellato (purge dei 12
--                         mesi) porta via le sue.
--   crm_objection_answers la risposta che funziona, una per categoria: la
--                         scrive il team, la leggeranno gli agenti.
-- Le categorie stanno anche in `src/utils/crm/objections.ts`
-- (CRM_OBJECTION_CATEGORIES): cambiarle insieme, con una migration nuova.
-- AGGIUNTA PURA: nessuna tabella, funzione o policy esistente cambia.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.crm_objections (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id    uuid        NOT NULL REFERENCES public.crm_venues (id) ON DELETE CASCADE,
    category    text        NOT NULL CHECK (category IN (
                    'prezzo', 'ha_gia_soluzione', 'non_serve', 'tempo',
                    'decide_altri', 'non_ora', 'diffidenza', 'altro')),
    note        text        CHECK (note IS NULL OR char_length(note) <= 500),
    source      text        NOT NULL CHECK (source IN ('perso', 'scheda')),
    created_by  uuid        DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE SET NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_objections_created_at_idx ON public.crm_objections (created_at);
CREATE INDEX IF NOT EXISTS crm_objections_venue_idx ON public.crm_objections (venue_id);

CREATE TABLE IF NOT EXISTS public.crm_objection_answers (
    category    text        PRIMARY KEY CHECK (category IN (
                    'prezzo', 'ha_gia_soluzione', 'non_serve', 'tempo',
                    'decide_altri', 'non_ora', 'diffidenza', 'altro')),
    answer      text        NOT NULL CHECK (char_length(btrim(answer)) BETWEEN 1 AND 1000),
    updated_by  uuid        REFERENCES auth.users (id) ON DELETE SET NULL,
    updated_at  timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE public.crm_objections FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.crm_objection_answers FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.crm_objections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.crm_objection_answers TO authenticated;

ALTER TABLE public.crm_objections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_objection_answers ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['crm_objections', 'crm_objection_answers']
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || ' select', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_platform_admin())',
            t || ' select', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || ' insert', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin())',
            t || ' insert', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || ' update', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin())',
            t || ' update', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || ' delete', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_platform_admin())',
            t || ' delete', t);
    END LOOP;
END $$;
