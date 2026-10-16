-- Grant di claim_pending_notification_emails (file separato, regola 42601).
REVOKE ALL ON FUNCTION public.claim_pending_notification_emails(INTEGER, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_pending_notification_emails(INTEGER, INTEGER, INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pending_notification_emails(INTEGER, INTEGER, INTEGER) TO service_role;
