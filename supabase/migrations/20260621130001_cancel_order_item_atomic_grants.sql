-- ============================================================
-- Grants for cancel_order_item_atomic — service-role-only
-- (CLAUDE.md SECURITY DEFINER pattern).
--
-- Split out of 20260621130000 (the CREATE OR REPLACE FUNCTION): keeping
-- CREATE FUNCTION + REVOKE/GRANT in one file makes `supabase db push` fail
-- with SQLSTATE 42601. Two consecutive files push cleanly on staging + prod.
--
-- REVOKE FROM PUBLIC alone is insufficient on Supabase: project bootstrap
-- runs ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon,
-- authenticated, service_role on schema public. Explicit REVOKEs from
-- anon and authenticated are required to actually strip those grants.
-- ============================================================

DO $$
BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.cancel_order_item_atomic(uuid, uuid, text) FROM PUBLIC';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.cancel_order_item_atomic(uuid, uuid, text) FROM anon';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.cancel_order_item_atomic(uuid, uuid, text) FROM authenticated';
  EXECUTE 'GRANT  EXECUTE ON FUNCTION public.cancel_order_item_atomic(uuid, uuid, text) TO service_role';
END
$$;
