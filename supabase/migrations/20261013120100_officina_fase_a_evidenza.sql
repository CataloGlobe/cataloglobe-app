-- =============================================================================
-- Officina, fase (a): in evidenza. Solo aggiunte, il codice di oggi non le legge.
-- =============================================================================
--
-- Pacchetto database dell'Officina, passi (a) di M9 e M10. Scelte di Lorenzo
-- del 2026-10-13.
--
--   M9  featured_content_positions: l'ordine dei contenuti in evidenza, sede per
--       sede (un posto solo, in cima). Vuota: la riempie il passo (b).
--   M10 la data da mostrare sul contenuto, sei colonne tutte NULL. La data non
--       spegne niente: è solo un testo per il cliente.
--
-- Fuori da qui: cta_action (M11) parte dalla #450, non ancora unita. I valori
-- nuovi e il «link» tolto vanno in una migrazione sopra la #450, dopo il
-- conteggio per azienda in sola lettura.
--
-- Accesso a featured_content_positions: legge chi è dell'azienda; scrive chi
-- ha featured.write sulla sede della riga (has_permission, per sede, non
-- has_permission_any_activity come featured_contents: spostare un contenuto in
-- una sede non tocca le altre).
--
-- Indietro (staging, prima del passo b):
--   DROP TABLE public.featured_content_positions;
--   ALTER TABLE public.featured_contents
--     DROP CONSTRAINT featured_contents_shown_date_check,
--     DROP CONSTRAINT featured_contents_shown_time_check,
--     DROP COLUMN shown_date_kind, DROP COLUMN shown_date_from,
--     DROP COLUMN shown_date_to, DROP COLUMN shown_weekdays,
--     DROP COLUMN shown_time_from, DROP COLUMN shown_time_to;
-- =============================================================================

-- M9: ordine per sede ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.featured_content_positions (
  activity_id          uuid NOT NULL,
  featured_content_id  uuid NOT NULL
    REFERENCES public.featured_contents(id) ON DELETE CASCADE,
  tenant_id            uuid NOT NULL,
  position             integer NOT NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (activity_id, featured_content_id),
  CONSTRAINT featured_content_positions_activity_fkey
    FOREIGN KEY (activity_id, tenant_id)
    REFERENCES public.activities (id, tenant_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS featured_content_positions_activity_position_idx
  ON public.featured_content_positions (activity_id, position);
CREATE INDEX IF NOT EXISTS featured_content_positions_content_idx
  ON public.featured_content_positions (featured_content_id);

DROP TRIGGER IF EXISTS trg_featured_content_positions_updated_at
  ON public.featured_content_positions;
CREATE TRIGGER trg_featured_content_positions_updated_at
  BEFORE UPDATE ON public.featured_content_positions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.featured_content_positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant select own rows" ON public.featured_content_positions;
CREATE POLICY "Tenant select own rows" ON public.featured_content_positions
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

DROP POLICY IF EXISTS "Roles can insert featured_content_positions" ON public.featured_content_positions;
CREATE POLICY "Roles can insert featured_content_positions" ON public.featured_content_positions
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids())
              AND public.has_permission('featured.write', activity_id));

DROP POLICY IF EXISTS "Roles can update featured_content_positions" ON public.featured_content_positions;
CREATE POLICY "Roles can update featured_content_positions" ON public.featured_content_positions
  FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT public.get_my_tenant_ids())
         AND public.has_permission('featured.write', activity_id))
  WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids())
              AND public.has_permission('featured.write', activity_id));

DROP POLICY IF EXISTS "Roles can delete featured_content_positions" ON public.featured_content_positions;
CREATE POLICY "Roles can delete featured_content_positions" ON public.featured_content_positions
  FOR DELETE TO authenticated
  USING (tenant_id IN (SELECT public.get_my_tenant_ids())
         AND public.has_permission('featured.write', activity_id));

-- Il contenuto è della stessa azienda della riga (la sede lo è già per la FK
-- composta).
DROP POLICY IF EXISTS "Parent same tenant on insert" ON public.featured_content_positions;
CREATE POLICY "Parent same tenant on insert" ON public.featured_content_positions
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.featured_contents p
                      WHERE p.id = featured_content_positions.featured_content_id
                        AND p.tenant_id = featured_content_positions.tenant_id));
DROP POLICY IF EXISTS "Parent same tenant on update" ON public.featured_content_positions;
CREATE POLICY "Parent same tenant on update" ON public.featured_content_positions
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (EXISTS (SELECT 1 FROM public.featured_contents p
                      WHERE p.id = featured_content_positions.featured_content_id
                        AND p.tenant_id = featured_content_positions.tenant_id));

REVOKE ALL ON public.featured_content_positions FROM anon;

-- M10: la data da mostrare ---------------------------------------------------------
-- Giorni con la convenzione delle regole (0 = domenica). Nel CHECK ogni ramo
-- con un tipo comincia da «shown_date_kind IS NOT NULL» e i confronti che
-- possono dare NULL sono chiusi da coalesce: un CHECK che vale NULL passa.
ALTER TABLE public.featured_contents
  ADD COLUMN IF NOT EXISTS shown_date_kind text,
  ADD COLUMN IF NOT EXISTS shown_date_from date,
  ADD COLUMN IF NOT EXISTS shown_date_to   date,
  ADD COLUMN IF NOT EXISTS shown_weekdays  integer[],
  ADD COLUMN IF NOT EXISTS shown_time_from time,
  ADD COLUMN IF NOT EXISTS shown_time_to   time;

ALTER TABLE public.featured_contents DROP CONSTRAINT IF EXISTS featured_contents_shown_date_check;
ALTER TABLE public.featured_contents ADD CONSTRAINT featured_contents_shown_date_check
  CHECK (
    (shown_date_kind IS NULL
      AND shown_date_from IS NULL AND shown_date_to IS NULL
      AND shown_weekdays IS NULL
      AND shown_time_from IS NULL AND shown_time_to IS NULL)
    OR (shown_date_kind IS NOT NULL AND shown_date_kind = 'day'
      AND shown_date_from IS NOT NULL
      AND shown_date_to IS NULL AND shown_weekdays IS NULL)
    OR (shown_date_kind IS NOT NULL AND shown_date_kind = 'period'
      AND shown_date_from IS NOT NULL AND shown_date_to IS NOT NULL
      AND shown_date_to >= shown_date_from
      AND shown_weekdays IS NULL)
    OR (shown_date_kind IS NOT NULL AND shown_date_kind = 'weekly'
      AND coalesce(cardinality(shown_weekdays), 0) >= 1
      AND coalesce(shown_weekdays <@ ARRAY[0, 1, 2, 3, 4, 5, 6], false)
      AND array_position(shown_weekdays, NULL) IS NULL
      AND shown_date_from IS NULL AND shown_date_to IS NULL)
  );

-- Ore facoltative, ma la fine senza l'inizio no.
ALTER TABLE public.featured_contents DROP CONSTRAINT IF EXISTS featured_contents_shown_time_check;
ALTER TABLE public.featured_contents ADD CONSTRAINT featured_contents_shown_time_check
  CHECK (shown_time_to IS NULL OR shown_time_from IS NOT NULL);
