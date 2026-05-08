-- Move OTP verification key from (user_id, session_id) to user_id with explicit TTL.
--
-- Rationale: Supabase JWT session_id rotates on autoRefreshToken / HMR / sleep-wake,
-- which desyncs otp_session_verifications and forces the client to redirect to
-- /verify-otp + auto-fire send-otp. Telemetry confirmed >20 redundant OTP rows
-- per owner in 30 days. New table is keyed on user_id with a 30-day TTL; lazy
-- expiry handled in client/edge (no cron needed).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. New table: keyed on user_id with explicit TTL
-- ---------------------------------------------------------------------------
CREATE TABLE public.otp_user_verifications (
    user_id UUID PRIMARY KEY,
    verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_otp_user_verifications_expires
    ON public.otp_user_verifications(expires_at);

ALTER TABLE public.otp_user_verifications ENABLE ROW LEVEL SECURITY;

-- SELECT policy: user can read own row. Mirrors the previous
-- otp_session_verifications_select_owner policy. Required because
-- AuthProvider.checkOtpForUser reads the row client-side via the user's JWT.
CREATE POLICY "otp_user_verifications_select_owner"
ON public.otp_user_verifications
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policies: writes are restricted to service_role
-- (verify-otp edge function) and to the SECURITY DEFINER RPC
-- delete_my_otp_verification. Aligns with the access pattern of the other
-- OTP tables (otp_challenges).

-- ---------------------------------------------------------------------------
-- 2. Data migration: latest verified_at per user → +30 days expiry
-- ---------------------------------------------------------------------------
INSERT INTO public.otp_user_verifications (user_id, verified_at, expires_at)
SELECT DISTINCT ON (user_id)
    user_id,
    verified_at,
    verified_at + interval '30 days'
FROM public.otp_session_verifications
ORDER BY user_id, verified_at DESC;

-- ---------------------------------------------------------------------------
-- 3. RPC for client-side invalidation on SIGNED_OUT
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_my_otp_verification()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'P0001';
    END IF;

    DELETE FROM public.otp_user_verifications WHERE user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_otp_verification() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_my_otp_verification() TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Update purge_user_data: now points to new table
--     (the GDPR purge edge function calls this; old table is about to be dropped)
-- ---------------------------------------------------------------------------
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

    UPDATE public.tenant_memberships
    SET invited_by = NULL
    WHERE invited_by = p_user_id;
    GET DIAGNOSTICS v_invited_by_cleared = ROW_COUNT;

    DELETE FROM public.otp_user_verifications
    WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_otp_deleted = ROW_COUNT;

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

-- ---------------------------------------------------------------------------
-- 5. Drop old table (policies cascade automatically)
-- ---------------------------------------------------------------------------
DROP TABLE public.otp_session_verifications;

COMMIT;
