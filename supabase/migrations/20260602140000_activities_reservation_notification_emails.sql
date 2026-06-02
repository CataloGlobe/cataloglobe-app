-- 20260602140000_activities_reservation_notification_emails.sql
--
-- Per-site list of recipients for the venue alert email sent by the
-- submit-reservation Edge Function. Replaces email_public as the alert
-- source. When the list is empty, submit-reservation falls back to the
-- tenant owner's email (via tenants.owner_user_id -> auth.users).
--
-- No RLS changes required: `activities` is already tenant-scoped via the
-- existing policies and the Edge Function reads with service_role.
-- No CHECK constraint: per-element format validation is enforced in the
-- frontend; a regex check on a text[] is heavy and offers limited value.

ALTER TABLE public.activities
    ADD COLUMN reservation_notification_emails text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.activities.reservation_notification_emails IS
    'Lista di email destinatarie degli avvisi nuova prenotazione per questa sede. '
    'Sostituisce email_public come sorgente per submit-reservation venue alert. '
    'Quando vuota, l''Edge function ricade sull''email dell''owner del tenant.';
