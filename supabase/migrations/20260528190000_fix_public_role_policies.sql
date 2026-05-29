-- =============================================================================
-- Security fix — Replace {public} role on 22 RLS policies with explicit roles.
--
-- BUG: 22 PERMISSIVE policies target Postgres role {public}, which includes
-- {authenticated}. Combined with the OR semantics of PERMISSIVE policies,
-- this caused cross-tenant data leaks: a member of one tenant could read
-- rows from any "public" tenant because the policy applied to them too.
--
-- Concrete observed leak: the manager of McDonald's-Comasina could see
-- McDonald's-Garbagnate (to which he is not assigned) via "Public can read
-- activities" {public} → {authenticated} inheritance.
--
-- FIX: drop and re-create the 22 policies, keeping qual / with_check
-- verbatim but assigning the correct role:
--
-- Category A (cross-tenant public-read): {public} → {anon}
-- Category B (truly global data):        {public} → {anon, authenticated}
-- Category C (user-scoped):              {public} → {authenticated}
--
-- with_check values for INSERT policies verified against pg_policies via
-- MCP staging before writing this migration.
-- =============================================================================

BEGIN;

-- =============================================================================
-- Category A — Cross-tenant public-read policies (11 policies)
-- Role change: {public} → {anon}
-- Qual: tenant_id IN (SELECT get_public_tenant_ids())
-- =============================================================================

-- activities
DROP POLICY IF EXISTS "Public can read activities" ON public.activities;
CREATE POLICY "Public can read activities"
  ON public.activities FOR SELECT TO anon
  USING (tenant_id IN (SELECT public.get_public_tenant_ids()));

-- activity_group_members
DROP POLICY IF EXISTS "Public can read activity_group_members" ON public.activity_group_members;
CREATE POLICY "Public can read activity_group_members"
  ON public.activity_group_members FOR SELECT TO anon
  USING (tenant_id IN (SELECT public.get_public_tenant_ids()));

-- activity_groups
DROP POLICY IF EXISTS "Public can read activity_groups" ON public.activity_groups;
CREATE POLICY "Public can read activity_groups"
  ON public.activity_groups FOR SELECT TO anon
  USING (tenant_id IN (SELECT public.get_public_tenant_ids()));

-- product_attribute_definitions (NOTE: includes "tenant_id IS NULL" for
-- platform-wide attrs)
DROP POLICY IF EXISTS "Public can read product_attribute_definitions" ON public.product_attribute_definitions;
CREATE POLICY "Public can read product_attribute_definitions"
  ON public.product_attribute_definitions FOR SELECT TO anon
  USING (
    tenant_id IS NULL
    OR tenant_id IN (SELECT public.get_public_tenant_ids())
  );

-- product_attribute_values
DROP POLICY IF EXISTS "Public can read product_attribute_values" ON public.product_attribute_values;
CREATE POLICY "Public can read product_attribute_values"
  ON public.product_attribute_values FOR SELECT TO anon
  USING (tenant_id IN (SELECT public.get_public_tenant_ids()));

-- product_variant_assignment_values
DROP POLICY IF EXISTS "Public can read product_variant_assignment_values" ON public.product_variant_assignment_values;
CREATE POLICY "Public can read product_variant_assignment_values"
  ON public.product_variant_assignment_values FOR SELECT TO anon
  USING (
    assignment_id IN (
      SELECT product_variant_assignments.id
      FROM public.product_variant_assignments
      WHERE product_variant_assignments.tenant_id IN (
        SELECT public.get_public_tenant_ids()
      )
    )
  );

-- product_variant_assignments
DROP POLICY IF EXISTS "Public can read product_variant_assignments" ON public.product_variant_assignments;
CREATE POLICY "Public can read product_variant_assignments"
  ON public.product_variant_assignments FOR SELECT TO anon
  USING (tenant_id IN (SELECT public.get_public_tenant_ids()));

-- product_variant_dimension_values
DROP POLICY IF EXISTS "Public can read product_variant_dimension_values" ON public.product_variant_dimension_values;
CREATE POLICY "Public can read product_variant_dimension_values"
  ON public.product_variant_dimension_values FOR SELECT TO anon
  USING (tenant_id IN (SELECT public.get_public_tenant_ids()));

-- product_variant_dimensions
DROP POLICY IF EXISTS "Public can read product_variant_dimensions" ON public.product_variant_dimensions;
CREATE POLICY "Public can read product_variant_dimensions"
  ON public.product_variant_dimensions FOR SELECT TO anon
  USING (tenant_id IN (SELECT public.get_public_tenant_ids()));

-- products
DROP POLICY IF EXISTS "Public can read products" ON public.products;
CREATE POLICY "Public can read products"
  ON public.products FOR SELECT TO anon
  USING (tenant_id IN (SELECT public.get_public_tenant_ids()));

-- schedule_visibility_overrides
DROP POLICY IF EXISTS "Public can read schedule_visibility_overrides" ON public.schedule_visibility_overrides;
CREATE POLICY "Public can read schedule_visibility_overrides"
  ON public.schedule_visibility_overrides FOR SELECT TO anon
  USING (tenant_id IN (SELECT public.get_public_tenant_ids()));

-- =============================================================================
-- Category B — Truly global data (3 policies)
-- Role change: {public} → {anon, authenticated}
-- Qual: true
-- =============================================================================

-- allergens (cross-tenant catalog)
DROP POLICY IF EXISTS "Public can read v2_allergens" ON public.allergens;
CREATE POLICY "Public can read v2_allergens"
  ON public.allergens FOR SELECT TO anon, authenticated
  USING (true);

-- product_characteristics
DROP POLICY IF EXISTS "Public can read product_characteristics" ON public.product_characteristics;
CREATE POLICY "Public can read product_characteristics"
  ON public.product_characteristics FOR SELECT TO anon, authenticated
  USING (true);

-- supported_languages
DROP POLICY IF EXISTS "supported_languages_read_all" ON public.supported_languages;
CREATE POLICY "supported_languages_read_all"
  ON public.supported_languages FOR SELECT TO anon, authenticated
  USING (true);

-- =============================================================================
-- Category C — User-scoped policies (8 policies)
-- Role change: {public} → {authenticated}
-- Qual: user_id = auth.uid() (or equivalent)
-- =============================================================================

-- consent_records — SELECT
DROP POLICY IF EXISTS "Users can view own consents" ON public.consent_records;
CREATE POLICY "Users can view own consents"
  ON public.consent_records FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- consent_records — INSERT (with_check verified: user_id = auth.uid())
DROP POLICY IF EXISTS "Users can insert own consents" ON public.consent_records;
CREATE POLICY "Users can insert own consents"
  ON public.consent_records FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- notifications — DELETE
DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- notifications — UPDATE (qual + with_check identical)
DROP POLICY IF EXISTS "Users can mark own notifications as read" ON public.notifications;
CREATE POLICY "Users can mark own notifications as read"
  ON public.notifications FOR UPDATE TO authenticated
  USING       (user_id = auth.uid())
  WITH CHECK  (user_id = auth.uid());

-- notifications — SELECT
DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
CREATE POLICY "Users can read own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- profiles — INSERT (with_check verified: id = auth.uid())
DROP POLICY IF EXISTS "profiles_insert_owner" ON public.profiles;
CREATE POLICY "profiles_insert_owner"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- profiles — SELECT (self OR member of caller's tenants)
DROP POLICY IF EXISTS "profiles_select_self_or_tenant_member" ON public.profiles;
CREATE POLICY "profiles_select_self_or_tenant_member"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm_self
      JOIN public.tenant_memberships tm_target
        ON tm_target.tenant_id = tm_self.tenant_id
      WHERE tm_self.user_id   = auth.uid()
        AND tm_target.user_id = profiles.id
        AND tm_self.status    = 'active'
        AND tm_target.status  = 'active'
    )
  );

-- profiles — UPDATE (qual + with_check identical)
DROP POLICY IF EXISTS "profiles_update_owner" ON public.profiles;
CREATE POLICY "profiles_update_owner"
  ON public.profiles FOR UPDATE TO authenticated
  USING       (id = auth.uid())
  WITH CHECK  (id = auth.uid());

COMMIT;
