-- Aggiunge colonna navigation_type a otp_send_audit per indagare
-- email OTP non richieste post-standby (hypothesis: tab-discard /
-- soft reload del browser al wake → AuthProvider re-bootstrap →
-- query a otp_user_verifications fallisce per rete non pronta →
-- redirect a /verify-otp → mount → send-otp).
--
-- Valori attesi: "navigate" | "reload" | "back_forward" | "prerender" | NULL
-- (corrispondono a PerformanceNavigationTiming.type sul client.)

ALTER TABLE public.otp_send_audit
    ADD COLUMN navigation_type TEXT;
