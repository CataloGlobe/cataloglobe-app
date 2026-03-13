BEGIN;

-- =========================================
-- V2: PENDING INVITES — SELF-READ POLICY
-- =========================================
--
-- Allows an authenticated user to read their own pending email-only invites.
--
-- Context:
--   Email-only invites store user_id = NULL and invited_email = <address>.
--   The existing "Users can read their own membership" policy covers rows
--   where user_id = auth.uid(), but not rows where user_id IS NULL.
--   Without this policy, a user who registers after being invited cannot
--   see their pending invite in the WorkspacePage banner.
--
-- This policy covers the remaining case: rows where the invited_email
-- matches the authenticated user's email and the invite is still pending.
--
-- Combined with the existing self-read policy, authenticated users can now
-- read all their pending invites regardless of how they were created.
-- =========================================

CREATE POLICY "Users can read their own pending email invites"
ON public.v2_tenant_memberships
FOR SELECT
TO authenticated
USING (
    status = 'pending'
    AND lower(invited_email) = lower(auth.email())
);

COMMIT;
