-- Audit log per ogni invocazione di send-otp.
-- Persiste session_id rotazione e contesto di richiesta per indagare
-- email OTP non richieste.
--
-- Pattern allineato a otp_challenges: RLS abilitato senza policy, accesso
-- esclusivo via service_role dalla edge function.

CREATE TABLE public.otp_send_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    auth_user_id UUID NOT NULL,
    jwt_session_id TEXT,
    latest_known_session_id_for_user TEXT,
    session_id_rotated BOOLEAN,
    expected_session_match BOOLEAN,
    request_ip TEXT,
    user_agent TEXT,
    caller_origin TEXT,
    triggered_by TEXT NOT NULL DEFAULT 'verify_otp_page_mount',
    outcome TEXT NOT NULL,
    cooldown_remaining_ms INT,
    send_count_in_window INT
);

CREATE INDEX idx_otp_send_audit_user_created
    ON public.otp_send_audit(auth_user_id, created_at DESC);

CREATE INDEX idx_otp_send_audit_rotated
    ON public.otp_send_audit(session_id_rotated)
    WHERE session_id_rotated = true;

ALTER TABLE public.otp_send_audit ENABLE ROW LEVEL SECURITY;
-- Nessuna policy: solo service_role legge/scrive (stesso pattern di otp_challenges).
