-- Fix: waitlist PII leak — authenticated_select_waitlist had qual=true,
-- allowing ANY authenticated user to read ALL waitlist emails.
-- waitlist is admin-only data; writes go through join-waitlist edge function
-- (service_role), which bypasses RLS and is unaffected by this change.

DROP POLICY IF EXISTS authenticated_select_waitlist ON public.waitlist;
