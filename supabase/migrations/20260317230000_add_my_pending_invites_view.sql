-- =============================================================================
-- FIX: pending invites visible to the wrong user in Workspace
--
-- Problem 1 — wrong rows returned
-- WorkspacePage queries tenant_members_view with only .eq("status","pending").
-- Because tenant owners have an RLS policy that lets them read ALL membership
-- rows for their tenant, pending invites they SENT to others were returned and
-- displayed as "invites for them to accept". The correct filter is:
--   • invited_email matches the current user's email  →  they are the recipient
--   • invited_by IS DISTINCT FROM auth.uid()          →  they did not send it
--
-- Problem 2 — email-only recipients could not read their own row
-- The existing RLS policies on tenant_memberships check user_id = auth.uid().
-- Email-only invite rows have user_id = NULL until accepted, so NULL = auth.uid()
-- evaluates to NULL (not TRUE) and none of the existing policies grant access.
-- The view would always return 0 rows for email-only invited users without a
-- new policy that matches by invited_email.
--
-- Fix — two parts:
--
--   1. New RLS SELECT policy:
--      "Users can read pending invites for their email"
--      USING (lower(invited_email) = lower(auth.email()))
--      Allows email-only invited users to read their own pending invite row.
--      Does not grant any write access.
--
--   2. New view: my_pending_invites_view
--      Pre-filtered to show only invites where the calling user is the
--      intended recipient and did not send the invite themselves.
--      Returns the same column set WorkspacePage already expects so that
--      only the table name in the frontend query needs to change.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. RLS policy — let invited users read their own email-only invite rows
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'tenant_memberships'
      AND policyname = 'Users can read pending invites for their email'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Users can read pending invites for their email"
      ON public.tenant_memberships
      FOR SELECT
      TO authenticated
      USING (lower(invited_email) = lower(auth.email()))
    $policy$;
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- 2. View — pending invites addressed to the current user
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.my_pending_invites_view AS
SELECT
  tm.id           AS membership_id,
  tm.tenant_id,
  tm.invite_token,
  tm.role,
  tm.status,
  inviter.email   AS inviter_email
FROM public.tenant_memberships tm
LEFT JOIN auth.users inviter ON inviter.id = tm.invited_by
WHERE tm.status                = 'pending'
  AND lower(tm.invited_email)  = lower(auth.email())
  AND tm.invited_by IS DISTINCT FROM auth.uid();
