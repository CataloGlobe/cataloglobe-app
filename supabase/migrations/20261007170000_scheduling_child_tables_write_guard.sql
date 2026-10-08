-- =============================================================================
-- Programmazione: i pezzi di una regola si scrivono solo se si può scrivere
-- la regola.
-- =============================================================================
--
-- Problema: le tabelle figlie delle regole hanno PERMISSIVE di scrittura che
-- guardano solo l'azienda:
--   - schedule_layout, schedule_price_overrides, schedule_visibility_overrides:
--     tenant_id IN get_my_tenant_ids() → qualunque membro (viewer e staff
--     compresi) scrive via PostgREST;
--   - schedule_featured_contents: has_permission_any_activity('scheduling.write')
--     → un manager di Comasina scrive i contenuti in evidenza di una regola
--     che vale solo per Garbagnate.
-- Su staging (2026-10-07, in transazione annullata): lo staff di Comasina ha
-- cancellato 2 righe di schedule_visibility_overrides, il viewer il layout di
-- una regola di Garbagnate, il manager 3 contenuti in evidenza di Garbagnate.
-- schedules invece usa can_write_schedule(id): la regola era protetta, i suoi
-- pezzi no.
--
-- Soluzione: per ognuna delle quattro tabelle tre RESTRICTIVE (INSERT, UPDATE,
-- DELETE) con can_write_schedule(schedule_id), come CG-01
-- (20260930150000): vanno in AND con le PERMISSIVE esistenti, che restano.
-- In UPDATE il controllo vale sia sulla riga vecchia (USING) sia sulla nuova
-- (WITH CHECK): una riga non si sposta su una regola che non si può scrivere.
--
-- can_write_schedule è STABLE SECURITY DEFINER con search_path '' (owner
-- postgres): legge schedules e schedule_targets senza RLS, niente ricorsione
-- (42P17). Owner/admin passano sempre; i ruoli di sede solo su regole non
-- apply_to_all con tutte le sedi tra le proprie.
--
-- Fuori da PostgREST nulla cambia: service_role (edge, purge) bypassa RLS, e
-- le cancellazioni a cascata da schedules sono azioni di integrità
-- referenziale, che non passano dall'RLS.
--
-- schedule_id è NOT NULL su tutte e quattro (letto il 2026-10-07).
-- Idempotente: DROP POLICY IF EXISTS prima di ogni CREATE.
-- =============================================================================

-- schedule_layout -------------------------------------------------------------
DROP POLICY IF EXISTS "Schedule writable on insert" ON public.schedule_layout;
CREATE POLICY "Schedule writable on insert" ON public.schedule_layout
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.can_write_schedule(schedule_id));

DROP POLICY IF EXISTS "Schedule writable on update" ON public.schedule_layout;
CREATE POLICY "Schedule writable on update" ON public.schedule_layout
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.can_write_schedule(schedule_id))
  WITH CHECK (public.can_write_schedule(schedule_id));

DROP POLICY IF EXISTS "Schedule writable on delete" ON public.schedule_layout;
CREATE POLICY "Schedule writable on delete" ON public.schedule_layout
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.can_write_schedule(schedule_id));

-- schedule_price_overrides ----------------------------------------------------
DROP POLICY IF EXISTS "Schedule writable on insert" ON public.schedule_price_overrides;
CREATE POLICY "Schedule writable on insert" ON public.schedule_price_overrides
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.can_write_schedule(schedule_id));

DROP POLICY IF EXISTS "Schedule writable on update" ON public.schedule_price_overrides;
CREATE POLICY "Schedule writable on update" ON public.schedule_price_overrides
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.can_write_schedule(schedule_id))
  WITH CHECK (public.can_write_schedule(schedule_id));

DROP POLICY IF EXISTS "Schedule writable on delete" ON public.schedule_price_overrides;
CREATE POLICY "Schedule writable on delete" ON public.schedule_price_overrides
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.can_write_schedule(schedule_id));

-- schedule_visibility_overrides -----------------------------------------------
DROP POLICY IF EXISTS "Schedule writable on insert" ON public.schedule_visibility_overrides;
CREATE POLICY "Schedule writable on insert" ON public.schedule_visibility_overrides
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.can_write_schedule(schedule_id));

DROP POLICY IF EXISTS "Schedule writable on update" ON public.schedule_visibility_overrides;
CREATE POLICY "Schedule writable on update" ON public.schedule_visibility_overrides
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.can_write_schedule(schedule_id))
  WITH CHECK (public.can_write_schedule(schedule_id));

DROP POLICY IF EXISTS "Schedule writable on delete" ON public.schedule_visibility_overrides;
CREATE POLICY "Schedule writable on delete" ON public.schedule_visibility_overrides
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.can_write_schedule(schedule_id));

-- schedule_featured_contents --------------------------------------------------
DROP POLICY IF EXISTS "Schedule writable on insert" ON public.schedule_featured_contents;
CREATE POLICY "Schedule writable on insert" ON public.schedule_featured_contents
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.can_write_schedule(schedule_id));

DROP POLICY IF EXISTS "Schedule writable on update" ON public.schedule_featured_contents;
CREATE POLICY "Schedule writable on update" ON public.schedule_featured_contents
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.can_write_schedule(schedule_id))
  WITH CHECK (public.can_write_schedule(schedule_id));

DROP POLICY IF EXISTS "Schedule writable on delete" ON public.schedule_featured_contents;
CREATE POLICY "Schedule writable on delete" ON public.schedule_featured_contents
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.can_write_schedule(schedule_id));
