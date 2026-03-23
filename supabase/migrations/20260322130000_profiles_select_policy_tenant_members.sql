-- =============================================================================
-- Fix: profiles SELECT policy — allow reading co-member profiles within
-- shared active tenants.
--
-- Problem:
--   The existing "profiles_select_owner" policy restricts SELECT to the row
--   where id = auth.uid().  When PostgREST joins tenant_memberships → profiles,
--   it executes as the authenticated user.  Any profile row that does not belong
--   to auth.uid() is silently filtered to NULL by RLS, making the ownership-
--   transfer dropdown empty.
--
-- Solution:
--   Replace "profiles_select_owner" with a new policy that permits two cases:
--
--     1. A user may always read their own profile (id = auth.uid()).
--
--     2. A user may read another user's profile if — and only if — both users
--        have an ACTIVE membership in at least one common tenant.
--        The self-join on tenant_memberships ensures strict tenant isolation:
--        no cross-tenant profile leakage is possible.
--
-- Performance:
--   The self-join is covered by the existing composite index
--   v2_tenant_memberships_user_status_tenant_id_idx  ON (user_id, status, tenant_id).
--   Both sides of the join use this index:
--     - tm_self  → seek  user_id = auth.uid()    AND status = 'active'
--     - tm_target → seek  user_id = profiles.id   AND status = 'active'
--   No new indexes are required.
--
-- Reversibility:
--   To revert, drop "profiles_select_self_or_tenant_member" and recreate the
--   original "profiles_select_owner" policy (USING id = auth.uid()).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Step 1: Drop the restrictive owner-only SELECT policy.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_select_owner" ON public.profiles;

-- ---------------------------------------------------------------------------
-- Step 2: Create the new tenant-scoped SELECT policy.
-- ---------------------------------------------------------------------------
CREATE POLICY "profiles_select_self_or_tenant_member"
ON public.profiles
FOR SELECT
TO public
USING (
    -- Case 1: user reads their own profile row.
    id = auth.uid()

    OR

    -- Case 2: both auth.uid() and the profile's owner share at least one
    -- active tenant membership.  The double-join prevents reading profiles
    -- of users who are only in a different tenant.
    EXISTS (
        SELECT 1
        FROM   public.tenant_memberships tm_self
        JOIN   public.tenant_memberships tm_target
          ON   tm_target.tenant_id = tm_self.tenant_id
        WHERE  tm_self.user_id    = auth.uid()
          AND  tm_target.user_id  = profiles.id
          AND  tm_self.status     = 'active'
          AND  tm_target.status   = 'active'
    )
);

-- ---------------------------------------------------------------------------
-- Step 3: Reload PostgREST schema cache.
-- ---------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;
