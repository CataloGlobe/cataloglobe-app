BEGIN;

ALTER TABLE public.schedule_featured_contents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant select own rows" ON public.schedule_featured_contents;
DROP POLICY IF EXISTS "Tenant insert own rows" ON public.schedule_featured_contents;
DROP POLICY IF EXISTS "Tenant update own rows" ON public.schedule_featured_contents;
DROP POLICY IF EXISTS "Tenant delete own rows" ON public.schedule_featured_contents;

CREATE POLICY "Tenant select own rows"
  ON public.schedule_featured_contents FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

CREATE POLICY "Tenant insert own rows"
  ON public.schedule_featured_contents FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

CREATE POLICY "Tenant update own rows"
  ON public.schedule_featured_contents FOR UPDATE TO authenticated
  USING  (tenant_id IN (SELECT public.get_my_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

CREATE POLICY "Tenant delete own rows"
  ON public.schedule_featured_contents FOR DELETE TO authenticated
  USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

-- Accesso pubblico per la pagina catalogo (resolver usa query diretta, non RPC)
-- TODO: in futuro refactoring del resolver per usare SECURITY DEFINER RPC
DROP POLICY IF EXISTS "Public read schedule featured contents" ON public.schedule_featured_contents;
CREATE POLICY "Public read schedule featured contents"
  ON public.schedule_featured_contents FOR SELECT TO anon
  USING (true);

COMMIT;
