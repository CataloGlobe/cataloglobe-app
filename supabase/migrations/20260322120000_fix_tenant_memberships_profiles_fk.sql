-- =============================================================================
-- Fix: add FK tenant_memberships.user_id → public.profiles(id)
--
-- Context:
--   The existing FK (tenant_memberships_user_id_fkey) points to auth.users(id).
--   PostgREST cannot resolve implicit joins through auth.users because it is
--   not in the public schema.  Adding a separate FK to public.profiles(id)
--   exposes the relationship so PostgREST can resolve:
--     tenant_memberships?select=user_id,profiles(first_name,last_name)
--
--   v2_tenant_memberships was renamed to tenant_memberships in migration
--   20260317120000_rename_v2_tables.sql, so only tenant_memberships is patched.
--
-- Idempotent: the DO block checks for the constraint before adding it.
-- Safe: does not touch or drop any existing constraint.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  -- tenant_memberships.user_id → public.profiles(id)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tenant_memberships'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'tenant_memberships_user_id_profiles_fkey'
      AND t.relname = 'tenant_memberships'
  ) THEN
    ALTER TABLE public.tenant_memberships
      ADD CONSTRAINT tenant_memberships_user_id_profiles_fkey
      FOREIGN KEY (user_id)
      REFERENCES public.profiles(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- Reload PostgREST schema cache so the new relationship is visible immediately.
NOTIFY pgrst, 'reload schema';

COMMIT;
