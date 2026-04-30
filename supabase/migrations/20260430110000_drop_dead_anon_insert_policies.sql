-- =============================================================================
-- PR5: Drop 2 dead RLS policies always_true
-- =============================================================================
-- Le 2 policy permettevano INSERT da anon con WITH CHECK (true). Nessun
-- codice client le usa — gli INSERT veri passano via Edge Functions con
-- service_role (submit-review, join-waitlist), che bypassano RLS.
--
-- Risolve 2 warning Security Advisor "rls_policy_always_true".
--
-- Le altre policy su reviews e waitlist (SELECT, INSERT authenticated con
-- tenant scope, ecc.) restano invariate.
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS "reviews_insert_anon" ON public.reviews;
DROP POLICY IF EXISTS "anon_insert_waitlist" ON public.waitlist;

COMMIT;
