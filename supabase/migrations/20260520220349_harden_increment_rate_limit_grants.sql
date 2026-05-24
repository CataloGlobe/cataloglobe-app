-- =========================================
-- ORDERS EPIC — Phase 2.3c: harden increment_rate_limit grants
-- =========================================
-- Closes a privilege-escalation gap discovered by empirical testing
-- after migration 20260520215107 (create_increment_rate_limit_rpc) was
-- applied to staging.
--
-- What happened:
--   The original migration ended with
--       REVOKE EXECUTE ... FROM PUBLIC;
--       GRANT  EXECUTE ... TO service_role;
--   Expected effective grants: {postgres, service_role}.
--   Actual effective grants:   {anon, authenticated, postgres, service_role}.
--
--   Confirming attack (rolled back), executed as `anon`:
--       SET LOCAL role anon;
--       SELECT public.increment_rate_limit('attack:test', now());
--       -- returned 1 instead of "permission denied for function"
--
-- Why REVOKE FROM PUBLIC is insufficient on Supabase:
--   Supabase pre-configures
--       ALTER DEFAULT PRIVILEGES IN SCHEMA public
--           GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
--   at project bootstrap. Every new function in schema `public` therefore
--   ships with explicit grants to anon and authenticated. `REVOKE FROM
--   PUBLIC` strips only the PUBLIC pseudo-role, never the named roles.
--   Combined with SECURITY DEFINER, an anon caller would execute the
--   function with the owner's identity, bypass RLS, and freely mutate
--   `public.rate_limit_buckets` — letting attackers lock out victims,
--   DoS the table, or inflate their own counters to evade limits.
--
-- Fix: REVOKE EXECUTE explicitly from `anon` and `authenticated`. The
-- additional REVOKE FROM PUBLIC and GRANT TO service_role are
-- belt-and-suspenders restatements: redundant after the original
-- migration, but cheap and protective against future drift if Supabase
-- changes its default-privilege defaults again.

BEGIN;

-- Strip the default-privilege grants Supabase auto-applies to client roles.
REVOKE EXECUTE ON FUNCTION public.increment_rate_limit(text, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_rate_limit(text, timestamptz) FROM authenticated;

-- Re-revoke from PUBLIC (idempotent; protects against future regrants).
REVOKE EXECUTE ON FUNCTION public.increment_rate_limit(text, timestamptz) FROM PUBLIC;

-- Re-affirm the only intended grant.
GRANT EXECUTE ON FUNCTION public.increment_rate_limit(text, timestamptz) TO service_role;

COMMIT;
