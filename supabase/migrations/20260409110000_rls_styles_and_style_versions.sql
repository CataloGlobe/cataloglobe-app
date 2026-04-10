-- =============================================================================
-- RLS: styles + style_versions
-- Aggiunge le 4 policy standard (authenticated, get_my_tenant_ids()) sulle
-- tabelle styles e style_versions, che erano prive di protezione a livello DB.
-- L'accesso pubblico al catalogo passa per service_role via edge function
-- resolve-public-catalog, quindi NON servono policy anon.
-- =============================================================================

BEGIN;

-- ─── styles ──────────────────────────────────────────────────────────────────

ALTER TABLE public.styles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant select own rows" ON public.styles;
DROP POLICY IF EXISTS "Tenant insert own rows" ON public.styles;
DROP POLICY IF EXISTS "Tenant update own rows" ON public.styles;
DROP POLICY IF EXISTS "Tenant delete own rows" ON public.styles;

CREATE POLICY "Tenant select own rows"
ON public.styles
FOR SELECT TO authenticated
USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

CREATE POLICY "Tenant insert own rows"
ON public.styles
FOR INSERT TO authenticated
WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

CREATE POLICY "Tenant update own rows"
ON public.styles
FOR UPDATE TO authenticated
USING  (tenant_id IN (SELECT public.get_my_tenant_ids()))
WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

CREATE POLICY "Tenant delete own rows"
ON public.styles
FOR DELETE TO authenticated
USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

-- ─── style_versions ──────────────────────────────────────────────────────────

ALTER TABLE public.style_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant select own rows" ON public.style_versions;
DROP POLICY IF EXISTS "Tenant insert own rows" ON public.style_versions;
DROP POLICY IF EXISTS "Tenant update own rows" ON public.style_versions;
DROP POLICY IF EXISTS "Tenant delete own rows" ON public.style_versions;

CREATE POLICY "Tenant select own rows"
ON public.style_versions
FOR SELECT TO authenticated
USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

CREATE POLICY "Tenant insert own rows"
ON public.style_versions
FOR INSERT TO authenticated
WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

CREATE POLICY "Tenant update own rows"
ON public.style_versions
FOR UPDATE TO authenticated
USING  (tenant_id IN (SELECT public.get_my_tenant_ids()))
WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

CREATE POLICY "Tenant delete own rows"
ON public.style_versions
FOR DELETE TO authenticated
USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

COMMIT;
