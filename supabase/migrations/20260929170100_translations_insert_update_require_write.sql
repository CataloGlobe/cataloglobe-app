-- translations: insert e update solo con translations.write.
--
-- Le policy ammettevano ogni membro del tenant: viewer, staff e manager
-- scrivevano righe di traduzione via PostgREST. Nessun client le scrive
-- direttamente: le righe arrivano da upsert_manual_translation e
-- upsert_auto_translation, SECURITY DEFINER di proprietà di postgres (owner
-- della tabella, niente FORCE ROW LEVEL SECURITY), quindi fuori dalla RLS come
-- il service role della Edge process-translation-jobs.
--
-- Restano aperte a ogni membro, di proposito: DELETE su translations e tutte
-- le scritture su translation_jobs. Il manager le usa dal client quando
-- modifica chiusure della sede (activity_hours.write) e contenuti In evidenza
-- (featured.write): chiuderle ora fermerebbe le traduzioni in silenzio
-- (enqueueWithSilentError). PR a parte: RPC di accodamento col permesso
-- dell'entità sorgente.
--
-- Select invariata. Espressione esistente + has_permission_any_activity,
-- correlato a tenant_id della riga.

DROP POLICY IF EXISTS translations_insert ON public.translations;
CREATE POLICY translations_insert ON public.translations
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id IS NOT NULL
    AND tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('translations.write', tenant_id)
  );

DROP POLICY IF EXISTS translations_update ON public.translations;
CREATE POLICY translations_update ON public.translations
  FOR UPDATE TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('translations.write', tenant_id)
  )
  WITH CHECK (
    tenant_id IS NOT NULL
    AND tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('translations.write', tenant_id)
  );
