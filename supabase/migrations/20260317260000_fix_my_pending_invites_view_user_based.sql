-- =============================================================================
-- FIX: my_pending_invites_view — include user-based invites
--
-- Problem: the view matched only email-only invite rows
-- (lower(invited_email) = lower(auth.email())). When the invitee already has
-- an account, invite_tenant_member sets user_id and clears invited_email.
-- Same for re-invites where the user is now known. Those rows have
-- invited_email = NULL, so the email filter never matched and the invite was
-- invisible to the recipient in the Workspace.
--
-- Fix: extend the recipient filter to cover both cases:
--   Case 1 — email-only invite: lower(invited_email) = lower(auth.email())
--   Case 2 — user-based invite: user_id = auth.uid()
--
-- All other filters (status, expiry, invited_by guard) are unchanged.
-- Output schema (columns and aliases) is unchanged.
-- =============================================================================

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
WHERE tm.status = 'pending'
  AND tm.invited_by IS DISTINCT FROM auth.uid()
  AND (
    tm.invite_expires_at IS NULL
    OR tm.invite_expires_at > now()
  )
  AND (
    lower(tm.invited_email) = lower(auth.email())
    OR tm.user_id = auth.uid()
  );
