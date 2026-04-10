-- =============================================================================
-- Fix RLS su product_allergens
-- La policy originale usava auth.uid() invece di get_my_tenant_ids(),
-- rendendo possibile l'accesso cross-tenant per utenti autenticati.
-- Pattern: tenant_id IN (SELECT public.get_my_tenant_ids()) — SETOF, non array.
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS "Tenants can manage their own product allergens" ON public.product_allergens;
DROP POLICY IF EXISTS "Tenants can select their own product allergens"  ON public.product_allergens;
DROP POLICY IF EXISTS "Tenants can insert their own product allergens"  ON public.product_allergens;
DROP POLICY IF EXISTS "Tenants can update their own product allergens"  ON public.product_allergens;
DROP POLICY IF EXISTS "Tenants can delete their own product allergens"  ON public.product_allergens;

CREATE POLICY "Tenants can select their own product allergens"
ON public.product_allergens
FOR SELECT TO authenticated
USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

CREATE POLICY "Tenants can insert their own product allergens"
ON public.product_allergens
FOR INSERT TO authenticated
WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

CREATE POLICY "Tenants can update their own product allergens"
ON public.product_allergens
FOR UPDATE TO authenticated
USING  (tenant_id IN (SELECT public.get_my_tenant_ids()))
WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

CREATE POLICY "Tenants can delete their own product allergens"
ON public.product_allergens
FOR DELETE TO authenticated
USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

-- NOTE: "Service role has full access to product allergens" (FOR ALL TO service_role) — invariata.
-- NOTE: "Public can read product_allergens" (TO anon, migration 20260402120000) — invariata.

COMMIT;
