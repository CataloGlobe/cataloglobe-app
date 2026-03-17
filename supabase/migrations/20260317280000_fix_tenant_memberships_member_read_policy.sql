-- =============================================================================
-- FIX: tenant_memberships — restore active-member read access to full team list
--
-- Problem: migration 20260312123000 fixed a self-join recursion bug in the
-- "Active members can read memberships" SELECT policy by replacing it with an
-- owner-only check. The fix eliminated the recursion but broke the intent:
-- non-owner active members (admins, regular members) can now only read their
-- own membership row via the "Users can read their own membership" policy
-- (user_id = auth.uid()). They cannot see the rest of the team.
--
-- Effect: TeamPage shows only the calling user's own row for any non-owner.
--
-- Fix: add a new SELECT policy that allows any user whose tenant_id is
-- returned by get_my_tenant_ids() to read all membership rows for that tenant.
--
-- Why get_my_tenant_ids() is safe here:
--   - SECURITY DEFINER — executes with definer privileges, bypasses RLS on
--     its internal queries. No self-join on tenant_memberships, no recursion.
--   - STABLE — result is cached within the statement.
--   - Requires status = 'active' — pending, revoked, and left users get an
--     empty set and cannot read any membership rows through this policy.
--
-- Existing policies are unchanged.
-- =============================================================================

CREATE POLICY "Active members can read team memberships"
ON public.tenant_memberships
FOR SELECT
TO authenticated
USING (
  tenant_id IN (SELECT public.get_my_tenant_ids())
);
