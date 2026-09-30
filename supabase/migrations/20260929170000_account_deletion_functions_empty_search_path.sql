-- =============================================================================
-- Account deletion chain: SET search_path TO '' on the three SECURITY DEFINER
-- functions (was 'public').
-- =============================================================================
--
-- Project rule: SECURITY DEFINER with search_path '' and qualified names.
-- execute_account_deletion_tenant_ops (callable by authenticated) and the two
-- functions it reaches, transfer_ownership and mark_account_deleted, still had
-- search_path 'public'.
--
-- ALTER, not CREATE OR REPLACE: body, SECURITY DEFINER and ACL stay as they
-- are. Checked on the live bodies (staging and production identical, 2026-09-29,
-- md5(prosrc) ab6eaf0e… / d4ee87f9… / 8c766861…): every table and function
-- reference is already qualified (public.*, auth.uid()); the rest are
-- pg_catalog built-ins (now, unnest, jsonb_*, array_*), always resolved.
-- =============================================================================

ALTER FUNCTION public.execute_account_deletion_tenant_ops(jsonb) SET search_path TO '';
ALTER FUNCTION public.transfer_ownership(uuid, uuid) SET search_path TO '';
ALTER FUNCTION public.mark_account_deleted(uuid) SET search_path TO '';
