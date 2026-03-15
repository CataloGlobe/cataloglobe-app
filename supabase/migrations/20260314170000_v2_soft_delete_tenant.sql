BEGIN;

-- =============================================================================
-- V2: Soft-delete support for v2_tenants
-- =============================================================================
--
-- Goal: allow tenant owners to mark a tenant as deleted without immediately
--       cascading a hard DELETE across all child tables. The tenant becomes
--       invisible in all RLS-guarded queries the moment deleted_at is set.
--
-- What changes:
--   1. Add deleted_at column to v2_tenants
--   2. Update get_my_tenant_ids() to exclude soft-deleted tenants
--   3. Update v2_user_tenants_view to exclude soft-deleted tenants
--   4. Update v2_tenants SELECT policy to exclude soft-deleted tenants
--   5. Drop v2_tenants DELETE policy — hard deletes are only allowed via
--      service_role (future purge edge function). No client-side hard deletes.
--
-- What does NOT change:
--   - RESTRICT constraints on v2_activities, v2_products, v2_featured_contents
--     (kept intentionally — they protect against accidental hard deletes)
--   - All other table policies (they filter via get_my_tenant_ids() which now
--     already excludes soft-deleted tenants — no changes needed)
--
-- Purge path (future):
--   A scheduled edge function will hard-delete tenants where
--   deleted_at < now() - interval '30 days', running as service_role
--   and deleting RESTRICT-blocked tables first in dependency order.
-- =============================================================================


-- =============================================================================
-- STEP 1: Add deleted_at column
-- =============================================================================

ALTER TABLE public.v2_tenants
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_v2_tenants_deleted_at
  ON public.v2_tenants (deleted_at)
  WHERE deleted_at IS NOT NULL;


-- =============================================================================
-- STEP 2: Update get_my_tenant_ids() to exclude soft-deleted tenants
-- =============================================================================
--
-- SECURITY INVOKER + STABLE: runs with caller permissions, result cached per
-- statement. The owner_user_id = auth.uid() predicate on v2_tenants acts as
-- the RLS short-circuit (see migration 20260314140000) — no recursion risk.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_my_tenant_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT id
  FROM v2_tenants
  WHERE owner_user_id = auth.uid()
    AND deleted_at IS NULL
$$;


-- =============================================================================
-- STEP 3: Update v2_user_tenants_view to exclude soft-deleted tenants
-- =============================================================================

CREATE OR REPLACE VIEW public.v2_user_tenants_view AS
SELECT
  t.id,
  t.name,
  t.vertical_type,
  t.created_at,
  t.owner_user_id,
  CASE
    WHEN t.owner_user_id = auth.uid() THEN 'owner'
    ELSE tm.role
  END AS user_role
FROM public.v2_tenants t
LEFT JOIN public.v2_tenant_memberships tm
  ON tm.tenant_id = t.id
  AND tm.user_id = auth.uid()
  AND tm.status = 'active'
WHERE t.deleted_at IS NULL;


-- =============================================================================
-- STEP 4: Update v2_tenants SELECT policy to exclude soft-deleted tenants
-- =============================================================================
--
-- The current policy (20260314140000) short-circuits via owner_user_id to
-- avoid RLS recursion during bootstrap. We keep that short-circuit but add
-- the deleted_at IS NULL guard so soft-deleted tenants are invisible even to
-- their owner.
--
-- The second branch (id IN get_my_tenant_ids()) already filters deleted_at
-- after Step 2, so it needs no additional change.
-- =============================================================================

DROP POLICY IF EXISTS "Users can read their tenants" ON public.v2_tenants;

CREATE POLICY "Users can read their tenants"
ON public.v2_tenants
FOR SELECT TO authenticated
USING (
  (owner_user_id = auth.uid() AND deleted_at IS NULL)
  OR id IN (SELECT public.get_my_tenant_ids())
);


-- =============================================================================
-- STEP 5: Drop the client-side DELETE policy on v2_tenants
-- =============================================================================
--
-- Hard deletes on v2_tenants must only happen via service_role (future purge
-- edge function). No authenticated client should be able to hard-delete a
-- tenant row directly. Soft delete is handled via the delete-tenant edge
-- function which uses service_role for the UPDATE.
-- =============================================================================

DROP POLICY IF EXISTS "Tenant can delete own tenants" ON public.v2_tenants;


COMMIT;
