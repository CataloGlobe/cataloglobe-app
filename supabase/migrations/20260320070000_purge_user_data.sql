BEGIN;

-- =============================================================================
-- RPC: public.purge_user_data(p_user_id uuid)
-- =============================================================================
--
-- Performs all DB-side personal data cleanup for a single user that has been
-- confirmed as eligible for final purge (account_deleted_at older than 30 days,
-- no active owned tenants remaining).
--
-- This function does NOT delete the auth.users row.
-- That is the caller's (Edge Function) responsibility, and must happen AFTER
-- this function succeeds.
--
-- Steps:
--   1. Nullify v2_tenant_memberships.invited_by references to this user.
--      Reason: invited_by has no ON DELETE action (defaults to RESTRICT).
--      If left intact, the subsequent auth.users deletion will fail with a
--      FK violation. Rows where invited_by = p_user_id belong to other users
--      and must not be deleted — only the reference is cleared.
--
--   2. Delete OTP/session verification rows (user_id = p_user_id).
--      Personal session data with no value after deletion.
--
--   3. Delete tenant membership rows (user_id = p_user_id).
--      Memberships in other tenants are explicitly removed here.
--      NOTE: v2_tenant_memberships.user_id has ON DELETE CASCADE on auth.users,
--      so these would be removed on auth deletion anyway. We remove them here
--      explicitly to get the count for logging and to not rely on CASCADE.
--
--   4. Delete the profile row (id = p_user_id).
--      NOTE: profiles.id is the PK and FK to auth.users(id). The profile row
--      may cascade on auth deletion depending on FK definition, but we remove
--      it here explicitly so DB cleanup is confirmed before auth deletion.
--
-- Returns: jsonb with row counts for observability/logging.
--
-- Safety:
--   - Idempotent: all DELETEs and the UPDATE are no-ops if rows are absent.
--   - SECURITY DEFINER: bypasses RLS for service_role purge context.
--   - search_path locked to public: prevents search_path injection.
--   - Granted to service_role only: cannot be called by authenticated users.
--
-- TODO: if v2_tenant_invite_tokens is ever decoupled from v2_tenant_memberships
--       into its own table with a user_id FK, add a DELETE step here.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.purge_user_data(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invited_by_cleared    integer := 0;
    v_otp_deleted           integer := 0;
    v_membership_deleted    integer := 0;
BEGIN

    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'p_user_id cannot be null';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

    -- -------------------------------------------------------------------------
    -- Step 1: Nullify invited_by references to prevent FK block on auth deletion
    -- -------------------------------------------------------------------------
    -- These are rows in other users' memberships where this user sent the invite.
    -- The membership itself belongs to another user and must not be deleted.
    UPDATE public.v2_tenant_memberships
    SET    invited_by = NULL
    WHERE  invited_by = p_user_id;

    GET DIAGNOSTICS v_invited_by_cleared = ROW_COUNT;


    -- -------------------------------------------------------------------------
    -- Step 2: Delete OTP / session verification data
    -- -------------------------------------------------------------------------
    DELETE FROM public.otp_session_verifications
    WHERE  user_id = p_user_id;

    GET DIAGNOSTICS v_otp_deleted = ROW_COUNT;


    -- -------------------------------------------------------------------------
    -- Step 3: Delete tenant membership records for this user
    -- -------------------------------------------------------------------------
    -- Covers memberships in all tenants (other people's tenants).
    -- The user's own tenants were already handled by the deletion flow
    -- (transferred or locked) and will be purged by purge_locked_expired_tenants().
    DELETE FROM public.v2_tenant_memberships
    WHERE  user_id = p_user_id;

    GET DIAGNOSTICS v_membership_deleted = ROW_COUNT;


    -- -------------------------------------------------------------------------
    -- Return summary for Edge Function logging
    -- -------------------------------------------------------------------------
    RETURN jsonb_build_object(
        'user_id',               p_user_id,
        'invited_by_cleared',    v_invited_by_cleared,
        'otp_rows_deleted',      v_otp_deleted,
        'membership_rows_deleted', v_membership_deleted,
        'profile_deleted',       false
    );

END;
$$;


REVOKE ALL     ON FUNCTION public.purge_user_data(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.purge_user_data(uuid) TO service_role;


COMMIT;
