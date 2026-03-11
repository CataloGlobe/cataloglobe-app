BEGIN;

-- Enable Row Level Security
ALTER TABLE public.otp_session_verifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'otp_session_verifications'
      AND policyname = 'otp_session_verifications_select_owner'
  ) THEN
    CREATE POLICY "otp_session_verifications_select_owner"
    ON public.otp_session_verifications
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'otp_session_verifications'
      AND policyname = 'otp_session_verifications_delete_owner'
  ) THEN
    CREATE POLICY "otp_session_verifications_delete_owner"
    ON public.otp_session_verifications
    FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());
  END IF;
END $$;

COMMIT;
