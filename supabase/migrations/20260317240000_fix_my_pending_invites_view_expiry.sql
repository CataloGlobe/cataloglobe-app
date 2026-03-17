-- =============================================================================
-- FIX: my_pending_invites_view — exclude expired invites
--
-- Problem: the view returned pending rows past their invite_expires_at.
-- The daily expire_old_invites() cron may not have run yet, so the row still
-- has status='pending' even though accept_invite_by_token will reject it
-- (requires invite_expires_at > now()). Users see the invite in the Workspace
-- banner, click "Accetta", and get a confusing "invalid or already used token"
-- error.
--
-- Fix: add invite_expires_at guard to the WHERE clause.
-- All columns and column aliases are identical to the previous definition.
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
WHERE tm.status                = 'pending'
  AND lower(tm.invited_email)  = lower(auth.email())
  AND tm.invited_by IS DISTINCT FROM auth.uid()
  AND (
    tm.invite_expires_at IS NULL
    OR tm.invite_expires_at > now()
  );
