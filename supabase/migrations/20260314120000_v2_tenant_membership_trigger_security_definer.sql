BEGIN;

-- =========================================================
-- Fix: make handle_new_tenant_membership SECURITY DEFINER
-- =========================================================
--
-- The trigger previously ran as the calling authenticated user.
-- This created a complex RLS chain:
--   INSERT v2_tenant_memberships
--     → WITH CHECK queries v2_tenants
--       → v2_tenants SELECT policy calls get_my_tenant_ids()
--         → get_my_tenant_ids() (SECURITY DEFINER) queries v2_tenants again
-- In edge cases this chain fails and the error surfaces as
-- "new row violates row-level security policy for table v2_tenants".
--
-- Fix: run the function as postgres (SECURITY DEFINER) which bypasses RLS,
-- same as the sibling trigger handle_new_tenant_system_group().
-- =========================================================

CREATE OR REPLACE FUNCTION public.handle_new_tenant_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.v2_tenant_memberships (
    tenant_id,
    user_id,
    role,
    status
  ) VALUES (
    NEW.id,
    NEW.owner_user_id,
    'owner',
    'active'
  )
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

COMMIT;
