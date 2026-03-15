BEGIN;

-- =============================================================================
-- Hardening: FK ON DELETE behavior for auth.users references
-- =============================================================================
--
-- Problem 1: v2_tenants.owner_user_id → auth.users ON DELETE CASCADE
--   If an owner deletes their auth.users account:
--     - Empty tenants: CASCADE silently hard-deletes the tenant, bypassing
--       the soft-delete mechanism (deleted_at) entirely.
--     - Tenants with data: deletion is blocked by RESTRICT FKs on
--       v2_activities/v2_products/v2_featured_contents — the user cannot
--       delete their account at all.
--   Neither outcome is acceptable. The correct behavior is RESTRICT: the
--   owner must explicitly soft-delete their tenants before their account
--   can be removed. This forces a controlled offboarding path.
--
-- Problem 2: v2_tenant_memberships.invited_by → auth.users (NO ON DELETE)
--   PostgreSQL default NO ACTION behaves as RESTRICT for non-deferred
--   transactions. Any user who has ever sent an invite cannot delete their
--   auth.users account because invited_by references their id.
--   invited_by is nullable by design — SET NULL is the correct behavior:
--   the invite and membership remain valid, only the inviter reference is lost.
--
-- Changes:
--   1. v2_tenants.owner_user_id FK: CASCADE → RESTRICT
--   2. v2_tenant_memberships.invited_by FK: NO ACTION → SET NULL
--
-- Safety:
--   - No data is modified — only constraint definitions are changed.
--   - RESTRICT on owner_user_id is a stricter guard, not a relaxation.
--   - SET NULL on invited_by aligns with the column already being nullable.
--   - Both changes are idempotent: DROP IF EXISTS + ADD.
-- =============================================================================


-- =============================================================================
-- FIX 1: v2_tenants.owner_user_id → auth.users: CASCADE → RESTRICT
-- =============================================================================
--
-- The constraint was added in 20260309000000_v2_phase1_multi_tenant.sql.
-- We drop and re-add it with the corrected ON DELETE behavior.
--
-- Effect after this migration:
--   Attempting to DELETE an auth.users row that is referenced as owner_user_id
--   in any v2_tenants row will fail with a FK violation. The owner must first
--   soft-delete (or fully purge) all their tenants via the delete-tenant
--   edge function before their auth account can be removed.
-- =============================================================================

ALTER TABLE public.v2_tenants
  DROP CONSTRAINT IF EXISTS v2_tenants_owner_user_id_fkey;

ALTER TABLE public.v2_tenants
  ADD CONSTRAINT v2_tenants_owner_user_id_fkey
    FOREIGN KEY (owner_user_id)
    REFERENCES auth.users(id)
    ON DELETE RESTRICT;


-- =============================================================================
-- FIX 2: v2_tenant_memberships.invited_by → auth.users: NO ACTION → SET NULL
-- =============================================================================
--
-- The column was defined in 20260312120000_v2_tenant_memberships.sql without
-- an explicit ON DELETE clause (PostgreSQL default: NO ACTION = RESTRICT).
-- PostgreSQL auto-names unnamed FK constraints as <table>_<column>_fkey.
--
-- Effect after this migration:
--   When an auth.users row is deleted, any v2_tenant_memberships rows where
--   invited_by = that user_id will have invited_by set to NULL. The membership
--   row itself is preserved — only the inviter reference is cleared.
-- =============================================================================

ALTER TABLE public.v2_tenant_memberships
  DROP CONSTRAINT IF EXISTS v2_tenant_memberships_invited_by_fkey;

ALTER TABLE public.v2_tenant_memberships
  ADD CONSTRAINT v2_tenant_memberships_invited_by_fkey
    FOREIGN KEY (invited_by)
    REFERENCES auth.users(id)
    ON DELETE SET NULL;


-- =============================================================================
-- Validation
-- =============================================================================

DO $$
DECLARE
  owner_fk_action text;
  invited_fk_action text;
BEGIN
  -- Check owner_user_id FK action
  SELECT confdeltype INTO owner_fk_action
  FROM pg_constraint
  WHERE conname = 'v2_tenants_owner_user_id_fkey'
    AND conrelid = 'public.v2_tenants'::regclass;

  IF owner_fk_action = 'r' THEN
    RAISE NOTICE 'OK: v2_tenants.owner_user_id FK is ON DELETE RESTRICT (confdeltype=r).';
  ELSE
    RAISE EXCEPTION 'FAIL: v2_tenants.owner_user_id FK has unexpected confdeltype=%. Expected r (RESTRICT).', owner_fk_action;
  END IF;

  -- Check invited_by FK action
  SELECT confdeltype INTO invited_fk_action
  FROM pg_constraint
  WHERE conname = 'v2_tenant_memberships_invited_by_fkey'
    AND conrelid = 'public.v2_tenant_memberships'::regclass;

  IF invited_fk_action = 'n' THEN
    RAISE NOTICE 'OK: v2_tenant_memberships.invited_by FK is ON DELETE SET NULL (confdeltype=n).';
  ELSE
    RAISE EXCEPTION 'FAIL: v2_tenant_memberships.invited_by FK has unexpected confdeltype=%. Expected n (SET NULL).', invited_fk_action;
  END IF;
END $$;


COMMIT;
