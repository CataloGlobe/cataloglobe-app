BEGIN;

-- =============================================================================
-- Add profiles.account_deleted_at + RPCs for account deletion tracking
-- =============================================================================
--
-- account_deleted_at records the moment the user requested account deletion.
-- It is the authoritative source for the 30-day recovery window and is used
-- by purge-accounts to identify users eligible for permanent removal.
--
-- It is distinct from tenants.locked_at (which tracks tenant-level locking)
-- and from auth.users.banned_until (which tracks the ban expiry, not the
-- deletion request time).
--
-- Lifecycle:
--   set    → mark_account_deleted()   called by delete-account Edge Function
--   clear  → clear_account_deleted()  called by recover-account Edge Function
--   purge  → CASCADE on profiles FK   profile row deleted with auth.users row
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Column
-- -----------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_deleted_at timestamptz NULL;

-- Sparse index: only rows in pending-deletion state are indexed.
-- Used by purge-accounts to efficiently find expired entries.
CREATE INDEX IF NOT EXISTS idx_profiles_account_deleted_at_not_null
  ON public.profiles (account_deleted_at)
  WHERE account_deleted_at IS NOT NULL;


-- -----------------------------------------------------------------------------
-- 2. RPC: mark_account_deleted(p_user_id)
-- -----------------------------------------------------------------------------
--
-- Sets account_deleted_at = now() on the profile row for p_user_id.
-- Raises profile_not_found if no row was updated (user has no profile).
--
-- Called by the delete-account Edge Function using service_role after the
-- SQL tenant operations complete and before the Supabase Admin API ban.
-- Placing this write before the ban ensures that if the ban call fails,
-- the state is still recorded and the recovery flow functions correctly.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_account_deleted(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN

  UPDATE public.profiles
  SET    account_deleted_at = now()
  WHERE  user_id = p_user_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'profile_not_found: no profile row found for user %', p_user_id
      USING ERRCODE = 'P0002';
  END IF;

END;
$$;

REVOKE ALL    ON FUNCTION public.mark_account_deleted(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.mark_account_deleted(uuid) TO service_role;


-- -----------------------------------------------------------------------------
-- 3. RPC: clear_account_deleted(p_user_id)
-- -----------------------------------------------------------------------------
--
-- Clears account_deleted_at on the profile row for p_user_id.
-- A no-match is silently ignored: if the profile was already purged or the
-- column is already NULL, the operation is a safe no-op.
--
-- Called by the recover-account Edge Function using service_role after the
-- Supabase Admin API unban succeeds and before unlock_owned_tenants().
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.clear_account_deleted(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN

  UPDATE public.profiles
  SET    account_deleted_at = NULL
  WHERE  user_id = p_user_id;

  -- No ROW_COUNT check: idempotent. A NULL → NULL update or a missing row
  -- are both safe outcomes — the column is clear either way.

END;
$$;

REVOKE ALL    ON FUNCTION public.clear_account_deleted(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.clear_account_deleted(uuid) TO service_role;


COMMIT;
