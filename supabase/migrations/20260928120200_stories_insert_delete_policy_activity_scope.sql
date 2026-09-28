-- Stories: le policy di insert e delete guardano la sede della storia.
--
-- Problema: come l'update prima di 20260928120100, insert e delete chiedevano
-- stories.write su una sede qualsiasi dell'azienda
-- (has_permission_any_activity). Un manager di una sola sede poteva creare
-- storie legate a sedi fuori dal suo scope ed eliminare quelle esistenti.
--
-- Soluzione: stessa espressione della policy di update. Con activity_id
-- valorizzato serve stories.write su quella sede (has_permission); con
-- activity_id NULL (storia di brand) resta la regola di prima.

DROP POLICY IF EXISTS "Roles can insert stories" ON public.stories;

CREATE POLICY "Roles can insert stories"
ON public.stories
FOR INSERT
WITH CHECK (
  (tenant_id IN (SELECT public.get_my_tenant_ids()))
  AND CASE
    WHEN activity_id IS NULL
      THEN public.has_permission_any_activity('stories.write', tenant_id)
    ELSE public.has_permission('stories.write', activity_id)
  END
);

DROP POLICY IF EXISTS "Roles can delete stories" ON public.stories;

CREATE POLICY "Roles can delete stories"
ON public.stories
FOR DELETE
USING (
  (tenant_id IN (SELECT public.get_my_tenant_ids()))
  AND CASE
    WHEN activity_id IS NULL
      THEN public.has_permission_any_activity('stories.write', tenant_id)
    ELSE public.has_permission('stories.write', activity_id)
  END
);
