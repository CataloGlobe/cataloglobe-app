-- =========================================
-- ORDERS EPIC — Phase 1.3: customer_sessions + JWT helper
-- =========================================
-- One row per "phone identity" of a guest at a venue. Created when the
-- guest first scans a table QR code, persisted in the client's
-- localStorage as `customer_session_id`, valid for `expires_at - now()`
-- (default TTL 12h, refreshed on activity).
--
-- The session follows the guest across tables (`current_table_id` may
-- change), but historical `orders` remain bound to their original table
-- for immutability (FK from `orders.table_id` defined in a later task).
--
-- Linkage:
--   - `order_group_id` NULL  → "split bill" (guest orders separately).
--   - `order_group_id` set   → "shared bill" (joined an open group on the table).
--   - `current_table_id` NULL → tolerated transient state (e.g. table soft-deleted).
--
-- Notes:
--   - Only tenant-scoped (authenticated/admin) RLS policies are created here.
--     Anon-side policies (guest with custom JWT) come in task 1.7, together
--     with the matching policies on `orders` / `order_items`.
--   - The `get_jwt_customer_session_id()` helper is created here so it is
--     available for the anon policies introduced later. It is granted to
--     `anon` because the guest client authenticates as `anon` while
--     carrying a custom-signed JWT containing the `customer_session_id` claim.
--   - Trigger reuses the existing `public.set_updated_at()` helper.

BEGIN;

CREATE TABLE IF NOT EXISTS public.customer_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  current_table_id uuid REFERENCES public.tables(id) ON DELETE SET NULL,
  order_group_id uuid REFERENCES public.order_groups(id) ON DELETE SET NULL,
  customer_name text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tenant + activity lookup (admin list view).
CREATE INDEX IF NOT EXISTS idx_customer_sessions_tenant_activity
  ON public.customer_sessions (tenant_id, activity_id);

-- Per-table lookup ("who is currently sitting at this table?").
CREATE INDEX IF NOT EXISTS idx_customer_sessions_table
  ON public.customer_sessions (current_table_id)
  WHERE current_table_id IS NOT NULL;

-- TTL sweep (pg_cron purge job introduced in task 1.10).
CREATE INDEX IF NOT EXISTS idx_customer_sessions_expires
  ON public.customer_sessions (expires_at);

-- Per-group lookup (members of a shared bill).
CREATE INDEX IF NOT EXISTS idx_customer_sessions_group
  ON public.customer_sessions (order_group_id)
  WHERE order_group_id IS NOT NULL;

-- Keep updated_at in sync (reuses existing helper).
DROP TRIGGER IF EXISTS customer_sessions_set_updated_at ON public.customer_sessions;
CREATE TRIGGER customer_sessions_set_updated_at
  BEFORE UPDATE ON public.customer_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- RLS — tenant-scoped (admin only)
-- =========================================
-- Anon (guest) policies are deliberately deferred to task 1.7, where they
-- will be introduced together with the matching policies on `orders` and
-- `order_items`, using `public.get_jwt_customer_session_id()` defined below.
ALTER TABLE public.customer_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant select own rows" ON public.customer_sessions;
CREATE POLICY "Tenant select own rows"
ON public.customer_sessions
FOR SELECT
TO authenticated
USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

DROP POLICY IF EXISTS "Tenant insert own rows" ON public.customer_sessions;
CREATE POLICY "Tenant insert own rows"
ON public.customer_sessions
FOR INSERT
TO authenticated
WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

DROP POLICY IF EXISTS "Tenant update own rows" ON public.customer_sessions;
CREATE POLICY "Tenant update own rows"
ON public.customer_sessions
FOR UPDATE
TO authenticated
USING (tenant_id IN (SELECT public.get_my_tenant_ids()))
WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

DROP POLICY IF EXISTS "Tenant delete own rows" ON public.customer_sessions;
CREATE POLICY "Tenant delete own rows"
ON public.customer_sessions
FOR DELETE
TO authenticated
USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

-- =========================================
-- Helper function: get_jwt_customer_session_id
-- =========================================
-- Extracts the `customer_session_id` claim from the current JWT.
-- Returns NULL when the claim is absent or empty (no exception raised).
--
--   - STABLE: same value within a single query execution.
--   - SECURITY INVOKER: runs with the caller's privileges (safe for RLS).
--   - SET search_path TO '': stretto hardening (CLAUDE.md), body usa solo
--     identificatori da pg_catalog (sempre accessibile).
--   - current_setting(..., true): the second arg suppresses the "missing var"
--     error and returns NULL instead.
--   - NULLIF(..., ''): guards against the claim being present-but-empty.
CREATE OR REPLACE FUNCTION public.get_jwt_customer_session_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::jsonb ->> 'customer_session_id',
    ''
  )::uuid;
$$;

-- Revoke implicit PUBLIC grant before granting to the specific role we need.
REVOKE EXECUTE ON FUNCTION public.get_jwt_customer_session_id() FROM PUBLIC;

-- The guest client authenticates as `anon` while carrying a custom-signed JWT.
-- No other role needs to execute this helper.
GRANT EXECUTE ON FUNCTION public.get_jwt_customer_session_id() TO anon;

COMMIT;
