BEGIN;

DROP POLICY IF EXISTS "Public can read schedule_visibility_overrides"
  ON public.schedule_visibility_overrides;

CREATE POLICY "Public can read schedule_visibility_overrides"
  ON public.schedule_visibility_overrides
  FOR SELECT TO public
  USING (tenant_id IN (SELECT public.get_public_tenant_ids()));

COMMIT;
