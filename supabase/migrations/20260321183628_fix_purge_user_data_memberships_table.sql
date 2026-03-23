BEGIN;

-- Recreate function with correct table name
CREATE OR REPLACE FUNCTION public.purge_user_data(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    v_invited_by_cleared integer := 0;
    v_otp_deleted integer := 0;
    v_membership_deleted integer := 0;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'p_user_id cannot be null';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

    -- Step 1: Nullify invited_by
    UPDATE public.tenant_memberships
    SET invited_by = NULL
    WHERE invited_by = p_user_id;

    GET DIAGNOSTICS v_invited_by_cleared = ROW_COUNT;

    -- Step 2: Delete OTP rows
    DELETE FROM public.otp_session_verifications
    WHERE user_id = p_user_id;

    GET DIAGNOSTICS v_otp_deleted = ROW_COUNT;

    -- Step 3: Delete memberships
    DELETE FROM public.tenant_memberships
    WHERE user_id = p_user_id;

    GET DIAGNOSTICS v_membership_deleted = ROW_COUNT;

    RETURN jsonb_build_object(
        'invited_by_cleared', v_invited_by_cleared,
        'otp_rows_deleted', v_otp_deleted,
        'membership_rows_deleted', v_membership_deleted,
        'profile_deleted', false
    );
END;
$$;

COMMIT;