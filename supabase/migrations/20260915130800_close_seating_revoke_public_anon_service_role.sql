-- =============================================================================
-- ACL close_seating(uuid, text, text) (9/14): REVOKE da PUBLIC, anon, service_role
-- =============================================================================
-- Nuova firma → Supabase pre-concede EXECUTE ad anon/authenticated/
-- service_role. Si azzera come in 20260911130500 + 130600; il GRANT ad
-- authenticated è in 20260915130900. Il gate reale resta `has_permission`.

REVOKE ALL ON FUNCTION public.close_seating(uuid, text, text)
FROM PUBLIC, anon, service_role;
