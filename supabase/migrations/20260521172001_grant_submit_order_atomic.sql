-- =========================================
-- ORDERS EPIC — Phase 2.5a: grants for submit_order_atomic
-- =========================================
-- Companion to migration 20260521172000 (CREATE FUNCTION). Split into a
-- separate file because Supabase CLI `db push` fails with "cannot insert
-- multiple commands into a prepared statement" when the CREATE FUNCTION
-- body is followed by multiple REVOKE/GRANT statements in the same file.
--
-- Pattern strict service-role-only (CLAUDE.md → "Funzioni SQL →
-- SECURITY DEFINER service-role-only"):
--   - REVOKE FROM PUBLIC removes the implicit Postgres grant.
--   - REVOKE FROM anon and authenticated are required because Supabase
--     pre-configures ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT
--     EXECUTE ON FUNCTIONS TO anon, authenticated, service_role at
--     project bootstrap; the named grants survive REVOKE FROM PUBLIC.
--   - GRANT TO service_role re-affirms the only intended access path
--     (Edge Functions calling via supabase-js with service_role key).
--
-- Mirrors the hardening applied to `increment_rate_limit` in migration
-- 20260520220349_harden_increment_rate_limit_grants.sql.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.submit_order_atomic(
    uuid, uuid, uuid, uuid, text, uuid, numeric, text, jsonb, uuid
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_order_atomic(
    uuid, uuid, uuid, uuid, text, uuid, numeric, text, jsonb, uuid
) FROM anon;
REVOKE EXECUTE ON FUNCTION public.submit_order_atomic(
    uuid, uuid, uuid, uuid, text, uuid, numeric, text, jsonb, uuid
) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.submit_order_atomic(
    uuid, uuid, uuid, uuid, text, uuid, numeric, text, jsonb, uuid
) TO service_role;
COMMIT;
