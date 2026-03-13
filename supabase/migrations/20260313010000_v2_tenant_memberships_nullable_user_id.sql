BEGIN;

-- =========================================
-- V2: ALLOW NULL user_id ON MEMBERSHIPS
-- =========================================
--
-- Email-only invites store user_id = NULL until the invitee accepts.
-- Remove the NOT NULL constraint so those rows can be inserted.
-- =========================================

ALTER TABLE public.v2_tenant_memberships
  ALTER COLUMN user_id DROP NOT NULL;

COMMIT;
