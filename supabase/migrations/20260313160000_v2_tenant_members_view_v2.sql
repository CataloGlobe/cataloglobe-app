BEGIN;

-- =========================================
-- V2: TENANT MEMBERS VIEW — V2
-- =========================================
--
-- Adds four columns required by the TeamPage UI:
--
--   membership_id    — stable row identifier for RPC calls (revoke_invite,
--                      resend_invite, change_member_role)
--   inviter_email    — human-readable inviter identity (replaces raw UUID
--                      in the "Invited by" column)
--   invite_token     — kept available for any client-side deep-link needs
--   invite_expires_at — used to render "expires in X days" hint for pending
--                       invites
--
-- Also preserves the existing columns unchanged:
--   tenant_id, user_id, email (COALESCE user+invited), role, status,
--   invited_by (raw UUID, kept for backward compatibility), created_at
-- =========================================

DROP VIEW IF EXISTS public.v2_tenant_members_view;

CREATE VIEW public.v2_tenant_members_view AS
SELECT
  tm.id                                        AS membership_id,
  tm.tenant_id,
  tm.user_id,
  COALESCE(u.email, tm.invited_email)          AS email,
  tm.role,
  tm.status,
  tm.invited_by,
  inviter.email                                AS inviter_email,
  tm.invite_token,
  tm.invite_expires_at,
  tm.created_at
FROM public.v2_tenant_memberships tm
LEFT JOIN auth.users u       ON u.id       = tm.user_id
LEFT JOIN auth.users inviter ON inviter.id = tm.invited_by;

COMMIT;
