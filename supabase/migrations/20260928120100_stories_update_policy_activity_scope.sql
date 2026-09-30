-- Stories: la policy di update guarda la sede della storia.
--
-- Problema: "Roles can update stories" chiedeva stories.write su una sede
-- qualsiasi dell'azienda (has_permission_any_activity). Un manager di una sola
-- sede poteva quindi modificare le storie legate a sedi fuori dal suo scope,
-- e spostare una storia su una di quelle sedi.
--
-- Soluzione: con activity_id valorizzato serve stories.write su quella sede
-- (has_permission, che per owner/admin verifica anche che la sede sia della
-- loro azienda); con activity_id NULL (storia di brand) resta la regola di
-- prima. Stessa espressione in USING (riga di partenza) e WITH CHECK (riga
-- risultante): il manager non tocca storie fuori scope né ce ne porta.
--
-- Il vincolo di stessa azienda sta nella FK composta di 20260928120000.

DROP POLICY IF EXISTS "Roles can update stories" ON public.stories;

CREATE POLICY "Roles can update stories"
ON public.stories
FOR UPDATE
USING (
  (tenant_id IN (SELECT public.get_my_tenant_ids()))
  AND CASE
    WHEN activity_id IS NULL
      THEN public.has_permission_any_activity('stories.write', tenant_id)
    ELSE public.has_permission('stories.write', activity_id)
  END
)
WITH CHECK (
  (tenant_id IN (SELECT public.get_my_tenant_ids()))
  AND CASE
    WHEN activity_id IS NULL
      THEN public.has_permission_any_activity('stories.write', tenant_id)
    ELSE public.has_permission('stories.write', activity_id)
  END
);
